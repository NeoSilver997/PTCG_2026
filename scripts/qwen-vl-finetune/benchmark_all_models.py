#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Benchmark ALL local Ollama vision models against 5 real PTCG card images.

Usage:
  python benchmark_all_models.py [--ollama-url http://127.0.0.1:11434] [--timeout 300]

Vision-capable models are auto-detected from the Ollama model list.
Results are saved to:  benchmarks/all_models/benchmark_all_models.json
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
    from PIL import Image
except ImportError:
    print("ERROR: pip install Pillow")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OLLAMA_BASE_URL = "http://127.0.0.1:11434"

# Models known to support vision (substring match against ollama list names).
# Add any new multimodal model names here.
VISION_MODEL_KEYWORDS = [
    "vision", "vl", "llava", "minicpm", "moondream",
    "deepseek-ocr", "glm-ocr", "bakllava",
]

# 5 real local card images: HK SV8, JP SV8, JP SV9, JP legacy, JP promo
DEFAULT_IMAGES = [
    ("hk-SV08",     r"C:\AI_Server\Coding\PTCG_2026\data\images\cards\hk\SV08\hk00017760.png",        "zh-HK"),
    ("jp-sv8",      r"C:\AI_Server\Coding\PTCG_2026\data\images\cards\japan\sv8\jp46341.png",          "ja-JP"),
    ("jp-sv9",      r"C:\AI_Server\Coding\PTCG_2026\data\images\cards\japan\sv9\jp47009.png",          "ja-JP"),
    ("jp-legacy",   r"C:\AI_Server\Coding\PTCG_2026\data\images\cards\japan_legacy\japan\jpn30001.png","ja-JP"),
    ("jp-promo",    r"C:\AI_Server\Coding\PTCG_2026\data\images\cards\japan\m-p\jp48247.png",          "ja-JP"),
]

PROMPT = (
    "请分析图片。如果是Pokemon/宝可梦TCG卡，以JSON格式返回："
    '{"isCard":true,"cardName":"名称","cardCode":"编号","set":"系列","rarity":"稀有度","language":"语言"}'
    "。如果不是卡片，返回 {\"isCard\":false}。只输出JSON，不要其他文字。"
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_vision_models(base_url: str) -> list[str]:
    """Return model names from Ollama that appear to support vision."""
    try:
        r = requests.get(f"{base_url}/api/tags", timeout=10)
        r.raise_for_status()
        all_models = [m["name"] for m in r.json().get("models", [])]
    except Exception as e:
        print(f"ERROR: Cannot reach Ollama at {base_url}: {e}")
        sys.exit(1)

    vision = [
        m for m in all_models
        if any(kw in m.lower() for kw in VISION_MODEL_KEYWORDS)
    ]
    return vision


def load_image_b64(path: str, max_px: int = 1024) -> str | None:
    """Load a local image and return resized base64-encoded PNG."""
    try:
        with open(path, "rb") as f:
            img_bytes = f.read()
        img = Image.open(BytesIO(img_bytes)).convert("RGB")
        if max(img.size) > max_px:
            img.thumbnail((max_px, max_px), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:
        print(f"  WARNING: Cannot load {path}: {e}")
        return None


def ollama_infer(model: str, prompt: str, image_b64: str,
                 timeout: int, base_url: str) -> tuple[str, float]:
    """Call /api/generate and return (raw_text, elapsed_sec)."""
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
        r = requests.post(
            f"{base_url}/api/generate",
            json=payload,
            timeout=timeout,
        )
        r.raise_for_status()
        data = r.json()
        text = data.get("response", "").strip()
        return text, time.time() - t0
    except requests.exceptions.Timeout:
        return "Error: timeout", time.time() - t0
    except Exception as e:
        return f"Error: {e}", time.time() - t0


def strip_thinking(text: str) -> str:
    """Remove <think>…</think> blocks emitted by reasoning models."""
    return re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()


def parse_json(text: str) -> dict | None:
    """Extract first JSON object from text (with thinking-strip fallback)."""
    for candidate in [strip_thinking(text), text]:
        try:
            return json.loads(candidate)
        except Exception:
            pass
        m = re.search(r"```json\s*([\s\S]*?)\s*```", candidate)
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


def run_model(model: str, images: list, timeout: int, base_url: str) -> dict:
    """Run one model against all images; return per-image results."""
    print(f"\n{'='*60}")
    print(f"  MODEL: {model}")
    print(f"{'='*60}")

    results = []
    for label, path, lang in images:
        if not os.path.exists(path):
            print(f"  SKIP  [{label}] image not found: {path}")
            results.append({"image": label, "language": lang, "success": False,
                            "error": "image not found", "time_sec": 0, "raw": ""})
            continue

        img_b64 = load_image_b64(path)
        if img_b64 is None:
            results.append({"image": label, "language": lang, "success": False,
                            "error": "load failed", "time_sec": 0, "raw": ""})
            continue

        raw, elapsed = ollama_infer(model, PROMPT, img_b64, timeout, base_url)
        parsed = parse_json(raw) if not raw.startswith("Error:") else None
        success = parsed is not None and parsed.get("isCard") is not False

        status = "OK  " if success else "FAIL"
        print(f"  {status} [{lang}] {label:<12} {elapsed:.1f}s", end="")
        if parsed and success:
            name = parsed.get("cardName", "?")[:20]
            code = parsed.get("cardCode", "?")[:15]
            rarity = parsed.get("rarity", "?")[:12]
            print(f"  → {name} | {code} | {rarity}", end="")
        elif raw.startswith("Error:"):
            print(f"  {raw[:60]}", end="")
        print()

        results.append({
            "image": label,
            "language": lang,
            "success": success,
            "time_sec": round(elapsed, 2),
            "raw": raw[:500],
            "parsed": parsed,
        })

    ok = sum(1 for r in results if r["success"])
    times = [r["time_sec"] for r in results if r["time_sec"] > 0]
    avg_t = round(sum(times) / len(times), 1) if times else 0
    print(f"  → {ok}/{len(images)} success | avg {avg_t}s/card")

    return {
        "success_count": ok,
        "total": len(images),
        "success_rate": round(ok / len(images) * 100, 1) if images else 0,
        "avg_time_sec": avg_t,
        "results": results,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Benchmark all Ollama vision models on PTCG cards")
    parser.add_argument("--ollama-url", default=OLLAMA_BASE_URL)
    parser.add_argument("--timeout",    type=int, default=300,
                        help="Per-image timeout in seconds (default: 300)")
    parser.add_argument("--output-dir", default="./benchmarks/all_models")
    parser.add_argument("--models",     nargs="*", default=None,
                        help="Override model list (default: auto-detect vision models)")
    args = parser.parse_args()

    print("=" * 60)
    print("  PTCG — Benchmark All Local Vision Models")
    print("=" * 60)

    # Determine models to test
    if args.models:
        models = args.models
    else:
        all_models = get_vision_models(args.ollama_url)
        # Exclude huge models that will definitely time out
        models = [m for m in all_models if "90b" not in m]
        if not models:
            print("No vision-capable models found in Ollama.")
            sys.exit(1)

    print(f"\nModels to benchmark ({len(models)}):")
    for m in models:
        print(f"  - {m}")

    print(f"\nImages ({len(DEFAULT_IMAGES)}):")
    for label, path, lang in DEFAULT_IMAGES:
        exists = "✓" if os.path.exists(path) else "✗ MISSING"
        print(f"  {exists}  [{lang}] {label}: {Path(path).name}")

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    all_results = {}
    grand_start = time.time()

    for model in models:
        model_result = run_model(model, DEFAULT_IMAGES, args.timeout, args.ollama_url)
        all_results[model] = model_result

    total_time = time.time() - grand_start

    # -----------------------------------------------------------------------
    # Summary table
    # -----------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("  SUMMARY")
    print("=" * 60)
    print(f"  {'Model':<35} {'Success':>8}  {'Avg(s)':>7}  {'Rate':>6}")
    print(f"  {'-'*35} {'-'*8}  {'-'*7}  {'-'*6}")
    for model, data in sorted(all_results.items(),
                               key=lambda x: -x[1]["success_rate"]):
        ok = data["success_count"]
        total = data["total"]
        avg = data["avg_time_sec"]
        rate = data["success_rate"]
        print(f"  {model:<35} {ok}/{total}       {avg:>6.1f}s  {rate:>5.1f}%")

    print(f"\n  Total benchmark time: {total_time/60:.1f} min")
    print("=" * 60)

    # Save
    report = {
        "timestamp": datetime.now().isoformat(),
        "ollama_url": args.ollama_url,
        "images": [{"label": l, "path": p, "language": lg} for l, p, lg in DEFAULT_IMAGES],
        "total_benchmark_time_sec": round(total_time, 1),
        "models": all_results,
    }
    out_path = out_dir / "benchmark_all_models.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nResults saved: {out_path}")


if __name__ == "__main__":
    main()
