#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Benchmark via Ollama API
Supports any Ollama vision model (qwen3-vl, llava, llama3.2-vision, etc.)
"""

import os
import sys
import json
import time
import base64
import random
import argparse
import requests
from pathlib import Path
from datetime import datetime
from io import BytesIO

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow not installed. Run: pip install Pillow")
    sys.exit(1)

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL = "qwen3-vl:latest"


def check_ollama(base_url: str = OLLAMA_BASE_URL):
    """Verify Ollama is running and the model is available."""
    try:
        r = requests.get(f"{base_url}/api/tags", timeout=5)
        r.raise_for_status()
        models = [m["name"] for m in r.json().get("models", [])]
        return models
    except Exception as e:
        print(f"ERROR: Cannot connect to Ollama at {base_url}: {e}")
        return None


def load_image_as_b64(image_path: str) -> str | None:
    """Load image from URL or local path and return base64 string."""
    try:
        if image_path.startswith("data:image"):
            return image_path.split(",")[1]

        if image_path.startswith("http://") or image_path.startswith("https://"):
            r = requests.get(image_path, timeout=15)
            r.raise_for_status()
            img_bytes = r.content
        elif os.path.exists(image_path):
            with open(image_path, "rb") as f:
                img_bytes = f.read()
        else:
            print(f"  WARNING: Image not found: {image_path[:80]}...")
            return None

        # Resize to 1024px max to keep tokens reasonable
        img = Image.open(BytesIO(img_bytes)).convert("RGB")
        max_size = 1024
        if max(img.size) > max_size:
            img.thumbnail((max_size, max_size), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    except Exception as e:
        print(f"  WARNING: Image load failed: {e}")
        return None


def ollama_infer(model: str, prompt: str, image_b64: str | None, timeout: int = 120, base_url: str = OLLAMA_BASE_URL) -> tuple[str, bool]:
    """Run inference via Ollama /api/chat endpoint."""
    message = {"role": "user", "content": prompt}
    if image_b64:
        message["images"] = [image_b64]

    payload = {
        "model": model,
        "messages": [message],
        "stream": False,
        "think": False,  # Disable qwen3-vl thinking mode; content would otherwise be empty
        "options": {
            "temperature": 0.1,
            "num_predict": 4096,
        },
    }

    try:
        r = requests.post(
            f"{base_url}/api/chat",
            json=payload,
            timeout=timeout,
        )
        r.raise_for_status()
        data = r.json()
        msg = data.get("message", {})
        text = msg.get("content", "").strip()
        # Qwen3 thinking models put reasoning in 'thinking' and answer in 'content'.
        # If think=False was honoured content will be populated; otherwise fall back.
        if not text:
            text = msg.get("thinking", "").strip()
        return text, True
    except requests.exceptions.Timeout:
        return "Error: timeout", False
    except Exception as e:
        return f"Error: {e}", False


def parse_json_output(text: str) -> dict | None:
    """Attempt to extract a JSON object from model output."""
    import re
    if not text or text.startswith("Error:"):
        return None
    # Strip <think>...</think> blocks (qwen3 inline thinking) and parse after them
    stripped = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    candidates = [stripped, text] if stripped != text else [text]
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except Exception:
            pass
        m = re.search(r"```json\s*(.*?)\s*```", candidate, re.DOTALL)
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


def load_test_data(path: str, language: str, max_samples: int) -> list:
    """Load samples from test.jsonl filtered by language."""
    if not os.path.exists(path):
        print(f"ERROR: Test data not found: {path}")
        return []
    samples = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                s = json.loads(line)
                if language == "all" or s.get("metadata", {}).get("language") == language:
                    samples.append(s)
            except json.JSONDecodeError:
                pass
    if not samples:
        print(f"ERROR: No samples found for language={language!r}")
        return []
    random.shuffle(samples)
    return samples[:max_samples]


def main():
    parser = argparse.ArgumentParser(description="PTCG Benchmark via Ollama")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL,
                        help="Ollama model tag (default: qwen3-vl:latest)")
    parser.add_argument("--test-data", type=str,
                        default="./datasets/test.jsonl")
    parser.add_argument("--samples", type=int, default=20)
    parser.add_argument("--language", type=str, default="all",
                        help="Filter by language: zh-HK, ja-JP, en-US, all (default: all)")
    parser.add_argument("--output-dir", type=str, default="./benchmarks/ollama")
    parser.add_argument("--timeout", type=int, default=120,
                        help="Per-request timeout in seconds (default: 120)")
    parser.add_argument("--prompt", type=str, default=None,
                        help="Override the default prompt with a custom one")
    parser.add_argument("--ollama-url", type=str, default="http://127.0.0.1:11434")
    args = parser.parse_args()

    base_url = args.ollama_url

    print("=" * 60)
    print(f"PTCG Benchmark — Ollama: {args.model}")
    print("=" * 60)

    # Check Ollama connectivity
    available_models = check_ollama(base_url)
    if available_models is None:
        sys.exit(1)

    if args.model not in available_models:
        print(f"WARNING: Model '{args.model}' not in Ollama list.")
        print(f"Available: {', '.join(available_models)}")
        print("Attempting inference anyway (model may still be loading)...")
    else:
        print(f"OK: Model '{args.model}' is ready")

    # Load test data
    print(f"\nLoading data: {args.test_data} (language={args.language!r}, n={args.samples})")
    samples = load_test_data(args.test_data, args.language, args.samples)
    if not samples:
        sys.exit(1)
    print(f"OK: {len(samples)} samples loaded")

    # Prompts
    prompts = {
        "zh-HK": "以 JSON 格式提取所有卡牌資訊，包含欄位：name, hp, type, subtype, abilities 陣列, attacks 陣列, setCode, cardNumber, rarity",
        "ja-JP": "このポケモンカードの情報をJSONで抽出してください。フィールド：name, hp, type, subtype, abilities配列, attacks配列, setCode, cardNumber, rarity",
        "en-US": "Extract all card information as JSON with fields: name, hp, type, subtype, abilities array, attacks array, setCode, cardNumber, rarity",
        "all":   "Extract all card information as JSON with fields: name, hp, type, subtype, abilities array, attacks array, setCode, cardNumber, rarity",
    }
    prompt = args.prompt if args.prompt else prompts.get(args.language, prompts["all"])

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    results = []
    inference_times = []
    success_count = 0
    image_fail_count = 0

    print(f"\nRunning {len(samples)} inferences...")
    print("-" * 60)

    total_start = time.time()

    for i, sample in enumerate(samples):
        metadata = sample.get("metadata", {})
        card_name = metadata.get("name", "unknown")[:20]
        lang = metadata.get("language", "?")

        # Extract image path and ground truth
        image_path = None
        ground_truth_text = ""
        for msg in sample.get("messages", []):
            if msg["role"] == "user":
                for c in msg.get("content", []):
                    if c["type"] == "image":
                        image_path = c["image"]
            elif msg["role"] == "assistant":
                for c in msg.get("content", []):
                    if c["type"] == "text":
                        ground_truth_text = c["text"]

        # Load image
        image_b64 = load_image_as_b64(image_path) if image_path else None
        if image_b64 is None:
            image_fail_count += 1

        # Infer
        t0 = time.time()
        predicted_text, infer_ok = ollama_infer(args.model, prompt, image_b64, timeout=args.timeout, base_url=base_url)
        elapsed = time.time() - t0
        inference_times.append(elapsed)

        predicted = parse_json_output(predicted_text)
        success = infer_ok and predicted is not None
        if success:
            success_count += 1

        status = "OK  " if success else "FAIL"
        img_tag = "no-img" if image_b64 is None else ""
        print(f"[{i+1:3d}/{len(samples)}] {status} [{lang:5s}] {card_name:20s} {img_tag:8s} {elapsed:.1f}s")

        results.append({
            "idx": i,
            "name": card_name,
            "language": lang,
            "success": success,
            "has_image": image_b64 is not None,
            "inference_time": elapsed,
            "predicted_text": predicted_text[:1000] if predicted_text else "",
        })

    total_time = time.time() - total_start

    # Summary
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)
    success_rate = success_count / len(samples) * 100 if samples else 0
    avg_time = sum(inference_times) / len(inference_times) if inference_times else 0

    print(f"  Model:          {args.model}")
    print(f"  Samples:        {len(samples)}")
    print(f"  Success:        {success_count} ({success_rate:.1f}%)")
    print(f"  Failed:         {len(samples) - success_count}")
    print(f"  Image failures: {image_fail_count}")
    print(f"  Total time:     {total_time:.1f}s ({total_time/60:.1f} min)")
    print(f"  Avg inference:  {avg_time:.2f}s ({avg_time*1000:.0f}ms)")
    print(f"  Min/Max:        {min(inference_times):.2f}s / {max(inference_times):.2f}s")

    report = {
        "timestamp": datetime.now().isoformat(),
        "model": args.model,
        "language_filter": args.language,
        "total_samples": len(samples),
        "success_count": success_count,
        "success_rate": success_rate,
        "image_fail_count": image_fail_count,
        "total_time_sec": total_time,
        "avg_inference_time_sec": avg_time,
        "min_inference_time_sec": min(inference_times),
        "max_inference_time_sec": max(inference_times),
        "detailed_results": results,
    }

    out_file = output_dir / f"benchmark_{args.model.replace(':', '_').replace('/', '_')}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\nResults saved: {out_file}")
    print("=" * 60)


if __name__ == "__main__":
    main()
