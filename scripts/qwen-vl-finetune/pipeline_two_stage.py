#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Two-stage PTCG card extraction pipeline:

  Stage 1 (glm-ocr, fast ~0.4s):
    - Detect how many cards are in the image
    - Estimate bounding box for each card (as % of image dimensions)

  Stage 2 (qwen3-vl, accurate ~7s):
    - Receive cropped card image (from bbox)
    - Extract structured card details (name, code, set, rarity, language)

Usage:
  python pipeline_two_stage.py
  python pipeline_two_stage.py --image-dir "C:/path/to/images"
  python pipeline_two_stage.py --image "path/to/single_card.jpg"

Results saved to: benchmarks/two_stage/pipeline_results.json
"""

import os
import sys
import json
import time
import base64
import re
import argparse
from pathlib import Path
from datetime import datetime
from io import BytesIO

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
# Config
# ---------------------------------------------------------------------------

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DETECT_MODEL    = "glm-ocr:latest"
EXTRACT_MODEL   = "qwen3-vl:latest"
DEFAULT_IMAGE_DIR = r"C:\AI_Server\Coding\PTCG_2026\data\test_sample"

MAX_PX_DETECT   = 1024   # resize for detection stage
MAX_PX_EXTRACT  = 1024   # resize for extraction stage

# ---------------------------------------------------------------------------
# Stage 1 prompt — card detection
# ---------------------------------------------------------------------------

DETECT_PROMPT = (
    "Look at this image. Count how many Pokemon Trading Card Game (TCG) cards are visible.\n"
    "For each card, estimate its bounding box as percentages of the image width/height.\n\n"
    "Return ONLY this JSON (no other text):\n"
    '{"count": <number>, "cards": [{"id": 1, "bbox_pct": [left%, top%, right%, bottom%]}, ...]}\n\n'
    "Rules:\n"
    "- bbox_pct values are integers 0-100\n"
    "- If a single card fills most of the image: return count=1 with bbox_pct=[0,0,100,100]\n"
    "- If multiple cards: estimate each card's region carefully\n"
    "- If no Pokemon cards visible: return {\"count\": 0, \"cards\": []}\n"
    "Output ONLY the JSON."
)

# ---------------------------------------------------------------------------
# Stage 2 prompt — card detail extraction
# ---------------------------------------------------------------------------

EXTRACT_PROMPT = (
    "请分析图片。如果是Pokemon/宝可梦TCG卡，以JSON格式返回："
    '{"isCard":true,"cardName":"名称","cardCode":"编号","set":"系列","rarity":"稀有度","language":"语言"}'
    "。如果不是卡片，返回 {\"isCard\":false}。只输出JSON，不要其他文字。"
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_image_paths(image_dir: str) -> list[tuple[str, str]]:
    exts = {".png", ".jpg", ".jpeg", ".webp"}
    return [
        (p.name, str(p))
        for p in sorted(Path(image_dir).iterdir())
        if p.suffix.lower() in exts
    ]


def load_image(path: str) -> Image.Image | None:
    try:
        return Image.open(path).convert("RGB")
    except Exception as e:
        print(f"  WARNING: Cannot load {path}: {e}")
        return None


def image_to_b64(img: Image.Image, max_px: int) -> str:
    if max(img.size) > max_px:
        img = img.copy()
        img.thumbnail((max_px, max_px), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def crop_card(img: Image.Image, bbox_pct: list[int], padding_pct: float = 1.0) -> Image.Image:
    """Crop image using [left%, top%, right%, bottom%] with optional padding."""
    w, h = img.size
    l = max(0, int((bbox_pct[0] - padding_pct) / 100 * w))
    t = max(0, int((bbox_pct[1] - padding_pct) / 100 * h))
    r = min(w, int((bbox_pct[2] + padding_pct) / 100 * w))
    b = min(h, int((bbox_pct[3] + padding_pct) / 100 * h))
    return img.crop((l, t, r, b))


def save_debug_image(img: Image.Image, cards: list[dict], output_path: str):
    """Save image with bounding boxes drawn for visual validation."""
    draw_img = img.copy()
    draw = ImageDraw.Draw(draw_img)
    w, h = img.size
    colors = ["#FF0000", "#00FF00", "#0000FF", "#FF8800", "#FF00FF"]
    for i, card in enumerate(cards):
        bp = card.get("bbox_pct", [0, 0, 100, 100])
        l = int(bp[0] / 100 * w)
        t = int(bp[1] / 100 * h)
        r = int(bp[2] / 100 * w)
        b = int(bp[3] / 100 * h)
        color = colors[i % len(colors)]
        draw.rectangle([l, t, r, b], outline=color, width=4)
        draw.text((l + 5, t + 5), f"Card {i+1}", fill=color)
    draw_img.save(output_path)


def strip_thinking(text: str) -> str:
    return re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()


def parse_json(text: str) -> dict | None:
    for candidate in [strip_thinking(text), text]:
        try:
            return json.loads(candidate)
        except Exception:
            pass
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", candidate)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
        start, end = candidate.find("{"), candidate.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(candidate[start:end])
            except Exception:
                pass
    return None


def ollama_infer(model: str, prompt: str, image_b64: str,
                 timeout: int, base_url: str) -> tuple[str, float]:
    payload = {
        "model": model,
        "prompt": prompt,
        "images": [image_b64],
        "stream": False,
        "think": False,
        "options": {"temperature": 0.1, "num_predict": 4096},
    }
    t0 = time.time()
    try:
        r = requests.post(f"{base_url}/api/generate", json=payload, timeout=timeout)
        r.raise_for_status()
        data = r.json()
        text = data.get("response", "").strip() or data.get("thinking", "").strip()
        return text, time.time() - t0
    except requests.exceptions.Timeout:
        return "Error: timeout", time.time() - t0
    except Exception as e:
        return f"Error: {e}", time.time() - t0


# ---------------------------------------------------------------------------
# Core pipeline
# ---------------------------------------------------------------------------

def stage1_detect(img: Image.Image, timeout: int, base_url: str,
                  model: str = DETECT_MODEL) -> tuple[dict, float, str]:
    """Use glm-ocr to detect card count and bounding boxes."""
    b64 = image_to_b64(img, MAX_PX_DETECT)
    raw, elapsed = ollama_infer(model, DETECT_PROMPT, b64, timeout, base_url)

    if raw.startswith("Error:"):
        # fallback: assume single card
        return {"count": 1, "cards": [{"id": 1, "bbox_pct": [0, 0, 100, 100]}]}, elapsed, raw

    parsed = parse_json(raw)
    if parsed and "count" in parsed and "cards" in parsed:
        # Validate and clamp bbox values
        for card in parsed["cards"]:
            bp = card.get("bbox_pct", [0, 0, 100, 100])
            card["bbox_pct"] = [
                max(0, min(100, int(v))) for v in bp
            ]
        return parsed, elapsed, raw

    # Fallback: single card
    return {"count": 1, "cards": [{"id": 1, "bbox_pct": [0, 0, 100, 100]}]}, elapsed, raw


def stage2_extract(img: Image.Image, bbox_pct: list[int],
                   timeout: int, base_url: str,
                   model: str = EXTRACT_MODEL) -> tuple[dict | None, float, str]:
    """Crop card region and use qwen3-vl to extract card details."""
    is_full_image = bbox_pct == [0, 0, 100, 100]
    card_img = img if is_full_image else crop_card(img, bbox_pct)
    b64 = image_to_b64(card_img, MAX_PX_EXTRACT)
    raw, elapsed = ollama_infer(model, EXTRACT_PROMPT, b64, timeout, base_url)

    if raw.startswith("Error:"):
        return None, elapsed, raw

    parsed = parse_json(raw)
    return parsed, elapsed, raw


def process_image(label: str, path: str, args, debug_dir: str | None,
                  detect_model: str = DETECT_MODEL,
                  extract_model: str = EXTRACT_MODEL) -> dict:
    """Full two-stage pipeline for one image file."""
    print(f"\n  ┌─ {label}")

    img = load_image(path)
    if img is None:
        return {"image": label, "error": "load failed", "cards_found": 0, "extractions": []}

    # ── Stage 1: Detection ──────────────────────────────────────────────────
    t_detect_start = time.time()
    detection, s1_time, s1_raw = stage1_detect(img, args.timeout_detect, args.ollama_url, detect_model)
    card_count = detection.get("count", 0)
    cards_info = detection.get("cards", [])

    print(f"  │  Stage 1 [{detect_model}] {s1_time:.1f}s → {card_count} card(s) detected")

    if card_count == 0:
        print(f"  └─ No cards detected, skipping.")
        return {
            "image": label,
            "stage1_time_sec": round(s1_time, 2),
            "stage1_raw": s1_raw,
            "cards_found": 0,
            "extractions": [],
        }

    # Save debug image with bounding boxes
    if debug_dir and card_count > 1:
        debug_path = os.path.join(debug_dir, f"debug_{label}")
        save_debug_image(img, cards_info, debug_path)
        print(f"  │  Debug image → {debug_path}")

    # ── Stage 2: Extraction per card ──────────────────────────────────────
    extractions = []
    for card in cards_info:
        card_id = card.get("id", 1)
        bbox = card.get("bbox_pct", [0, 0, 100, 100])
        is_full = bbox == [0, 0, 100, 100]
        crop_label = "full image" if is_full else f"bbox {bbox}"

        parsed, s2_time, s2_raw = stage2_extract(img, bbox, args.timeout_extract, args.ollama_url, extract_model)
        success = parsed is not None and parsed.get("isCard") is not False

        status = "✓" if success else "✗"
        if success and parsed:
            name   = str(parsed.get("cardName", "?"))[:22]
            code   = str(parsed.get("cardCode", "?"))[:14]
            rarity = str(parsed.get("rarity",   "?"))[:10]
            lang   = str(parsed.get("language", "?"))[:8]
            print(f"  │  Stage 2 card {card_id} [{crop_label}] {s2_time:.1f}s {status} → {name} | {code} | {rarity} | {lang}")
        else:
            print(f"  │  Stage 2 card {card_id} [{crop_label}] {s2_time:.1f}s {status}  {s2_raw[:60]}")

        extractions.append({
            "card_id": card_id,
            "bbox_pct": bbox,
            "success": success,
            "stage2_time_sec": round(s2_time, 2),
            "stage2_raw": s2_raw,
            "parsed": parsed,
        })

    total_time = round(time.time() - t_detect_start, 2)
    print(f"  └─ Done in {total_time}s total  ({len(extractions)} card(s) extracted)")

    return {
        "image": label,
        "total_time_sec": total_time,
        "stage1_time_sec": round(s1_time, 2),
        "stage1_raw": s1_raw,
        "cards_found": card_count,
        "extractions": extractions,
    }


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def print_summary(results: list[dict]):
    total_images = len(results)
    total_cards  = sum(r.get("cards_found", 0) for r in results)
    ok_extractions = sum(
        1 for r in results
        for e in r.get("extractions", [])
        if e.get("success")
    )
    total_extractions = sum(len(r.get("extractions", [])) for r in results)
    multi_card_images = sum(1 for r in results if r.get("cards_found", 0) > 1)

    print("\n" + "=" * 70)
    print("  TWO-STAGE PIPELINE SUMMARY")
    print("=" * 70)
    print(f"  Images processed   : {total_images}")
    print(f"  Multi-card images  : {multi_card_images}")
    print(f"  Total cards found  : {total_cards}")
    print(f"  Successful extracts: {ok_extractions}/{total_extractions}  "
          f"({round(ok_extractions/total_extractions*100) if total_extractions else 0}%)")
    print()
    print(f"  {'Image':<35} {'Cards':>6}  {'Results'}")
    print("  " + "-" * 68)
    for r in results:
        n = r.get("cards_found", 0)
        exts = r.get("extractions", [])
        ok = sum(1 for e in exts if e.get("success"))
        names = ", ".join(
            str(e["parsed"].get("cardName", "?"))[:15]
            for e in exts if e.get("success") and e.get("parsed")
        )
        print(f"  {r['image']:<35} {n:>6}  {ok}/{len(exts)}  {names[:40]}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Two-stage PTCG card pipeline: glm-ocr detect → qwen3-vl extract"
    )
    parser.add_argument("--image-dir",       default=DEFAULT_IMAGE_DIR)
    parser.add_argument("--image",           default=None,
                        help="Process a single image instead of a directory")
    parser.add_argument("--ollama-url",      default=OLLAMA_BASE_URL)
    parser.add_argument("--timeout-detect",  type=int, default=20,
                        help="Timeout for Stage 1 detection (default: 20s)")
    parser.add_argument("--timeout-extract", type=int, default=60,
                        help="Timeout for Stage 2 extraction (default: 60s)")
    parser.add_argument("--output-dir",      default="./benchmarks/two_stage")
    parser.add_argument("--save-debug",      action="store_true",
                        help="Save debug images with bounding boxes drawn")
    parser.add_argument("--detect-model",    default=DETECT_MODEL)
    parser.add_argument("--extract-model",   default=EXTRACT_MODEL)
    args = parser.parse_args()

    # Allow model override via args
    detect_model  = args.detect_model
    extract_model = args.extract_model

    # Collect images
    if args.image:
        p = Path(args.image)
        images = [(p.name, str(p))]
    else:
        images = get_image_paths(args.image_dir)

    if not images:
        print(f"ERROR: No images found in {args.image_dir}")
        sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)
    debug_dir = args.output_dir if args.save_debug else None

    print("=" * 70)
    print("  PTCG Two-Stage Pipeline: Detect → Extract")
    print("=" * 70)
    print(f"  Stage 1 (detect) : {detect_model}")
    print(f"  Stage 2 (extract): {extract_model}")
    print(f"  Images           : {len(images)} files")
    print(f"  Ollama           : {args.ollama_url}")
    print(f"  Timeouts         : detect={args.timeout_detect}s, extract={args.timeout_extract}s")
    print(f"  Started          : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    all_results = []
    for label, path in images:
        result = process_image(label, path, args, debug_dir, detect_model, extract_model)
        all_results.append(result)

    print_summary(all_results)

    # Save results
    out_file = Path(args.output_dir) / "pipeline_results.json"
    payload = {
        "timestamp": datetime.now().isoformat(),
        "detect_model": detect_model,
        "extract_model": extract_model,
        "image_dir": args.image_dir if not args.image else args.image,
        "image_count": len(images),
        "results": all_results,
    }
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"\n  Results saved → {out_file}")
    print(f"  Finished        : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()
