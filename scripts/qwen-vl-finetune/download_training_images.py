#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Download and cache training images from JSONL files.
Rewrites JSONL files with local image paths for fast training.

Usage:
    python download_training_images.py
    python download_training_images.py --threads 8 --data-dir ./datasets --cache-dir ./image_cache
"""

import os
import sys
import json
import time
import argparse
import threading
from pathlib import Path
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
    from PIL import Image
except ImportError:
    print("ERROR: pip install requests Pillow")
    sys.exit(1)


def download_image(url: str, dest_path: Path, timeout: int = 15, retries: int = 3,
                   max_px: int = 448, jpeg_quality: int = 85) -> bool:
    """Download a single image, resize to max_px, save as JPEG for smaller cache."""
    if dest_path.exists():
        return True  # Already cached

    for attempt in range(retries):
        try:
            resp = requests.get(url, timeout=timeout, stream=True)
            resp.raise_for_status()
            from io import BytesIO
            img = Image.open(BytesIO(resp.content)).convert("RGB")
            # Resize: keep aspect ratio, longest side ≤ max_px
            if max(img.width, img.height) > max_px:
                img.thumbnail((max_px, max_px), Image.LANCZOS)
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            # Always save as JPEG regardless of original format
            jpeg_path = dest_path.with_suffix(".jpg")
            img.save(jpeg_path, "JPEG", quality=jpeg_quality, optimize=True)
            # If dest_path had a different suffix, update to .jpg
            if dest_path.suffix.lower() != ".jpg":
                dest_path = jpeg_path
            return True
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1 + attempt)
            else:
                print(f"  FAIL: {url} → {e}")
                for p in [dest_path, dest_path.with_suffix(".jpg")]:
                    if p.exists():
                        p.unlink()
    return False


def url_to_filename(url: str) -> str:
    """Convert image URL to a safe local filename (always .jpg after compression)."""
    parsed = urlparse(url)
    stem = Path(parsed.path).stem
    return stem + ".jpg"


def compress_existing_cache(cache_dir: Path, max_px: int = 448, quality: int = 85):
    """Recompress already-cached images: resize + convert to JPEG."""
    from io import BytesIO
    files = list(cache_dir.iterdir())
    image_files = [f for f in files if f.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'}]
    print(f"  Found {len(image_files)} cached images to compress...")
    
    saved_bytes = 0
    converted = 0
    errors = 0
    
    for f in image_files:
        try:
            img = Image.open(f).convert("RGB")
            orig_size = f.stat().st_size
            
            # Resize if needed
            if max(img.width, img.height) > max_px:
                img.thumbnail((max_px, max_px), Image.LANCZOS)
            
            # Save as JPEG (overwrite, normalize to .jpg extension)
            out_path = f.with_suffix(".jpg")
            img.save(out_path, "JPEG", quality=quality, optimize=True)
            
            # Remove original if it was a different format (e.g. .png)
            if f.suffix.lower() != ".jpg" and out_path != f:
                f.unlink()
            
            new_size = out_path.stat().st_size
            saved_bytes += orig_size - new_size
            converted += 1
        except Exception as e:
            print(f"  Error compressing {f.name}: {e}")
            errors += 1
        
        if converted % 200 == 0 and converted > 0:
            print(f"  Compressed {converted}/{len(image_files)} ({saved_bytes/1024/1024:.1f} MB saved so far)")
    
    print(f"  Done: {converted} compressed, {errors} errors, {saved_bytes/1024/1024:.1f} MB saved")
    return saved_bytes
    """Collect all image URLs from a JSONL file."""
    urls = set()
    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                sample = json.loads(line)
                for msg in sample.get("messages", []):
                    for content in msg.get("content", []):
                        if content.get("type") == "image":
                            img = content["image"]
                            if img.startswith("http"):
                                urls.add(img)
            except json.JSONDecodeError:
                pass
    return urls


def rewrite_jsonl_with_local_paths(
    src_path: Path, dest_path: Path, cache_dir: Path, fallback_http: bool = True
):
    """Rewrite JSONL replacing HTTP image URLs with local paths."""
    written = 0
    skipped = 0
    with open(src_path, "r", encoding="utf-8") as fin, \
         open(dest_path, "w", encoding="utf-8") as fout:
        for line in fin:
            if not line.strip():
                continue
            try:
                sample = json.loads(line)
                for msg in sample.get("messages", []):
                    for content in msg.get("content", []):
                        if content.get("type") == "image":
                            url = content["image"]
                            if url.startswith("http"):
                                filename = url_to_filename(url)
                                local_path = cache_dir / filename
                                if local_path.exists():
                                    content["image"] = str(local_path)
                                elif not fallback_http:
                                    content["image"] = str(local_path)  # will fail later
                fout.write(json.dumps(sample, ensure_ascii=False) + "\n")
                written += 1
            except json.JSONDecodeError:
                skipped += 1
    print(f"  Wrote {written} samples, skipped {skipped} malformed lines → {dest_path.name}")


def main():
    parser = argparse.ArgumentParser(description="Download and cache PTCG training images locally")
    parser.add_argument("--data-dir", type=str, default="./datasets")
    parser.add_argument("--cache-dir", type=str, default="./image_cache")
    parser.add_argument("--threads", type=int, default=8, help="Parallel download threads")
    parser.add_argument("--timeout", type=int, default=15, help="Request timeout seconds")
    parser.add_argument("--max-px", type=int, default=448, help="Max image dimension (resize to fit, default 448)")
    parser.add_argument("--quality", type=int, default=85, help="JPEG quality 1-95 (default 85)")
    parser.add_argument("--skip-download", action="store_true", help="Only rewrite JSONL paths, skip download")
    parser.add_argument("--compress-existing", action="store_true",
                        help="Recompress already-downloaded images and exit")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    # --compress-existing: just recompress cached files and update JSONLs
    if args.compress_existing:
        before_size = sum(f.stat().st_size for f in cache_dir.iterdir() if f.is_file())
        print(f"\nCache before: {before_size/1024/1024:.1f} MB ({sum(1 for _ in cache_dir.iterdir())} files)")
        print(f"Compressing to max {args.max_px}px JPEG Q{args.quality}...")
        compress_existing_cache(cache_dir, args.max_px, args.quality)
        after_size = sum(f.stat().st_size for f in cache_dir.iterdir() if f.is_file())
        print(f"Cache after:  {after_size/1024/1024:.1f} MB (saved {(before_size-after_size)/1024/1024:.1f} MB)")
        print(f"\nRewriting JSONL files with updated local paths...")
        jsonl_files = [f for f in data_dir.glob("*.jsonl") if not f.name.endswith("_local.jsonl")]
        for f in jsonl_files:
            local_f = f.parent / (f.stem + "_local.jsonl")
            rewrite_jsonl_with_local_paths(f, local_f, cache_dir)
        return

    jsonl_files = list(data_dir.glob("*.jsonl"))
    # Focus on source files (not already-local versions)
    source_files = [f for f in jsonl_files if not f.name.endswith("_local.jsonl")]
    print(f"\nFound {len(source_files)} JSONL files: {[f.name for f in source_files]}")

    # Step 1: Collect all unique URLs
    print("\n[1/3] Collecting image URLs...")
    all_urls = set()
    for f in source_files:
        urls = collect_urls_from_jsonl(f)
        print(f"  {f.name}: {len(urls)} URLs")
        all_urls.update(urls)
    print(f"  Total unique URLs: {len(all_urls)}")

    # Step 2: Download missing images
    if not args.skip_download:
        already_cached = sum(1 for u in all_urls if (cache_dir / url_to_filename(u)).exists())
        to_download = [(u, cache_dir / url_to_filename(u)) for u in all_urls
                       if not (cache_dir / url_to_filename(u)).exists()]
        print(f"\n[2/3] Downloading {len(to_download)} images ({already_cached} already cached)...")

        if to_download:
            success = 0
            fail = 0
            lock = threading.Lock()

            def worker(args_tuple):
                nonlocal success, fail
                url, path = args_tuple
                ok = download_image(url, path, timeout=args.timeout,
                                    max_px=args.max_px, jpeg_quality=args.quality)
                with lock:
                    if ok:
                        success += 1
                    else:
                        fail += 1
                    total_done = success + fail
                    if total_done % 50 == 0 or total_done == len(to_download):
                        pct = total_done / len(to_download) * 100
                        print(f"  Progress: {total_done}/{len(to_download)} ({pct:.0f}%) — OK:{success} FAIL:{fail}")
                return ok

            with ThreadPoolExecutor(max_workers=args.threads) as executor:
                list(executor.map(worker, to_download))

            print(f"\n  Download complete: {success} OK, {fail} failed")
        else:
            print("  All images already cached!")
    else:
        print("\n[2/3] Skipping download (--skip-download)")

    # Step 3: Rewrite JSONL files with local paths
    print("\n[3/3] Rewriting JSONL files with local paths...")
    for f in source_files:
        local_f = f.parent / (f.stem + "_local.jsonl")
        rewrite_jsonl_with_local_paths(f, local_f, cache_dir)

    # Summary
    cached_count = sum(1 for u in all_urls if (cache_dir / url_to_filename(u)).exists())
    print(f"\n{'='*60}")
    print(f"DONE")
    print(f"  Cache dir: {cache_dir} ({cached_count}/{len(all_urls)} images)")
    print(f"  Local JSONL files created:")
    for f in source_files:
        local_f = f.parent / (f.stem + "_local.jsonl")
        if local_f.exists():
            print(f"    {local_f.name}")
    print(f"\nTo use local images in training:")
    print(f"  python finetune_qwen_vl.py --data-dir ./datasets --use-local-images")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
