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

# YOLOv8 model cache — loaded once on first auto_count_cards call
_yolo_model = None
_YOLO_MODEL_PATH = str(Path(__file__).parent / "yolov8n.pt")

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
    Detect card count and grid layout (cols × rows) using OpenCV.

    Priority:
      1. hint_count > 0  → user-supplied card count (picks best cols×rows).
      2. Contour detection — finds card-shaped blobs when background is visible.
      3. Regularly-spaced Sobel X peaks — vertical dividers between side-by-side cards.
         Key insight: random artwork edges are IRREGULAR; genuine card dividers
         are EQUALLY SPACED. The regularity filter (CV < 0.25) eliminates false peaks.
      4. Hue-diff peaks with same regularity filter (detects colored card borders).
      5. Column-mean autocorrelation — detects periodic pattern of repeating cards.
      6. Aspect-ratio fallback.

    PTCG card: 63.5 × 88.9 mm → portrait W/H ≈ 0.714.
    Returns (cols, rows).
    """
    CARD_RATIO   = 63.5 / 88.9   # ≈ 0.714 portrait
    RATIO_TOL    = 0.30
    MIN_AREA_PCT = 0.04

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
        best, best_err = (1, 1), float('inf')
        for c in range(1, n + 1):
            for r in range(1, n + 1):
                if c * r != n:
                    continue
                cell_ratio = (iw / c) / (ih / r)
                err = abs(cell_ratio - CARD_RATIO)
                if err < best_err:
                    best_err, best = err, (c, r)
        cols, rows = best
        print(f"  │  (auto-grid) user count={n} + image={iw}×{ih} → {cols}×{rows} "
              f"(cell {iw/cols:.0f}×{ih/rows:.0f}={iw/cols/(ih/rows):.2f})")
        return cols, rows

    # ── OpenCV detection ───────────────────────────────────────────────────
    # votes[col_count] += weight  — at end pick col count with highest vote
    import collections
    col_votes: dict[int, float] = collections.defaultdict(float)
    row_votes: dict[int, float] = collections.defaultdict(float)

    try:
        import cv2
        import numpy as np

        thumb = img.copy()
        thumb.thumbnail((640, 640), Image.LANCZOS)
        tw, th = thumb.size
        bgr  = cv2.cvtColor(np.array(thumb.convert("RGB")), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        hsv  = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

        # ── Helper: grid-snap scoring ──────────────────────────────────────
        # For each candidate N (cells), probe the profile exactly at the
        # expected divider positions (1/N, 2/N, …, (N-1)/N).
        # Returns (n_dividers, score); (0, 0) if no candidate beats min_score.
        #
        # Key advantage over regularity-based approach: we don't care whether
        # found peaks are regular — we directly test whether specific expected
        # positions are high in the profile. e.g. for 1×2 (1 divider at 50%),
        # n_cells=2 scores high because profile peaks near 50%.  n_cells=4
        # (expected 25%, 50%, 75%) scores lower because nothing is near 75%.
        def _grid_snap(prof: np.ndarray, total: int,
                       margin_frac: float = 0.10,
                       win_frac: float = 0.05,
                       min_score: float = 0.35,
                       max_cells: int = 6) -> tuple[int, float]:
            margin = int(total * margin_frac)
            win    = max(2, int(total * win_frac))
            base   = float(prof.mean())
            if base < 1e-9:
                return 0, 0.0
            best_divs, best_score = 0, 0.0
            for n_cells in range(2, max_cells + 1):
                dividers = [int(total * k / n_cells) for k in range(1, n_cells)]
                per_div = []
                for pos in dividers:
                    lo = max(margin, pos - win)
                    hi = min(total - margin - 1, pos + win)
                    if lo >= hi:
                        per_div.append(0.0)
                        continue
                    peak = float(prof[lo : hi + 1].max())
                    per_div.append(max(0.0, (peak - base) / base))
                avg = sum(per_div) / len(per_div)
                if avg > best_score:
                    best_score, best_divs = avg, n_cells - 1
            return (best_divs, best_score) if best_score >= min_score else (0, 0.0)

        # ── Strategy 1: Sobel X → vertical card dividers (cols) ────────────
        sx = np.abs(cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3))
        sx_k = max(3, tw // 30)
        sx_prof = np.convolve(sx.mean(axis=0), np.ones(sx_k) / sx_k, mode="same")
        n_sx, s_sx = _grid_snap(sx_prof, tw)
        if n_sx > 0:
            col_votes[n_sx + 1] += 2.0 * s_sx
            print(f"  │  (auto-grid/SobelX) {n_sx} divider(s) → {n_sx+1} col(s)  (score={s_sx:.2f})")
        else:
            print(f"  │  (auto-grid/SobelX) no dividers found")

        # ── Strategy 2: Hue-diff → colored border transitions (cols) ────────
        hue = hsv[:, :, 0].astype(np.float64)
        hue_dx = np.minimum(np.abs(np.diff(hue, axis=1)),
                            180.0 - np.abs(np.diff(hue, axis=1)))
        hue_k = max(3, tw // 30)
        hue_prof = np.convolve(hue_dx.mean(axis=0),
                               np.ones(hue_k) / hue_k, mode="same")
        n_hue, s_hue = _grid_snap(hue_prof, tw - 1)
        if n_hue > 0:
            col_votes[n_hue + 1] += 1.5 * s_hue
            print(f"  │  (auto-grid/HueDiff) {n_hue} divider(s) → {n_hue+1} col(s)  (score={s_hue:.2f})")
        else:
            print(f"  │  (auto-grid/HueDiff) no dividers found")

        # ── Strategy 3: Sobel Y → horizontal card dividers (rows) ──────────
        sy = np.abs(cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3))
        sy_k = max(3, th // 30)
        sy_prof = np.convolve(sy.mean(axis=1), np.ones(sy_k) / sy_k, mode="same")
        n_sy, s_sy = _grid_snap(sy_prof, th)
        if n_sy > 0:
            # Midpoint gate (rows only): if grid-snap picks N≥2 rows but the
            # profile has no clear edge at 50% (midpoint), the winner is
            # likely artwork edges within a single card, not a real card border.
            # Real stacked images always have SOME visual edge near their midpoint.
            # (Not applied to SobelX/cols because 3-col layouts have no 50% edge.)
            _sy_base = float(sy_prof.mean())
            _p50 = th // 2
            _w50 = max(2, int(th * 0.05))
            _lo50 = max(int(th * 0.10), _p50 - _w50)
            _hi50 = min(th - int(th * 0.10) - 1, _p50 + _w50)
            _n2_ok = True
            if _lo50 < _hi50 and _sy_base > 0:
                _n2_score = (float(sy_prof[_lo50:_hi50+1].max()) - _sy_base) / _sy_base
                _n2_ok = _n2_score >= 0.35
            if _n2_ok:
                # Base weight: 2.0 × grid-snap score.
                # Midpoint bonus: strong midpoint evidence (score >> 0.35) adds
                # up to +3.0 extra so it can beat contour's 1-row vote (3.0)
                # when a real card boundary is visible at 50% of image height.
                _midpoint_bonus = min(3.0, max(0.0, (_n2_score - 0.35) / 0.20))
                _sy_weight = 2.0 * s_sy + _midpoint_bonus
                row_votes[n_sy + 1] += _sy_weight
                print(f"  │  (auto-grid/SobelY) {n_sy} divider(s) → {n_sy+1} row(s)  "
                      f"(score={s_sy:.2f} midpoint={_n2_score:.2f} weight={_sy_weight:.1f})")
            else:
                print(f"  │  (auto-grid/SobelY) {n_sy} divider(s) suppressed "
                      f"(no midpoint edge, n2={_n2_score:.2f})")
        else:
            print(f"  │  (auto-grid/SobelY) no dividers found")

        # ── Strategy 4: Column-mean autocorrelation → repeating card period ─
        # A periodic signal at lag L → cards repeat every L px → N = tw/L cols
        col_mean = gray.mean(axis=0).astype(np.float64)
        col_mean -= col_mean.mean()
        if np.abs(col_mean).max() > 1e-6:
            ac_full = np.correlate(col_mean, col_mean, mode="full")
            ac = ac_full[tw - 1:]            # positive lags
            ac /= ac[0] + 1e-9              # normalise
            # Look for the first significant peak in lag range [tw/7 … tw/1.5]
            lag_min = max(1, tw // 7)
            lag_max = int(tw // 1.5)
            best_lag, best_ac = -1, 0.25    # minimum autocorrelation threshold
            for lag in range(lag_min, min(lag_max, len(ac) - 1)):
                if ac[lag] > ac[lag - 1] and ac[lag] > ac[lag + 1]:
                    if ac[lag] > best_ac:
                        best_ac, best_lag = ac[lag], lag
            if best_lag > 0:
                n_ac = max(1, min(6, round(tw / best_lag)))
                col_votes[n_ac] += best_ac * 1.5   # weight by correlation strength
                print(f"  │  (auto-grid/AutoCorr) lag={best_lag}px "
                      f"(r={best_ac:.2f}) → {n_ac} col(s)")
            else:
                print(f"  │  (auto-grid/AutoCorr) no periodic pattern found")

        # ── Shared helper: cluster 1-D positions into bins ──────────────────
        def _unique_bins(vals: list, total: int, gap_pct: float = 0.10) -> int:
            s = sorted(vals)
            bins: list = [s[0]]
            gap = total * gap_pct
            for v in s[1:]:
                if v - bins[-1] > gap:
                    bins.append(v)
            return len(bins)

        # ── Strategy 5: Contour detection (cards on visible background) ─────
        sat = hsv[:, :, 1]
        _, sat_thresh = cv2.threshold(sat, 30, 255, cv2.THRESH_BINARY)
        big_k = cv2.getStructuringElement(
            cv2.MORPH_RECT, (max(5, tw // 16), max(5, th // 16)))
        sat_closed = cv2.morphologyEx(sat_thresh, cv2.MORPH_CLOSE, big_k, iterations=3)
        conts, _ = cv2.findContours(sat_closed, cv2.RETR_EXTERNAL,
                                     cv2.CHAIN_APPROX_SIMPLE)
        img_area = tw * th
        card_centres: list[tuple[float, float]] = []
        for cnt in conts:
            if cv2.contourArea(cnt) < img_area * MIN_AREA_PCT:
                continue
            x, y, w, h = cv2.boundingRect(cnt)
            if h == 0:
                continue
            if abs(w / h - CARD_RATIO) / CARD_RATIO <= RATIO_TOL:
                card_centres.append((x + w / 2, y + h / 2))

        if len(card_centres) >= 2:
            c_c = min(6, _unique_bins([cx for cx, _ in card_centres], tw))
            c_r = min(4, _unique_bins([cy for _, cy in card_centres], th))
            col_votes[c_c] += 3.0   # contour-based result is highest confidence
            row_votes[c_r] += 3.0
            print(f"  │  (auto-grid/contour) {len(card_centres)} region(s) "
                  f"→ {c_c}×{c_r}")
        elif len(card_centres) == 1:
            col_votes[1] += 3.0
            row_votes[1] += 3.0

        # ── Strategy 6: YOLOv8 detection (card-bbox clustering) ─────────────
        # YOLOv8n is agnostic to COCO class labels — we only use the bounding
        # box positions and sizes to vote for a grid layout.
        try:
            global _yolo_model
            from ultralytics import YOLO as _YOLO
            if _yolo_model is None:
                _yolo_model = _YOLO(_YOLO_MODEL_PATH)
            yolo_res  = _yolo_model(thumb, conf=0.08, iou=0.3, verbose=False)
            yolo_boxes = yolo_res[0].boxes
            # Keep boxes that are large enough and plausibly card-shaped
            good_boxes: list[tuple[float, float, float, float]] = []
            for _box in yolo_boxes:
                _x1, _y1, _x2, _y2 = _box.xyxy[0].tolist()
                _bw = _x2 - _x1; _bh = _y2 - _y1
                if _bh < 1:
                    continue
                _area_pct = _bw * _bh / img_area * 100
                _ratio    = _bw / _bh
                # Accept portrait-ish boxes with enough area.
                # Ratio tolerance 0.80: upper bound = 0.714*1.80 = 1.285.
                # Needed because in a 1×2 vertical stack in a portrait phone photo,
                # each card slot is (full_width × half_height) → W/H ≈ 1.12-1.25.
                # Area floor 2.5%: in a dense 8×3 grid each card is ~4.1% of image;
                # YOLO finds artwork sub-regions at 3-4%, so 5% was too strict.
                _YOLO_RATIO_TOL = 0.80
                if (_area_pct >= 2.5 and
                        CARD_RATIO * (1 - _YOLO_RATIO_TOL) <= _ratio <= CARD_RATIO * (1 + _YOLO_RATIO_TOL)):
                    good_boxes.append((_x1, _y1, _x2, _y2))
            if len(good_boxes) >= 2:
                _cx = [(_x1+_x2)/2 for _x1,_y1,_x2,_y2 in good_boxes]
                _cy = [(_y1+_y2)/2 for _x1,_y1,_x2,_y2 in good_boxes]
                n_yc = min(6, _unique_bins(_cx, tw, 0.15))
                n_yr = min(4, _unique_bins(_cy, th, 0.15))
                col_votes[n_yc] += 3.0  # Raised: YOLO now equal to contour
                row_votes[n_yr] += 3.0
                print(f"  │  (auto-grid/YOLO) {len(good_boxes)} det → {n_yc}×{n_yr}  (weight=3.0)")
            elif len(good_boxes) == 1:
                col_votes[1] += 2.0  # Raised from 1.5
                row_votes[1] += 2.0
                print(f"  │  (auto-grid/YOLO) 1 detection → 1×1  (weight=2.0)")
            else:
                print(f"  │  (auto-grid/YOLO) no card-like detections "
                      f"({len(yolo_boxes)} total boxes)")
        except ImportError:
            pass
        except Exception as _ye:
            print(f"  │  (auto-grid/YOLO) error: {_ye}")

    except ImportError:
        print("  │  (auto-grid) cv2 not available")
    except Exception as exc:
        print(f"  │  (auto-grid) cv2 error: {exc}")

    # ── Combine votes → final grid ─────────────────────────────────────────
    ratio_cols, ratio_rows = _ratio_fallback()

    # Plausibility filter: each strip must be plausibly card-shaped.
    # col cell W/H = (iw/N)/ih — portrait card ~0.714, allow [0.40, 1.50]
    # row cell H/W = (ih/N)/iw — portrait card ~1.40.
    #   Minimum is 0.70 (not 1.0) so that real 1×2 stacked portrait images
    #   (H/W≈1.78 → per-row H/W=0.89) are still allowed.
    #   Portrait single-card false positives are blocked by the SobelY
    #   midpoint gate (requires edge at 50%) AND by the Contour strategy
    #   (which correctly finds only 1 region in single-card photos).
    #   For very small n: ih/3/iw = 0.59 on a portrait phone photo < 0.70 → rejected.
    CELL_MIN, CELL_MAX = 0.40, 1.50
    ROW_MIN = 0.70   # lowered from 1.0 to allow genuine 1×2 portrait grids
    valid_col_votes = {
        n: w for n, w in col_votes.items()
        if n >= 1 and CELL_MIN <= (iw / n / ih) <= CELL_MAX
    }
    valid_row_votes = {
        n: w for n, w in row_votes.items()
        if n >= 1 and ROW_MIN <= (ih / n / iw) <= CELL_MAX
    }

    if valid_col_votes:
        best_col = max(valid_col_votes, key=lambda k: valid_col_votes[k])
        cols = best_col if valid_col_votes[best_col] >= 1.3 else ratio_cols
        if valid_col_votes[best_col] >= 1.3:
            print(f"  │  (auto-grid) cv2 voted cols={cols} "
                  f"(score={valid_col_votes[best_col]:.1f})")
    else:
        cols = ratio_cols
        print(f"  │  (auto-grid) all col votes filtered out → ratio cols={cols}")

    if valid_row_votes:
        best_row = max(valid_row_votes, key=lambda k: valid_row_votes[k])
        rows = best_row if valid_row_votes[best_row] >= 1.3 else ratio_rows
        if valid_row_votes[best_row] >= 1.3:
            print(f"  │  (auto-grid) cv2 voted rows={rows} "
                  f"(score={valid_row_votes[best_row]:.1f})")
    else:
        rows = ratio_rows

    # Final plausibility cap
    if cols * rows > 12:
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
