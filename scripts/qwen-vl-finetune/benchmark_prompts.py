#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Benchmark top 3 local Ollama vision models against custom sample images,
comparing 3 different prompts to find the best approach for PTCG cards.

Usage:
  python benchmark_prompts.py
  python benchmark_prompts.py --image-dir "C:/path/to/images" --ollama-url http://127.0.0.1:11434

Results saved to: benchmarks/prompts/benchmark_prompts.json
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
# Models to test
# ---------------------------------------------------------------------------

MODELS = [
    "qwen3-vl:latest",
    "llava:13b",
    "glm-ocr:latest",
]

# ---------------------------------------------------------------------------
# 3 Prompts to compare
# ---------------------------------------------------------------------------

PROMPTS = {
    "prompt_a_mixed": (
        "请分析图片。如果是Pokemon/宝可梦TCG卡，以JSON格式返回："
        '{"isCard":true,"cardName":"名称","cardCode":"编号","set":"系列","rarity":"稀有度","language":"语言"}'
        "。如果不是卡片，返回 {\"isCard\":false}。只输出JSON，不要其他文字。"
    ),
    "prompt_b_english": (
        "Analyze this image. If it shows a Pokemon Trading Card Game (TCG) card, "
        "extract its text and return ONLY a JSON object like this:\n"
        '{"isCard":true,"cardName":"<name on card>","cardCode":"<number e.g. 001/100>",'
        '"set":"<set code e.g. SV9>","rarity":"<rarity symbol>","language":"<ja-JP|zh-HK|en-US>"}\n'
        "If the image is NOT a Pokemon card, return: {\"isCard\":false}\n"
        "Output ONLY the JSON. No explanation, no markdown."
    ),
    "prompt_c_detailed": (
        "Look at this Pokemon TCG card image carefully.\n"
        "Read:\n"
        "1. Card name (top of card)\n"
        "2. Card number (bottom, e.g. 007/742 or 001/100)\n"
        "3. Set symbol or code (bottom right area)\n"
        "4. Rarity mark (star, circle, diamond, etc.)\n"
        "5. Language of the card text\n\n"
        "Return ONLY this JSON (no other text):\n"
        '{"isCard":true,"cardName":"...","cardCode":"...","set":"...","rarity":"...","language":"ja-JP or zh-HK or en-US"}\n'
        "If this is not a Pokemon card, return: {\"isCard\":false}"
    ),
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

OLLAMA_BASE_URL = "http://127.0.0.1:11434"


def get_image_paths(image_dir: str) -> list[tuple[str, str]]:
    """Return list of (label, path) for all image files in directory."""
    exts = {".png", ".jpg", ".jpeg", ".webp"}
    images = []
    for p in sorted(Path(image_dir).iterdir()):
        if p.suffix.lower() in exts:
            images.append((p.name, str(p)))
    return images


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


def strip_thinking(text: str) -> str:
    """Remove <think>…</think> blocks emitted by reasoning models."""
    return re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()


def parse_json(text: str) -> dict | None:
    """Extract first JSON object from text with multiple fallback strategies."""
    for candidate in [strip_thinking(text), text]:
        # 1. Direct parse
        try:
            return json.loads(candidate)
        except Exception:
            pass
        # 2. Fenced code block
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", candidate)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
        # 3. First { ... } span
        start, end = candidate.find("{"), candidate.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(candidate[start:end])
            except Exception:
                pass
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
        # Fallback: some thinking models put output in 'thinking' field
        if not text:
            text = data.get("thinking", "").strip()
        return text, time.time() - t0
    except requests.exceptions.Timeout:
        return "Error: timeout", time.time() - t0
    except Exception as e:
        return f"Error: {e}", time.time() - t0


def run_single(model: str, prompt_name: str, prompt: str, images: list[tuple[str, str]],
               timeout: int, base_url: str) -> dict:
    """Run one model × one prompt against all images. Returns summary dict."""
    results = []
    for label, path in images:
        img_b64 = load_image_b64(path)
        if img_b64 is None:
            results.append({"image": label, "success": False, "error": "load failed",
                            "time_sec": 0, "raw": "", "parsed": None})
            continue

        raw, elapsed = ollama_infer(model, prompt, img_b64, timeout, base_url)
        parsed = parse_json(raw) if not raw.startswith("Error:") else None
        success = parsed is not None and parsed.get("isCard") is not False

        status = "✓" if success else "✗"
        line = f"    {status} {label:<35} {elapsed:5.1f}s"
        if parsed and success:
            name = str(parsed.get("cardName", "?"))[:20]
            code = str(parsed.get("cardCode", "?"))[:12]
            rarity = str(parsed.get("rarity", "?"))[:10]
            line += f"  → {name} | {code} | {rarity}"
        elif raw.startswith("Error:"):
            line += f"  {raw[:50]}"
        else:
            line += f"  (no JSON)"
        print(line)

        results.append({
            "image": label,
            "success": success,
            "time_sec": round(elapsed, 2),
            "raw": raw,
            "parsed": parsed,
        })

    ok = sum(1 for r in results if r["success"])
    times = [r["time_sec"] for r in results if r["time_sec"] > 0]
    avg_t = round(sum(times) / len(times), 1) if times else 0
    return {
        "model": model,
        "prompt": prompt_name,
        "success_count": ok,
        "total": len(images),
        "success_rate": round(ok / len(images) * 100, 1) if images else 0,
        "avg_time_sec": avg_t,
        "results": results,
    }


def print_summary(all_results: list[dict]):
    """Print leaderboard table."""
    print("\n" + "=" * 70)
    print("  RESULTS SUMMARY")
    print("=" * 70)
    print(f"  {'Model':<26} {'Prompt':<22} {'Success':>9} {'Avg/s':>7} {'Rate':>7}")
    print("  " + "-" * 68)

    sorted_r = sorted(all_results, key=lambda x: (-x["success_rate"], x["avg_time_sec"]))
    for r in sorted_r:
        tag = "★" if r["success_rate"] == sorted_r[0]["success_rate"] and r["avg_time_sec"] == sorted_r[0]["avg_time_sec"] else " "
        print(f"  {tag}{r['model']:<25} {r['prompt']:<22} "
              f"{r['success_count']}/{r['total']:>2}  {r['avg_time_sec']:>6.1f}s  {r['success_rate']:>5.1f}%")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Benchmark top 3 PTCG vision models × 3 prompts on local card images"
    )
    parser.add_argument("--image-dir",  default=r"C:\AI_Server\Coding\PTCG_2026\data\test_sample",
                        help="Directory containing test card images")
    parser.add_argument("--ollama-url", default=OLLAMA_BASE_URL)
    parser.add_argument("--timeout",    type=int, default=20,
                        help="Per-image timeout in seconds (default: 20)")
    parser.add_argument("--output-dir", default="./benchmarks/prompts")
    parser.add_argument("--models",     nargs="*", default=None,
                        help="Override model list")
    parser.add_argument("--prompts",    nargs="*", default=None,
                        help="Prompt keys to run (e.g. prompt_a_mixed prompt_b_english)")
    args = parser.parse_args()

    models = args.models or MODELS
    prompt_keys = args.prompts or list(PROMPTS.keys())
    prompts = {k: PROMPTS[k] for k in prompt_keys if k in PROMPTS}

    # Load images
    image_dir = args.image_dir
    images = get_image_paths(image_dir)
    if not images:
        print(f"ERROR: No images found in {image_dir}")
        sys.exit(1)

    print("=" * 70)
    print("  PTCG — Vision Model × Prompt Benchmark")
    print("=" * 70)
    print(f"  Image dir : {image_dir}")
    print(f"  Images    : {len(images)} files")
    print(f"  Models    : {', '.join(models)}")
    print(f"  Prompts   : {', '.join(prompts.keys())}")
    print(f"  Ollama    : {args.ollama_url}")
    print(f"  Timeout   : {args.timeout}s/image")
    print(f"  Started   : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    os.makedirs(args.output_dir, exist_ok=True)

    all_results = []
    for model in models:
        for prompt_name, prompt_text in prompts.items():
            print(f"\n{'─'*70}")
            print(f"  MODEL: {model}  |  PROMPT: {prompt_name}")
            print(f"{'─'*70}")
            result = run_single(model, prompt_name, prompt_text, images,
                                args.timeout, args.ollama_url)
            all_results.append(result)

    print_summary(all_results)

    # Save results
    out_file = Path(args.output_dir) / "benchmark_prompts.json"
    payload = {
        "timestamp": datetime.now().isoformat(),
        "image_dir": image_dir,
        "image_count": len(images),
        "images": [label for label, _ in images],
        "models": models,
        "prompts": {k: v[:120] + "..." for k, v in prompts.items()},
        "results": all_results,
    }
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"\n  Results saved → {out_file}")
    print(f"  Finished   : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()
