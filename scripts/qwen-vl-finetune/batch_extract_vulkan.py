#!/usr/bin/env python3
"""
Batch card image extraction using llama-server Vulkan backend.
Connects to local llama-server on port 8080 (OpenAI-compatible API).

Usage:
    python batch_extract_vulkan.py --input <image_dir> --output <results.json>
    python batch_extract_vulkan.py --input C:/AI_Server/Coding/PTCG_2026/data/images/cards/hk/SV08

Server must be running:
    start_server.bat  (or manually: llama-server --model ... --mmproj ...)
"""

import argparse
import base64
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

SERVER_URL = "http://localhost:8080/v1/chat/completions"
PROMPT = (
    "Look at this Pokemon card image and extract the printed information. "
    "Return ONLY a JSON object with EXACTLY these fields: "
    "name (string), hp (integer or null), types (array of English type strings), "
    "supertype (POKEMON/TRAINER/ENERGY), subtype (string or null), "
    "rarity (string), "
    "attacks (array of {cost: [], name, damage, effect}), "
    "abilities (array of {name, description}), "
    "retreat_cost (integer), card_number (string). "
    "Do NOT include any database IDs or extra fields. "
    "No markdown, no explanation."
)
SUPPORTED_EXT = {".jpg", ".jpeg", ".png", ".webp"}

# All valid PTCG energy types
_KNOWN_TYPES = {
    "GRASS", "FIRE", "WATER", "LIGHTNING", "PSYCHIC",
    "FIGHTING", "DARKNESS", "METAL", "COLORLESS", "DRAGON",
    "STELLAR",
}


def encode_image(path: Path) -> tuple[str, str]:
    """Return (base64_data, mime_type)."""
    suffix = path.suffix.lower()
    mime = "image/jpeg" if suffix in {".jpg", ".jpeg"} else f"image/{suffix[1:]}"
    return base64.b64encode(path.read_bytes()).decode(), mime


def extract_card(image_path: Path, timeout: int = 120) -> dict:
    """Send image to llama-server and return parsed JSON."""
    img_b64, mime = encode_image(image_path)
    payload = json.dumps({
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_b64}"}},
            {"type": "text", "text": PROMPT},
        ]}],
        "max_tokens": 1024,
        "temperature": 0,
    }).encode()

    req = urllib.request.Request(SERVER_URL, data=payload,
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        result = json.loads(resp.read())

    raw_text = result["choices"][0]["message"]["content"]
    return parse_response(raw_text, image_path.name)


def fix_pg_array(value):
    """Fix PostgreSQL array format {GRASS} returned as list of chars or as a string.

    The fine-tuned model was trained on data where types were stored as PostgreSQL
    text-array format {GRASS}, and learned to emit each character as a separate
    JSON array element. This normalises the output.
    """
    if isinstance(value, list):
        joined = "".join(str(v) for v in value)
    elif isinstance(value, str):
        joined = value
    else:
        return value

    # Only process if it looks like a pg-array (starts with { or is all-caps word)
    stripped = joined.strip("{}")
    if not stripped:
        return value

    # Try known type names first (handles truncated values too)
    found = [t for t in _KNOWN_TYPES if t in stripped.upper()]
    if found:
        return found

    # Fall back: comma-separated items inside the braces
    parts = [t.strip().strip('"') for t in stripped.split(",") if t.strip()]
    return parts if parts else value


def fix_truncated_json(text: str) -> str:
    """Attempt to close an unclosed JSON object by balancing braces/brackets."""
    depth_obj = 0
    depth_arr = 0
    in_str = False
    escape = False
    last_good = 0
    for i, ch in enumerate(text):
        if escape:
            escape = False
            continue
        if ch == "\\" and in_str:
            escape = True
            continue
        if ch == '"':
            in_str = not in_str
        if not in_str:
            if ch == "{":
                depth_obj += 1
            elif ch == "}":
                depth_obj -= 1
            elif ch == "[":
                depth_arr += 1
            elif ch == "]":
                depth_arr -= 1
            if depth_obj >= 0 and depth_arr >= 0:
                last_good = i
    # Truncate to last structurally valid position
    truncated = text[:last_good + 1]
    # Close open arrays/objects
    truncated = truncated.rstrip(",\n \t")
    closing = "]}" * depth_arr + "}" * max(0, depth_obj - 1)
    return truncated + closing if depth_obj > 0 else truncated


def parse_response(text: str, filename: str) -> dict:
    """Extract JSON from model response, with best-effort fixes."""
    # Strip markdown code fences
    text = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`").strip()

    # Find the first { ... } block
    match = re.search(r"\{.*", text, re.DOTALL)
    if match:
        text = match.group(0)

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Try to fix truncated JSON
        try:
            data = json.loads(fix_truncated_json(text))
            data["_truncated"] = True
        except json.JSONDecodeError:
            data = {"_raw": text[:500], "_parse_error": True}

    # Fix PostgreSQL-style array fields like {GRASS} -> ["GRASS"]
    for field in ("types", "subtype"):
        if field in data:
            data[field] = fix_pg_array(data[field])

    data["_source_file"] = filename
    return data


def check_server() -> bool:
    """Return True if llama-server is reachable."""
    try:
        req = urllib.request.Request("http://localhost:8080/health")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser(description="Batch PTCG card extraction via Vulkan llama-server")
    parser.add_argument("--input", "-i", required=True, help="Image file or directory")
    parser.add_argument("--output", "-o", default="", help="Output JSON file (default: <input_dir>/extraction_results.json)")
    parser.add_argument("--timeout", "-t", type=int, default=120, help="Per-image timeout in seconds")
    parser.add_argument("--limit", "-n", type=int, default=0, help="Max images to process (0=all)")
    parser.add_argument("--resume", action="store_true", help="Skip already-extracted filenames in output JSON")
    args = parser.parse_args()

    if not check_server():
        print("ERROR: llama-server not responding on port 8080.")
        print("Run: start_server.bat")
        return 1

    input_path = Path(args.input)
    if input_path.is_file():
        images = [input_path]
    elif input_path.is_dir():
        images = sorted([p for p in input_path.iterdir() if p.suffix.lower() in SUPPORTED_EXT])
    else:
        print(f"ERROR: {input_path} not found")
        return 1

    output_file = Path(args.output) if args.output else input_path.parent / "extraction_results.json"
    existing = {}
    if args.resume and output_file.exists():
        with open(output_file) as f:
            existing = {r["_source_file"]: r for r in json.load(f) if "_source_file" in r}
        print(f"Resuming: {len(existing)} already extracted")

    if args.limit > 0:
        images = images[:args.limit]

    print(f"Processing {len(images)} images → {output_file}")
    print(f"Server: {SERVER_URL}")
    print()

    results = list(existing.values())
    done = set(existing.keys())
    skipped = errors = 0

    for i, img_path in enumerate(images, 1):
        if img_path.name in done:
            skipped += 1
            continue

        t0 = time.time()
        try:
            data = extract_card(img_path, timeout=args.timeout)
            elapsed = time.time() - t0
            results.append(data)
            name = data.get("name", "?")
            print(f"[{i:4d}/{len(images)}] {img_path.name} → {name!r} ({elapsed:.1f}s)")
        except urllib.error.URLError as e:
            elapsed = time.time() - t0
            print(f"[{i:4d}/{len(images)}] {img_path.name} → ERROR: {e} ({elapsed:.1f}s)")
            results.append({"_source_file": img_path.name, "_error": str(e)})
            errors += 1
        except Exception as e:
            elapsed = time.time() - t0
            print(f"[{i:4d}/{len(images)}] {img_path.name} → ERROR: {e} ({elapsed:.1f}s)")
            results.append({"_source_file": img_path.name, "_error": str(e)})
            errors += 1

        # Save after every 10 images
        if i % 10 == 0:
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)

    # Final save
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print()
    print("=" * 50)
    print(f"Done: {len(results) - errors - skipped} extracted, {skipped} skipped, {errors} errors")
    print(f"Output: {output_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
