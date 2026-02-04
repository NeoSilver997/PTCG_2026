#!/usr/bin/env python3
"""
Analyze HTML cache structure using build_html_index logic from old scraper
Reports: folder structure, card ID distribution, and cache statistics
"""

import os
import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict

def build_html_index(root_dir):
    """Build a dictionary mapping web_card_id to file path for fast lookup"""
    print(f"Building HTML file index from: {root_dir}")
    id_to_path = {}
    expansion_stats = defaultdict(int)
    
    # Collect all HTML files
    html_files = []
    for dirpath, dirs, files in os.walk(root_dir):
        for fname in files:
            if fname.endswith('.html'):
                fpath = os.path.join(dirpath, fname)
                html_files.append(fpath)
    
    print(f"Found {len(html_files)} HTML files to index")
    
    # Function to process a single file
    def process_file(fpath):
        local_id_to_path = {}
        local_expansion = None
        try:
            # Extract expansion from folder name
            rel_path = os.path.relpath(fpath, root_dir)
            path_parts = rel_path.split(os.sep)
            if len(path_parts) > 1:
                local_expansion = path_parts[0]
            
            with open(fpath, 'r', encoding='utf-8') as fh:
                # Read first 2KB to find card ID (usually in URL near top)
                header = fh.read(2048)
                id_match = re.search(r'/detail/(\d+)/', header)
                if id_match:
                    card_id = id_match.group(1)
                    local_id_to_path[card_id] = fpath
                    return card_id, fpath, local_expansion
                else:
                    # Try extracting from filename
                    basename = os.path.basename(fpath)
                    filename_match = re.match(r'^(\d+)\.html$', basename)
                    if filename_match:
                        card_id = filename_match.group(1)
                        local_id_to_path[card_id] = fpath
                        return card_id, fpath, local_expansion
        except Exception as e:
            pass
        return None, None, None
    
    # Process files in parallel using threads
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(process_file, fpath) for fpath in html_files]
        processed = 0
        for future in as_completed(futures):
            card_id, fpath, expansion = future.result()
            if card_id:
                id_to_path[card_id] = fpath
                if expansion:
                    expansion_stats[expansion] += 1
            processed += 1
            if processed % 500 == 0:
                print(f"Processed {processed}/{len(html_files)} files, found {len(id_to_path)} IDs so far")
    
    print(f"\nIndexed {len(id_to_path)} cards from {len(html_files)} HTML files")
    return id_to_path, expansion_stats

def analyze_cache_structure(root_dir):
    """Analyze cache directory structure"""
    print(f"\n{'='*80}")
    print(f"CACHE STRUCTURE ANALYSIS")
    print(f"{'='*80}\n")
    print(f"Root directory: {root_dir}\n")
    
    # Check folder structure
    expansions = []
    flat_files = []
    
    if os.path.exists(root_dir):
        for item in os.listdir(root_dir):
            item_path = os.path.join(root_dir, item)
            if os.path.isdir(item_path):
                expansions.append(item)
            elif item.endswith('.html'):
                flat_files.append(item)
        
        print(f"Structure detected:")
        print(f"  - Expansion folders: {len(expansions)}")
        print(f"  - Flat HTML files: {len(flat_files)}\n")
        
        if expansions:
            print(f"Expansion folders found: {sorted(expansions)[:20]}{'...' if len(expansions) > 20 else ''}\n")
        
        if flat_files:
            print(f"Flat files sample: {flat_files[:10]}{'...' if len(flat_files) > 10 else ''}\n")
    else:
        print(f"ERROR: Directory does not exist: {root_dir}")
        return

def main():
    # Analyze migrated cache
    cache_dir = Path(__file__).parent.parent / 'data' / 'html' / 'hongkong'
    
    analyze_cache_structure(cache_dir)
    
    print(f"{'='*80}")
    print(f"BUILDING INDEX")
    print(f"{'='*80}\n")
    
    id_to_path, expansion_stats = build_html_index(cache_dir)
    
    # Print statistics
    print(f"\n{'='*80}")
    print(f"INDEX STATISTICS")
    print(f"{'='*80}\n")
    
    print(f"Total unique card IDs: {len(id_to_path)}")
    
    if id_to_path:
        card_ids = sorted([int(cid) for cid in id_to_path.keys()])
        print(f"ID range: {card_ids[0]} to {card_ids[-1]}")
        print(f"Sample IDs: {card_ids[:10]}...{card_ids[-10:]}")
    
    print(f"\nCards per expansion:")
    for expansion, count in sorted(expansion_stats.items(), key=lambda x: x[1], reverse=True)[:30]:
        print(f"  {expansion:20s}: {count:5d} cards")
    
    if len(expansion_stats) > 30:
        remaining = sum(list(expansion_stats.values())[30:])
        print(f"  ... ({len(expansion_stats) - 30} more expansions with {remaining} cards)")
    
    # Sample file paths
    print(f"\nSample file paths:")
    for i, (card_id, path) in enumerate(list(id_to_path.items())[:10]):
        rel_path = os.path.relpath(path, cache_dir)
        print(f"  ID {card_id}: {rel_path}")
    
    print(f"\n{'='*80}\n")

if __name__ == '__main__':
    main()
