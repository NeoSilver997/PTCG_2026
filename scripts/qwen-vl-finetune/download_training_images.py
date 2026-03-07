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


def download_image(url: str, dest_path: Path, timeout: int = 15, retries: int = 3) -> bool:
    """Download a single image with retry logic."""
    if dest_path.exists():
        return True  # Already cached

    for attempt in range(retries):
        try:
            resp = requests.get(url, timeout=timeout, stream=True)
            resp.raise_for_status()
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            with open(dest_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            # Verify it's a valid image
            img = Image.open(dest_path)
            img.verify()
            return True
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1 + attempt)
            else:
                print(f"  FAIL: {url} → {e}")
                if dest_path.exists():
                    dest_path.unlink()
    return False


def url_to_filename(url: str) -> str:
    """Convert image URL to a safe local filename."""
    parsed = urlparse(url)
    return Path(parsed.path).name


def collect_urls_from_jsonl(jsonl_path: Path):
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
    parser.add_argument("--skip-download", action="store_true", help="Only rewrite JSONL paths, skip download")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

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
                ok = download_image(url, path, timeout=args.timeout)
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
