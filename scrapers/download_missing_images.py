"""
Download only the truly missing images identified by analyze_missing_images.py
"""

import json
from pathlib import Path
import requests
import time
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def download_missing_images(delay: float = 1.5):
    """Download images from missing_images.json"""
    
    data_root = Path(__file__).parent.parent / 'data'
    missing_file = data_root / 'missing_images.json'
    images_dir = data_root / 'images' / 'cards' / 'japan'
    
    if not missing_file.exists():
        logger.error("missing_images.json not found. Run analyze_missing_images.py first.")
        return
    
    # Load missing images
    with open(missing_file, 'r', encoding='utf-8') as f:
        missing_by_expansion = json.load(f)
    
    total_missing = sum(len(cards) for cards in missing_by_expansion.values())
    logger.info(f"Found {total_missing} missing images across {len(missing_by_expansion)} expansions")
    
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })
    
    stats = {'success': 0, 'failed': 0, 'skipped': 0}
    current = 0
    
    for expansion, cards in missing_by_expansion.items():
        logger.info(f"\n📦 Processing {expansion} ({len(cards)} cards)")
        
        for card in cards:
            current += 1
            web_card_id = card['webCardId']
            image_url = card['imageUrl']
            name = card['name']
            
            # Determine expansion directory
            target_dir = images_dir / expansion
            target_dir.mkdir(parents=True, exist_ok=True)
            file_path = target_dir / f"{web_card_id}.png"
            
            # Double-check if exists
            if file_path.exists():
                logger.info(f"[{current}/{total_missing}] Skipping {web_card_id} (already exists)")
                stats['skipped'] += 1
                continue
            
            try:
                logger.info(f"[{current}/{total_missing}] Downloading {name} ({web_card_id})")
                response = session.get(image_url, timeout=30)
                response.raise_for_status()
                
                with open(file_path, 'wb') as f:
                    f.write(response.content)
                
                file_size = file_path.stat().st_size
                logger.info(f"✓ Saved {web_card_id} ({file_size:,} bytes)")
                stats['success'] += 1
                
                time.sleep(delay)
                
            except requests.RequestException as e:
                logger.error(f"✗ Failed to download {web_card_id}: {e}")
                stats['failed'] += 1
            except Exception as e:
                logger.error(f"✗ Error saving {web_card_id}: {e}")
                stats['failed'] += 1
    
    # Summary
    logger.info(f"\n{'='*60}")
    logger.info(f"📊 DOWNLOAD SUMMARY")
    logger.info(f"{'='*60}")
    logger.info(f"Success:  {stats['success']}")
    logger.info(f"Failed:   {stats['failed']}")
    logger.info(f"Skipped:  {stats['skipped']}")
    logger.info(f"{'='*60}")


if __name__ == '__main__':
    download_missing_images()
