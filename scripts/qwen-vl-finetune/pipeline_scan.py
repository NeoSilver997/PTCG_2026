#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Multi-Card Scan Pipeline
==============================
Combines the two-stage Ollama detection pipeline with the fast finetuned
inference service to scan one or many images for Pokemon cards.

Flow:
  Stage 1  glm-ocr (Ollama)       → detect card count + bounding boxes
  Stage 2  /api/cards/batch-extract → extract all crops in one GPU call

Why batch?  The finetuned BnB 4-bit model is 6.7x faster per card at
batch=9 (4.2 s/card) vs sequential (28 s/card).  Stage 1 detection is
kept as-is from pipeline_two_stage.py.

Usage:
  # Scan an entire image directory
  python pipeline_scan.py --image-dir "C:/path/to/photos"

  # Scan a single photo (may contain multiple cards)
  python pipeline_scan.py --image "photo.jpg"

  # Skip detection (assume 1 card per image, fastest mode)
  python pipeline_scan.py --image-dir "C:/path" --no-detect

  # Custom service URL
  python pipeline_scan.py --image-dir "C:/path" --service-url http://localhost:8000

Output:
  benchmarks/scan/scan_results_<timestamp>.json
  benchmarks/scan/report_<timestamp>.html
"""

import argparse
import base64
import json
import os
import re
import sys
import time
import html as html_lib
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    print("ERROR: pip install requests")
    sys.exit(1)

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("ERROR: pip install Pillow")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config defaults
# ---------------------------------------------------------------------------

OLLAMA_BASE_URL   = "http://127.0.0.1:11434"
SERVICE_BASE_URL  = "http://127.0.0.1:8000"
DETECT_MODEL      = "glm-ocr:latest"
DEFAULT_IMAGE_DIR = r"C:\AI_Server\Coding\PTCG_2026\data\test_sample"
MAX_BATCH_SIZE    = 9        # sweet-spot for RTX 5070 Ti (4.2 s/card)
MAX_PX_DETECT     = 1600     # pixels for detection stage (longer side)
MAX_PX_EXTRACT    = 1024     # pixels for extraction crops
MAX_PX_THUMB      = 320      # pixels for HTML thumbnails
SUPPORTED_EXT     = {".jpg", ".jpeg", ".png", ".webp"}

# ---------------------------------------------------------------------------
# Detection prompt (copied from pipeline_two_stage.py)
# ---------------------------------------------------------------------------

DETECT_PROMPT = (
    "Carefully inspect every part of this image.\n"
    "Count exactly how many individual Pokemon TCG cards are visible (including partially visible ones).\n"
    "A single photo can contain MULTIPLE cards laid side-by-side, stacked, or in a grid.\n"
    "For each card, estimate its bounding box as percentages and read its printed name and number.\n\n"
    "Return ONLY this JSON (no other text):\n"
    '{"count":<n>,"cards":[{"id":1,"bbox_pct":[left%,top%,right%,bottom%],'
    '"hint_name":"card name or empty","hint_code":"card number or empty"}]}\n\n'
    "Rules:\n"
    "- bbox_pct integers 0-100\n"
    "- If only one card fills the whole image: bbox_pct=[0,0,100,100]\n"
    "- If multiple cards, give correct separate bbox for EACH card\n"
    "- No Pokemon cards visible: {\"count\":0,\"cards\":[]}\n"
    "Output ONLY the JSON."
)

# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def get_image_paths(image_dir: str) -> list[tuple[str, str]]:
    return [
        (p.name, str(p))
        for p in sorted(Path(image_dir).iterdir())
        if p.suffix.lower() in SUPPORTED_EXT
    ]


def load_image(path: str) -> Optional[Image.Image]:
    try:
        img = Image.open(path)
        if img.mode in ("RGBA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            src = img.convert("RGBA")
            bg.paste(src, mask=src.split()[3])
            return bg
        return img.convert("RGB")
    except Exception as e:
        print(f"  WARNING: Cannot load {path}: {e}")
        return None


def to_b64(img: Image.Image, max_px: int, quality: int = 88) -> str:
    out = img.copy()
    if max(out.size) > max_px:
        out.thumbnail((max_px, max_px), Image.LANCZOS)
    buf = BytesIO()
    out.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def crop_card(img: Image.Image, bbox_pct: list, padding: float = 1.0) -> Image.Image:
    w, h = img.size
    l = max(0, int((bbox_pct[0] - padding) / 100 * w))
    t = max(0, int((bbox_pct[1] - padding) / 100 * h))
    r = min(w, int((bbox_pct[2] + padding) / 100 * w))
    b = min(h, int((bbox_pct[3] + padding) / 100 * h))
    return img.crop((l, t, r, b))


def draw_boxes(img: Image.Image, cards: list) -> Image.Image:
    out  = img.copy()
    draw = ImageDraw.Draw(out)
    w, h = img.size
    colors = ["#FF3333", "#33BB33", "#3388FF", "#FF8800", "#CC00CC"]
    for i, card in enumerate(cards):
        bp  = card.get("bbox_pct", [0, 0, 100, 100])
        l, t = int(bp[0]/100*w), int(bp[1]/100*h)
        r, b = int(bp[2]/100*w), int(bp[3]/100*h)
        col  = colors[i % len(colors)]
        lw   = max(3, w // 150)
        draw.rectangle([l, t, r, b], outline=col, width=lw)
        label = f"Card {card.get('id', i+1)}"
        draw.rectangle([l, t, l + len(label)*8 + 8, t + 20], fill=col)
        draw.text((l + 4, t + 2), label, fill="white")
    return out


def lang_hint_from_filename(label: str) -> str:
    n = label.lower()
    if n.startswith("hk"):   return "zh-HK"
    if n.startswith("jp"):   return "ja-JP"
    return ""


def crop_grid(img: Image.Image, cols: int, rows: int,
              overlap: float = 5.0) -> list[tuple[list[int], Image.Image]]:
    """
    Split image into a cols×rows grid with optional overlap on all sides.
    overlap = percentage of the cell dimension to add as margin (default 5%).
    The reported bbox_pct is the *logical* cell boundary (no overlap),
    but the returned crop includes the extra margin so the model can see
    type icons / text that would otherwise be cut at the cell edge.
    Returns [(bbox_pct, crop_img), ...].
    """
    w, h = img.size
    cell_w = w // cols
    cell_h = h // rows
    pad_x = int(cell_w * overlap / 100)
    pad_y = int(cell_h * overlap / 100)
    results = []
    for r in range(rows):
        for c in range(cols):
            # Logical (bbox) boundaries
            x0_l = c * cell_w
            y0_l = r * cell_h
            x1_l = w if c == cols - 1 else (c + 1) * cell_w
            y1_l = h if r == rows - 1 else (r + 1) * cell_h
            # Physical crop boundaries (with padding, clamped to image)
            x0 = max(0, x0_l - pad_x)
            y0 = max(0, y0_l - pad_y)
            x1 = min(w, x1_l + pad_x)
            y1 = min(h, y1_l + pad_y)
            bbox_pct = [
                round(x0_l / w * 100),
                round(y0_l / h * 100),
                round(x1_l / w * 100),
                round(y1_l / h * 100),
            ]
            results.append((bbox_pct, img.crop((x0, y0, x1, y1))))
    return results

def auto_count_cards(img: Image.Image,
                     hint_count: int = 0) -> tuple[int, int]:
    """
    Detect card count and grid layout (cols × rows) from image content.

    Priority:
      1. hint_count > 0  → user told us exactly how many cards (uses image
         orientation to determine cols × rows automatically).
      2. OpenCV contour detection: finds large card-shaped rectangles.
      3. Projection valleys: counts clear vertical dividers between columns.
      4. Aspect-ratio fallback.

    PTCG card size: 63.5 × 88.9 mm → W/H ≈ 0.714 (portrait).
    Returns (cols, rows).
    """
    CARD_RATIO   = 63.5 / 88.9   # ≈ 0.714 portrait
    RATIO_TOL    = 0.30           # ±30% tolerance on card aspect ratio
    MIN_AREA_PCT = 0.04           # contour must cover ≥ 4% of image area

    iw, ih = img.size
    img_ratio = iw / ih

    # ── Fallback: pure aspect-ratio estimate ───────────────────────────────
    def _ratio_fallback() -> tuple[int, int]:
        if img_ratio >= CARD_RATIO * 0.85:
            c = max(1, round(img_ratio / CARD_RATIO))
            expected_h = iw / c / CARD_RATIO
            r = max(1, round(ih / expected_h))
        else:
            r = max(1, round(CARD_RATIO / img_ratio))
            c = 1
        return c, r

    # ── 0. User-supplied count ─────────────────────────────────────────────
    if hint_count > 0:
        n = hint_count
        # Lay out as cols × rows matching image orientation
        if img_ratio >= 1.0:
            # Landscape: prefer multiple columns in one row
            # Find the column/row split that best matches image ratio
            best, best_err = (n, 1), float('inf')
            for c in range(1, n + 1):
                if n % c != 0:
                    continue
                r = n // c
                err = abs((c / r) - img_ratio)
                if err < best_err:
                    best_err, best = err, (c, r)
            cols, rows = best
        else:
            # Portrait: prefer multiple rows in one column
            cols, rows = 1, n
        print(f"  │  (auto-grid) user count={n} + image={iw}×{ih} → {cols}×{rows}")
        return cols, rows

    # ── 1. OpenCV contour detection (works best when cards have background gap)
    cv2_cols, cv2_rows = 0, 0
    try:
        import cv2
        import numpy as np

        thumb = img.copy()
        thumb.thumbnail((640, 640), Image.LANCZOS)
        tw, th = thumb.size
        bgr  = cv2.cvtColor(np.array(thumb.convert("RGB")), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

        img_area = tw * th
        min_area = img_area * MIN_AREA_PCT
        card_centres: list[tuple[float, float]] = []

        # Try multiple binary thresholds + contour detection
        for thresh_val in [None, 60, 100, 140]:   # None = Otsu
            if thresh_val is None:
                _, binary = cv2.threshold(gray, 0, 255,
                                          cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            else:
                _, binary = cv2.threshold(gray, thresh_val, 255, cv2.THRESH_BINARY)
            big_k = cv2.getStructuringElement(
                cv2.MORPH_RECT, (max(5, tw // 18), max(5, th // 18)))
            closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, big_k, iterations=3)
            conts, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL,
                                         cv2.CHAIN_APPROX_SIMPLE)
            found: list[tuple[float, float]] = []
            for cnt in conts:
                if cv2.contourArea(cnt) < min_area:
                    continue
                x, y, w, h = cv2.boundingRect(cnt)
                if h == 0:
                    continue
                if abs(w / h - CARD_RATIO) / CARD_RATIO <= RATIO_TOL:
                    found.append((x + w / 2, y + h / 2))
            if len(found) > len(card_centres):
                card_centres = found

        if len(card_centres) >= 2:
            def _unique_bins(vals: list[float], total: int,
                             gap_pct: float = 0.10) -> int:
                s = sorted(vals)
                bins, gap = [s[0]], total * gap_pct
                for v in s[1:]:
                    if v - bins[-1] > gap:
                        bins.append(v)
                return len(bins)
            cv2_cols = min(6, _unique_bins([x for x, _ in card_centres], tw))
            cv2_rows = min(4, _unique_bins([y for _, y in card_centres], th))
            print(f"  │  (auto-grid/cv2) {len(card_centres)} card region(s) → {cv2_cols}×{cv2_rows}")
        elif len(card_centres) == 1:
            cv2_cols, cv2_rows = 1, 1
            print(f"  │  (auto-grid/cv2) 1 card region found")
        else:
            print(f"  │  (auto-grid/cv2) 0 card regions – trying projection")

    except ImportError:
        print(f"  │  (auto-grid) cv2 not installed, using projection")
    except Exception as e:
        print(f"  │  (auto-grid/cv2) error: {e}")

    # ── 2. Projection-based column detection (works even when cards fill frame)
    # Count clear vertical dividers by finding valleys in horizontal edge profile
    proj_cols = 0
    try:
        import numpy as np

        thumb2 = img.copy()
        thumb2.thumbnail((640, 640), Image.LANCZOS)
        tw2, th2 = thumb2.size
        gray2 = np.array(thumb2.convert("L"), dtype=np.float32)

        # Horizontal edge strength → column dividers appear as valleys
        dx = np.abs(np.diff(gray2, axis=1)).mean(axis=0)   # shape (tw2-1,)
        ks = max(5, tw2 // 20)
        smooth = np.convolve(dx, np.ones(ks) / ks, mode="same")

        # Find all local minima inside image (ignore 12% margins)
        margin = int(tw2 * 0.12)
        med = float(np.median(smooth))
        min_gap = int(tw2 * 0.15)   # cards must be ≥ 15% of width apart
        threshold = med * 0.72       # valley must be at least 28% below median

        minima = []
        for i in range(1, tw2 - 2):
            if i < margin or i > tw2 - margin:
                continue
            if smooth[i] <= smooth[i-1] and smooth[i] <= smooth[i+1]:
                if smooth[i] < threshold:
                    minima.append((i, float(smooth[i])))

        # Keep only well-separated minima
        filtered = []
        for pos, val in sorted(minima, key=lambda x: x[1]):
            if not filtered or all(abs(pos - p) > min_gap for p, _ in filtered):
                filtered.append((pos, val))

        proj_cols = len(filtered) + 1   # N valleys → N+1 columns
        proj_cols = max(1, min(6, proj_cols))
        print(f"  │  (auto-grid/proj) {len(filtered)} valley(s) found → {proj_cols} col(s)")

    except Exception as e:
        print(f"  │  (auto-grid/proj) error: {e}")

    # ── 3. Combine results: prefer cv2 contours, else projection, else ratio
    ratio_cols, ratio_rows = _ratio_fallback()

    if cv2_cols >= 1 and cv2_rows >= 1:
        cols, rows = cv2_cols, cv2_rows
    elif proj_cols >= 2:           # projection found multiple columns
        cols = proj_cols
        # rows from ratio (projection rows is unreliable)
        _, rows = _ratio_fallback()
        rows = max(1, round(ih / (iw / cols / CARD_RATIO)))
    else:
        cols, rows = ratio_cols, ratio_rows

    print(f"  │  (auto-grid) final: {cols}×{rows}")
    return cols, rows

# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------

def strip_thinking(text: str) -> str:
    return re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()


def parse_json_text(text: str) -> Optional[dict]:
    for cand in [strip_thinking(text), text]:
        try:
            return json.loads(cand)
        except Exception:
            pass
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cand)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
        s = cand.find("{"); e = cand.rfind("}") + 1
        if s >= 0 and e > s:
            try:
                return json.loads(cand[s:e])
            except Exception:
                pass
    return None

# ---------------------------------------------------------------------------
# Stage 1: Ollama detection
# ---------------------------------------------------------------------------

def ollama_infer(model: str, prompt: str, b64: str,
                 timeout: int, base_url: str) -> tuple[str, float]:
    payload = {
        "model": model, "prompt": prompt, "images": [b64],
        "stream": False, "think": False,
        "options": {"temperature": 0.1, "num_predict": 512},
    }
    t0 = time.time()
    try:
        r = requests.post(f"{base_url}/api/generate", json=payload, timeout=timeout)
        r.raise_for_status()
        d = r.json()
        text = d.get("response", "").strip()
        return text, time.time() - t0
    except requests.exceptions.Timeout:
        return "Error: timeout", time.time() - t0
    except Exception as ex:
        return f"Error: {ex}", time.time() - t0


def _fallback_detection() -> dict:
    return {"count": 1, "cards": [
        {"id": 1, "bbox_pct": [0, 0, 100, 100], "hint_name": "", "hint_code": ""}
    ]}


def stage1_detect(img: Image.Image, args) -> tuple[dict, float, str]:
    raw, elapsed = ollama_infer(
        args.detect_model, DETECT_PROMPT,
        to_b64(img, MAX_PX_DETECT),
        args.timeout_detect, args.ollama_url,
    )
    if raw.startswith("Error:"):
        return _fallback_detection(), elapsed, raw
    parsed = parse_json_text(raw)
    if parsed and "count" in parsed and "cards" in parsed:
        for c in parsed["cards"]:
            bp = c.get("bbox_pct", [0, 0, 100, 100])
            c["bbox_pct"] = [max(0, min(100, int(v))) for v in bp]
            c.setdefault("hint_name", "")
            c.setdefault("hint_code", "")
        return parsed, elapsed, raw
    return _fallback_detection(), elapsed, raw

# ---------------------------------------------------------------------------
# Stage 2: Finetuned service batch extraction
# ---------------------------------------------------------------------------

def service_batch_extract(
    crops: list[Image.Image],
    service_url: str,
    language: str = "en-US",
    timeout: int = 120,
) -> list[dict]:
    """
    Send up to MAX_BATCH_SIZE crops to the finetuned inference service.
    Returns list of ExtractionResponse dicts (same order as crops).
    Falls back to sequential single-image calls if batch endpoint fails.
    """
    b64_images = [to_b64(img, MAX_PX_EXTRACT) for img in crops]
    t0 = time.time()
    try:
        resp = requests.post(
            f"{service_url}/api/cards/batch-extract",
            json={"images": b64_images},
            params={"language": language},
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        elapsed = time.time() - t0
        results = data.get("results", [])
        print(f"      batch-extract: {len(crops)} cards in {elapsed:.1f}s "
              f"({elapsed/len(crops):.1f}s/card)")
        return results
    except Exception as e:
        print(f"      batch-extract ERROR: {e} → falling back to sequential")
    # Sequential fallback
    results = []
    for img in crops:
        try:
            resp = requests.post(
                f"{service_url}/api/cards/extract-from-base64",
                data={"image_base64": to_b64(img, MAX_PX_EXTRACT), "language": language},
                timeout=60,
            )
            resp.raise_for_status()
            results.append(resp.json())
        except Exception as e:
            results.append({"success": False, "confidence": 0.0,
                            "inference_time_ms": 0.0, "error": str(e)})
    return results

# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

class CardRecord:
    """Holds everything about one detected card crop."""
    __slots__ = ("image_label", "image_path", "card_id", "bbox_pct",
                 "hint_name", "hint_code", "lang_hint",
                 "crop", "s1_time", "extraction")

    def __init__(self, image_label, image_path, card_id, bbox_pct,
                 hint_name, hint_code, lang_hint, crop, s1_time):
        self.image_label = image_label
        self.image_path  = image_path
        self.card_id     = card_id
        self.bbox_pct    = bbox_pct
        self.hint_name   = hint_name
        self.hint_code   = hint_code
        self.lang_hint   = lang_hint
        self.crop        = crop
        self.s1_time     = s1_time
        self.extraction  = None   # filled after batch-extract


def collect_crops(images: list[tuple[str, str]], args) -> list[CardRecord]:
    """
    Stage 1 pass: detect card regions in every image and build crop records.
    """
    records: list[CardRecord] = []

    for label, path in images:
        print(f"\n  ┌─ {label}")
        img = load_image(path)
        if img is None:
            print(f"  └─ SKIP: cannot load")
            continue

        lang_hint = lang_hint_from_filename(label)

        # Determine grid: manual > count > auto > detection
        _auto = getattr(args, "auto_grid", False)
        _cols_arg = getattr(args, "cols", 1)
        _rows_arg = getattr(args, "rows", 1)
        _count    = getattr(args, "count", 0)

        if _cols_arg > 1 or _rows_arg > 1 or _auto or _count > 0:
            # Grid-split mode
            if _cols_arg > 1 or _rows_arg > 1:
                # Explicit cols/rows override
                cols = max(1, _cols_arg)
                rows = max(1, _rows_arg)
            elif _count > 0 or _auto:
                # Auto-detect (with optional count hint)
                cols, rows = auto_count_cards(img, hint_count=_count)
            overlap = getattr(args, "overlap", 5.0)
            cells = crop_grid(img, cols, rows, overlap=overlap)
            print(f"  │  (grid {cols}×{rows}, overlap={overlap}%) → {len(cells)} cell(s)")
            for idx, (bbox, cell) in enumerate(cells):
                records.append(CardRecord(
                    image_label=label, image_path=path,
                    card_id=idx + 1, bbox_pct=bbox,
                    hint_name="", hint_code="",
                    lang_hint=lang_hint, crop=cell, s1_time=0.0,
                ))
        elif args.no_detect:
            # Assume single card per image, no detection call
            records.append(CardRecord(
                image_label=label, image_path=path,
                card_id=1, bbox_pct=[0, 0, 100, 100],
                hint_name="", hint_code="",
                lang_hint=lang_hint,
                crop=img, s1_time=0.0,
            ))
            print(f"  │  (detection skipped) → 1 card assumed")
        else:
            detection, s1_time, _ = stage1_detect(img, args)
            count = detection.get("count", 0)
            cards_info = detection.get("cards", [])

            hints_str = ", ".join(
                f"{c.get('hint_name','')} {c.get('hint_code','')}".strip()
                for c in cards_info if c.get("hint_name") or c.get("hint_code")
            )
            print(f"  │  Stage 1 [{args.detect_model}] {s1_time:.1f}s "
                  f"→ {count} card(s)" + (f"  hints: {hints_str}" if hints_str else ""))

            if count == 0:
                print(f"  └─ No cards detected.")
                continue

            for card in cards_info:
                bbox = card.get("bbox_pct", [0, 0, 100, 100])
                is_full = (bbox == [0, 0, 100, 100])
                crop = img if is_full else crop_card(img, bbox)
                records.append(CardRecord(
                    image_label=label, image_path=path,
                    card_id=card.get("id", 1), bbox_pct=bbox,
                    hint_name=card.get("hint_name", ""),
                    hint_code=card.get("hint_code", ""),
                    lang_hint=lang_hint, crop=crop, s1_time=s1_time,
                ))

    return records


def run_batch_extraction(records: list[CardRecord], args) -> None:
    """
    Stage 2: send crops to the finetuned service in batches of MAX_BATCH_SIZE.
    Results are stored back into each CardRecord.extraction.
    """
    if not records:
        return

    print(f"\n  Stage 2 — batch-extract {len(records)} card(s) "
          f"via {args.service_url}  (batch_size={args.batch_size})")

    total_t0 = time.time()
    for i in range(0, len(records), args.batch_size):
        chunk = records[i: i + args.batch_size]
        print(f"    Batch {i//args.batch_size + 1}: cards {i+1}–{i+len(chunk)}")
        results = service_batch_extract(
            [r.crop for r in chunk],
            args.service_url,
            language=args.language,
            timeout=args.timeout_extract,
        )
        for record, result in zip(chunk, results):
            record.extraction = result

    total_elapsed = time.time() - total_t0
    successes = sum(1 for r in records if r.extraction and r.extraction.get("success"))
    print(f"  Stage 2 done: {successes}/{len(records)} succeeded "
          f"in {total_elapsed:.1f}s ({total_elapsed/len(records):.1f}s/card avg)")


def build_results(records: list[CardRecord], images: list[tuple[str, str]]) -> list[dict]:
    """Assemble per-image result dicts from flat record list."""
    from collections import defaultdict
    grouped: dict[str, list[CardRecord]] = defaultdict(list)
    for r in records:
        grouped[r.image_label].append(r)

    results = []
    for label, path in images:
        recs = grouped.get(label, [])
        cards_out = []
        for rec in recs:
            ext = rec.extraction or {}
            data = ext.get("data") or {}
            cards_out.append({
                "card_id":        rec.card_id,
                "bbox_pct":       rec.bbox_pct,
                "hint_name":      rec.hint_name,
                "hint_code":      rec.hint_code,
                "lang_hint":      rec.lang_hint,
                "success":        ext.get("success", False),
                "confidence":     ext.get("confidence", 0.0),
                "inference_ms":   ext.get("inference_time_ms", 0.0),
                "warnings":       ext.get("warnings", []),
                "error":          ext.get("error"),
                "name":           data.get("name"),
                "hp":             data.get("hp"),
                "types":          data.get("types"),
                "supertype":      data.get("supertype"),
                "subtypes":       data.get("subtypes"),
                "rarity":         data.get("rarity"),
                "setCode":        data.get("setCode"),
                "cardNumber":     data.get("cardNumber"),
                "artist":         data.get("artist"),
                "attacks":        data.get("attacks"),
                "abilities":      data.get("abilities"),
                "stage1_time":    rec.s1_time,
            })
        results.append({
            "image":       label,
            "path":        path,
            "cards_found": len(recs),
            "extractions": cards_out,
        })

    # Add images with no crops (load errors / no detection)
    processed = {r.image_label for r in records}
    for label, path in images:
        if label not in processed:
            results.append({"image": label, "path": path,
                            "cards_found": 0, "extractions": []})

    return results


def print_summary(results: list[dict]) -> None:
    total_images = len(results)
    total_cards   = sum(r["cards_found"] for r in results)
    total_success = sum(
        1 for r in results
        for e in r.get("extractions", [])
        if e.get("success")
    )
    print("\n" + "=" * 60)
    print("  SCAN SUMMARY")
    print("=" * 60)
    print(f"  Images processed : {total_images}")
    print(f"  Cards detected   : {total_cards}")
    print(f"  Successful reads : {total_success} / {total_cards}")
    if total_cards:
        print(f"  Success rate     : {total_success/total_cards*100:.0f}%")

    for r in results:
        for e in r.get("extractions", []):
            if e.get("success"):
                name   = str(e.get("name", "?"))[:26]
                code   = str(e.get("cardNumber", "?"))[:12]
                rarity = str(e.get("rarity", "?"))[:10]
                conf   = e.get("confidence", 0.0)
                print(f"  ✓  {r['image']}  card {e['card_id']} → "
                      f"{name}  {code}  {rarity}  conf={conf:.2f}")
            else:
                err = str(e.get("error", "no data"))[:40]
                print(f"  ✗  {r['image']}  card {e['card_id']} → {err}")
    print("=" * 60)

# ---------------------------------------------------------------------------
# HTML report
# ---------------------------------------------------------------------------

def _field(label: str, value) -> str:
    if value is None or value == []:
        return ""
    if isinstance(value, list):
        value = ", ".join(str(v) for v in value)
    return f"<tr><td style='color:#888'>{label}</td><td><b>{html_lib.escape(str(value))}</b></td></tr>"


def generate_html(results: list[dict], records: list[CardRecord],
                  detect_model: str, service_url: str, out_path: str) -> None:
    record_map: dict[tuple, CardRecord] = {}
    for rec in records:
        record_map[(rec.image_label, rec.card_id)] = rec

    cards_html = []
    for r in results:
        for e in r.get("extractions", []):
            rec = record_map.get((r["image"], e["card_id"]))
            thumb_b64 = to_b64(rec.crop, MAX_PX_THUMB) if rec else ""
            img_tag = (f'<img src="data:image/jpeg;base64,{thumb_b64}" '
                       f'style="max-width:200px;border-radius:8px">'
                       if thumb_b64 else '<div style="width:200px;height:280px;background:#333;border-radius:8px"></div>')
            ok = e.get("success", False)
            status_color = "#2ecc71" if ok else "#e74c3c"
            status_text  = "✓ OK" if ok else "✗ FAIL"
            conf_str = f"{e.get('confidence', 0.0):.2f}"
            ms_str   = f"{e.get('inference_ms', 0.0):.0f} ms"

            table_rows = "".join([
                _field("Name",       e.get("name")),
                _field("HP",         e.get("hp")),
                _field("Types",      e.get("types")),
                _field("Supertype",  e.get("supertype")),
                _field("Subtypes",   e.get("subtypes")),
                _field("Rarity",     e.get("rarity")),
                _field("Set",        e.get("setCode")),
                _field("Number",     e.get("cardNumber")),
                _field("Artist",     e.get("artist")),
            ])
            if e.get("error"):
                table_rows += f"<tr><td colspan=2 style='color:#e74c3c'>{html_lib.escape(str(e['error']))}</td></tr>"
            if e.get("warnings"):
                for w in e["warnings"]:
                    table_rows += f"<tr><td colspan=2 style='color:#f39c12'>⚠ {html_lib.escape(w)}</td></tr>"

            cards_html.append(f"""
<div style="display:flex;gap:16px;background:#1a1a2e;border-radius:12px;
            padding:16px;margin:12px 0;border:1px solid #2d2d44">
  <div style="flex-shrink:0">{img_tag}</div>
  <div style="flex:1">
    <div style="font-size:11px;color:#888">{html_lib.escape(r['image'])} — card {e['card_id']}</div>
    <div style="display:flex;gap:8px;align-items:center;margin:4px 0">
      <span style="background:{status_color};color:#fff;padding:2px 8px;
                   border-radius:12px;font-size:12px">{status_text}</span>
      <span style="color:#aaa;font-size:12px">conf {conf_str}</span>
      <span style="color:#aaa;font-size:12px">{ms_str}</span>
      {f'<span style="color:#aaa;font-size:12px">hint: {html_lib.escape(e.get("hint_name",""))}</span>' if e.get("hint_name") else ''}
    </div>
    <table style="font-size:13px;border-collapse:collapse;width:100%">
      {table_rows}
    </table>
  </div>
</div>""")

    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    total_cards = sum(r["cards_found"] for r in results)
    ok_count    = sum(1 for r in results for e in r.get("extractions",[]) if e.get("success"))
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>PTCG Scan Report — {ts}</title>
<style>
  body {{ font-family: system-ui, sans-serif; background: #0d0d21; color: #e0e0e0; margin: 0; padding: 20px; }}
  h1 {{ color: #7b9cff; }}
  .stat {{ display:inline-block; background:#1a1a2e; border-radius:8px; padding:8px 18px;
           margin:4px; font-size:14px; border:1px solid #2d2d44; }}
  .stat b {{ font-size:22px; display:block; color:#7b9cff; }}
</style></head><body>
<h1>PTCG Card Scan Report</h1>
<p style="color:#888">{ts} &nbsp;|&nbsp; Service: {html_lib.escape(service_url)}
&nbsp;|&nbsp; Detect: {html_lib.escape(detect_model)}</p>
<div>
  <div class="stat"><b>{len(results)}</b>Images</div>
  <div class="stat"><b>{total_cards}</b>Cards</div>
  <div class="stat"><b>{ok_count}</b>Successful</div>
  <div class="stat"><b>{ok_count/total_cards*100:.0f}%</b>Success rate</div>
</div>
<h2 style="color:#7b9cff;margin-top:28px">Card Extractions</h2>
{"".join(cards_html) or "<p style='color:#888'>No cards found.</p>"}
</body></html>"""
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  HTML report  → {out_path}")

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="PTCG multi-card scan pipeline: glm-ocr detect → batch-extract"
    )
    parser.add_argument("--image-dir",      default=DEFAULT_IMAGE_DIR,
                        help="Directory of card photos")
    parser.add_argument("--image",          default=None,
                        help="Single image path (overrides --image-dir)")
    parser.add_argument("--service-url",    default=SERVICE_BASE_URL,
                        help="Inference service base URL (default: http://localhost:8000)")
    parser.add_argument("--ollama-url",     default=OLLAMA_BASE_URL,
                        help="Ollama base URL for Stage 1 detection")
    parser.add_argument("--detect-model",   default=DETECT_MODEL,
                        help="Ollama model for card detection")
    parser.add_argument("--no-detect",      action="store_true",
                        help="Skip Stage 1 detection (assume 1 card per image, fastest)")
    parser.add_argument("--auto-grid",      action="store_true",
                        help="Auto-detect card count and layout from image analysis (no manual cols/rows needed)")
    parser.add_argument("--count",          type=int, default=0,
                        help="Tell the pipeline how many cards are in the photo (e.g. --count 3). "
                             "Auto-determines cols×rows from image orientation. Implies --auto-grid.")
    parser.add_argument("--cols",           type=int, default=1,
                        help="Split each image into N columns (e.g. 2 for 2 side-by-side cards). Overrides detection.")
    parser.add_argument("--rows",           type=int, default=1,
                        help="Split each image into N rows (e.g. 2 for 2 stacked cards). Overrides detection.")
    parser.add_argument("--overlap",        type=float, default=5.0,
                        help="Extra margin %% of cell size added to each crop edge so type/HP icons aren't cut off (default: 5.0)")
    parser.add_argument("--batch-size",     type=int, default=MAX_BATCH_SIZE,
                        help=f"Extraction batch size (default: {MAX_BATCH_SIZE}, max: 10)")
    parser.add_argument("--language",       default="en-US",
                        choices=["en-US", "ja-JP", "zh-HK"],
                        help="Extraction language hint")
    parser.add_argument("--timeout-detect", type=int, default=10,
                        help="Stage 1 detection timeout in seconds")
    parser.add_argument("--timeout-extract",type=int, default=120,
                        help="Stage 2 batch-extract timeout in seconds")
    parser.add_argument("--output-dir",     default="./benchmarks/scan",
                        help="Output directory for JSON + HTML results")
    args = parser.parse_args()

    args.batch_size = min(args.batch_size, 10)

    # Collect images
    images = ([(Path(args.image).name, args.image)] if args.image
               else get_image_paths(args.image_dir))
    if not images:
        print(f"ERROR: No images found in {args.image_dir}")
        sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)

    print("=" * 60)
    print("  PTCG SCAN PIPELINE")
    print("=" * 60)
    _cols, _rows = getattr(args, "cols", 1), getattr(args, "rows", 1)
    _auto = getattr(args, "auto_grid", False)
    if _cols > 1 or _rows > 1:
        _mode = f"grid {_cols}×{_rows} ({_cols*_rows} cards/image)"
    elif _auto:
        _mode = "auto-grid (detect card count from image)"
    elif args.no_detect:
        _mode = "no-detect (1 card/image)"
    else:
        _mode = f"detect [{args.detect_model}]"
    print(f"  Mode       : {_mode}")
    print(f"  Service    : {args.service_url}")
    print(f"  Batch size : {args.batch_size}")
    print(f"  Language   : {args.language}")
    print(f"  Images     : {len(images)}")
    print(f"  Started    : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Check service health
    try:
        h = requests.get(f"{args.service_url}/health", timeout=5)
        health = h.json()
        if not health.get("model_loaded"):
            print("\n  WARNING: Service reports model not loaded yet. "
                  "Wait for it to finish loading, then retry.")
            sys.exit(1)
        print(f"  Service    : healthy ✓")
    except Exception as e:
        print(f"\n  ERROR: Cannot reach inference service at {args.service_url}: {e}")
        print("  Start the service first:")
        print("    python inference_service.py --adapter ./outputs/qlora_v4/final --port 8000 --no-compile --quantize 4bit")
        sys.exit(1)

    # Stage 1: detect + crop
    records = collect_crops(images, args)
    if not records:
        print("\nNo cards found in any image.")
        sys.exit(0)
    print(f"\n  Total crops : {len(records)}")

    # Stage 2: batch extraction
    run_batch_extraction(records, args)

    # Assemble + report
    results = build_results(records, images)
    print_summary(results)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.output_dir)

    json_path = out_dir / f"scan_results_{ts}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp":    datetime.now().isoformat(),
            "service_url":  args.service_url,
            "detect_model": args.detect_model if not args.no_detect else None,
            "no_detect":    args.no_detect,
            "batch_size":   args.batch_size,
            "language":     args.language,
            "image_count":  len(images),
            "results":      results,
        }, f, ensure_ascii=False, indent=2)
    print(f"  JSON results → {json_path}")

    html_path = out_dir / f"report_{ts}.html"
    generate_html(results, records, args.detect_model, args.service_url, str(html_path))

    print(f"  Finished  : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()
