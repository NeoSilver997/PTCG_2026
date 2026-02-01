#!/usr/bin/env python3
"""
Re-scrape Trainer cards in batches
"""
import subprocess
import json
from pathlib import Path

# Load Trainer card IDs
ids_file = Path(__file__).parent / 'trainer_card_ids.txt'
with open(ids_file, 'r') as f:
    ids = f.read().strip().split(',')

print(f"Total Trainer cards to re-scrape: {len(ids)}")

# Batch size (avoid command line length limits)
batch_size = 500
output_dir = Path(__file__).parent.parent / 'data' / 'cards' / 'japan'
output_dir.mkdir(parents=True, exist_ok=True)

total_scraped = 0
failed_batches = []

for i in range(0, len(ids), batch_size):
    batch = ids[i:i+batch_size]
    batch_num = (i // batch_size) + 1
    total_batches = (len(ids) + batch_size - 1) // batch_size
    
    print(f"\n{'='*60}")
    print(f"Batch {batch_num}/{total_batches}: Scraping {len(batch)} cards (IDs {batch[0]}-{batch[-1]})")
    print(f"{'='*60}")
    
    batch_ids = ','.join(batch)
    output_file = output_dir / f'trainer_cards_batch_{batch_num}.json'
    
    cmd = [
        'python', 'src/japanese_card_scraper.py',
        '--ids', batch_ids,
        '--cache-only',
        '--threads', '20',
        '--output', str(output_file)
    ]
    
    try:
        result = subprocess.run(cmd, cwd=Path(__file__).parent, capture_output=False, text=True)
        if result.returncode == 0:
            total_scraped += len(batch)
            print(f"✓ Batch {batch_num} completed")
        else:
            print(f"✗ Batch {batch_num} failed")
            failed_batches.append(batch_num)
    except Exception as e:
        print(f"✗ Batch {batch_num} error: {e}")
        failed_batches.append(batch_num)

print(f"\n{'='*60}")
print(f"SCRAPING SUMMARY")
print(f"{'='*60}")
print(f"Total batches: {total_batches}")
print(f"Successful: {total_batches - len(failed_batches)}")
print(f"Failed: {len(failed_batches)}")
if failed_batches:
    print(f"Failed batch numbers: {failed_batches}")
print(f"{'='*60}")
