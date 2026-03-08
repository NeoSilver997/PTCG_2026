#!/usr/bin/env python3
"""
Client for the fine-tuned PTCG card reader model.

Supported backends:
  llama-server (default)
    - Runs against the local llama-server OpenAI-compatible endpoint (port 8080)
    - FULL vision support — recommended for image inference
    - Start server: see run_server.bat or batch_extract_vulkan.py

  ollama
    - Runs against Ollama API (port 11434)
    - WARNING: Ollama <=0.17.6 does NOT support qwen2vl vision rendering.
      Text-only queries work fine, but image queries produce garbage output.
    - Use only if you need Ollama compatibility and can live without vision.

Usage:
  python use_finetuned_model.py --image path/to/card.png
  python use_finetuned_model.py --image path/to/card.png --backend llama-server
  python use_finetuned_model.py --backend ollama --text "What is Pikachu's HP?"
  python use_finetuned_model.py --image path/to/card.png --output out.json
"""

import argparse
import base64
import json
import re
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("Please: pip install requests")
    sys.exit(1)

# --- Backend defaults ---
LLAMA_SERVER_URL = "http://127.0.0.1:8080/v1/chat/completions"
OLLAMA_BASE_URL  = "http://127.0.0.1:11434"  # use 127.0.0.1 not localhost (avoids WSL IPv6 routing)

PROMPT = (
    "Look at this Pokemon card image and extract the printed information. "
    "Return ONLY a JSON object with these fields: name, hp, types, supertype, subtype, rarity, "
    "attacks (array), abilities (array), retreat_cost, card_number. No markdown, no explanation."
)


def encode_image(path: Path) -> tuple[str, str]:
    suffix = path.suffix.lower()
    mime = "image/jpeg" if suffix in {".jpg", ".jpeg"} else f"image/{suffix[1:]}"
    return base64.b64encode(path.read_bytes()).decode(), mime


def fix_truncated_json(text: str) -> str:
    opens = text.count("{") - text.count("}")
    if opens > 0:
        text += "}" * opens
    opens = text.count("[") - text.count("]")
    if opens > 0:
        text += "]" * opens
    return text


def parse_response(text: str):
    text = re.sub(r"```(?:json)?\s*", "", text).replace("```", "").strip()
    s = text.find("{")
    e = text.rfind("}") + 1
    if s >= 0 and e > s:
        text = text[s:e]
    text = fix_truncated_json(text)
    try:
        return json.loads(text)
    except Exception:
        return {"_raw": text}


def call_llama_server(image_path: Path | None, text_prompt: str, server_url: str, timeout: int):
    """Call llama-server OpenAI-compatible endpoint. Full vision support."""
    content = []
    if image_path:
        img_b64, mime = encode_image(image_path)
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_b64}"}})
    content.append({"type": "text", "text": text_prompt})

    payload = {
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 1024,
        "temperature": 0,
    }
    t0 = time.time()
    r = requests.post(server_url, json=payload, timeout=timeout)
    r.raise_for_status()
    elapsed = time.time() - t0
    raw = r.json()["choices"][0]["message"]["content"]
    return parse_response(raw), raw, elapsed


def call_ollama(image_path: Path | None, text_prompt: str, base_url: str, model: str, timeout: int):
    """
    Call Ollama API.
    NOTE: Vision (image) inference for Qwen2.5-VL produces garbage output in
    Ollama <=0.17.6 because the qwen2vl renderer is not supported. Text-only works.
    """
    if image_path:
        print("⚠  WARNING: Ollama <=0.17.6 does not support qwen2vl vision rendering.")
        print("   Image will be passed but output may be garbled.")
        print("   Use --backend llama-server for reliable vision inference.\n")
        img_b64, _ = encode_image(image_path)
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": text_prompt, "images": [img_b64]}],
            "stream": False,
        }
        endpoint = f"{base_url}/api/chat"
    else:
        payload = {
            "model": model,
            "prompt": text_prompt,
            "stream": False,
        }
        endpoint = f"{base_url}/api/generate"

    t0 = time.time()
    r = requests.post(endpoint, json=payload, timeout=timeout)
    r.raise_for_status()
    elapsed = time.time() - t0
    data = r.json()
    raw = data.get("message", {}).get("content") or data.get("response", "")
    return parse_response(raw), raw, elapsed


def main():
    p = argparse.ArgumentParser(description="PTCG card reader model client")
    p.add_argument("--image", help="Path to card image file (required for vision inference)")
    p.add_argument("--text", default=None, help="Text-only prompt (overrides default PROMPT)")
    p.add_argument("--backend", choices=["llama-server", "ollama"], default="llama-server",
                   help="Backend to use. llama-server=full vision (default). ollama=text-only safe.")
    p.add_argument("--server", default=None,
                   help="Custom server URL. Defaults: llama-server=http://localhost:8080/v1/chat/completions, ollama=http://localhost:11434")
    p.add_argument("--model", default="ptcg-card-reader:latest",
                   help="Ollama model name (only used with --backend ollama)")
    p.add_argument("--timeout", type=int, default=120, help="Request timeout seconds")
    p.add_argument("--output", help="Optional path to write parsed JSON result")
    args = p.parse_args()

    image_path = Path(args.image) if args.image else None
    if image_path and not image_path.exists():
        print("Image not found:", image_path)
        sys.exit(1)

    prompt = args.text or PROMPT

    try:
        if args.backend == "llama-server":
            server_url = args.server or LLAMA_SERVER_URL
            parsed, raw, elapsed = call_llama_server(image_path, prompt, server_url, args.timeout)
        else:
            base_url = args.server or OLLAMA_BASE_URL
            parsed, raw, elapsed = call_ollama(image_path, prompt, base_url, args.model, args.timeout)
    except Exception as ex:
        print("ERROR:", ex)
        sys.exit(1)

    print(f"Elapsed: {elapsed:.2f}s")
    print("Parsed JSON:")
    print(json.dumps(parsed, ensure_ascii=False, indent=2))

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(parsed, f, ensure_ascii=False, indent=2)
        print("Wrote:", args.output)


if __name__ == '__main__':
    main()

