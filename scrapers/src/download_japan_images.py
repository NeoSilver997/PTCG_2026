"""
Download card images from scraped Japanese card JSON data
"""

import json
import requests
import time
from pathlib import Path
from typing import Dict, List
import argparse
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class JapaneseImageDownloader:
    """Download Japanese Pokemon card images"""
    
    def __init__(self, data_root: str = None):
        if data_root is None:
            script_dir = Path(__file__).parent.parent.parent
            data_root = script_dir / 'data'
        
        self.data_root = Path(data_root)
        self.images_dir = self.data_root / 'images' / 'cards' / 'japan'
        self.legacy_dir = self.data_root / 'images' / 'cards' / 'japan_legacy' / 'japan'
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def download_card_image(
        self,
        card_data: Dict,
        delay: float = 1.0
    ) -> bool:
        """
        Download a single card image
        
        Args:
            card_data: Card data dict with imageUrl and webCardId
            delay: Delay in seconds after download
            
        Returns:
            True if successful, False otherwise
        """
        web_card_id = card_data.get('webCardId')
        image_url = card_data.get('imageUrl')
        expansion = card_data.get('expansionCode', 'unknown')
        
        if not web_card_id or not image_url:
            logger.warning(f"Missing webCardId or imageUrl for card: {card_data.get('name')}")
            return False
        
        # Create expansion directory
        target_dir = self.images_dir / expansion
        target_dir.mkdir(parents=True, exist_ok=True)
        
        # Target file path
        file_path = target_dir / f"{web_card_id}.png"
        
        # Check if image exists in new download folder
        if file_path.exists():
            logger.info(f"Skipping {web_card_id} (already in new folder)")
            return True
        
        # Check if image exists in legacy folder (jpn##### format)
        legacy_id = web_card_id.replace('jp', 'jpn', 1)  # jp47009 -> jpn47009
        legacy_path = self.legacy_dir / f"{legacy_id}.png"
        if legacy_path.exists():
            logger.info(f"Skipping {web_card_id} (exists in legacy as {legacy_id})")
            return True
        
        try:
            logger.info(f"Downloading {web_card_id} from {image_url}")
            response = self.session.get(image_url, timeout=30)
            response.raise_for_status()
            
            # Save image
            with open(file_path, 'wb') as f:
                f.write(response.content)
            
            file_size = file_path.stat().st_size
            logger.info(f"✓ Saved {web_card_id} ({file_size:,} bytes)")
            
            # Rate limiting
            time.sleep(delay)
            return True
            
        except requests.RequestException as e:
            logger.error(f"✗ Failed to download {web_card_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"✗ Error saving {web_card_id}: {e}")
            return False
    
    def download_from_json(
        self,
        json_path: Path,
        limit: int = None,
        delay: float = 1.0
    ) -> Dict[str, int]:
        """
        Download images for all cards in a JSON file
        
        Args:
            json_path: Path to JSON file with card data
            limit: Maximum number of images to download (None = all)
            delay: Delay between downloads in seconds
            
        Returns:
            Dict with 'success' and 'failed' counts
        """
        # Load JSON data
        with open(json_path, 'r', encoding='utf-8') as f:
            cards = json.load(f)
        
        logger.info(f"Loaded {len(cards)} cards from {json_path.name}")
        
        if limit:
            cards = cards[:limit]
            logger.info(f"Limited to {limit} cards")
        
        success_count = 0
        failed_count = 0
        
        for i, card in enumerate(cards, 1):
            logger.info(f"\n[{i}/{len(cards)}] Processing: {card.get('name')}")
            
            if self.download_card_image(card, delay):
                success_count += 1
            else:
                failed_count += 1
        
        logger.info(f"\n{'='*60}")
        logger.info(f"Download complete!")
        logger.info(f"Success: {success_count}")
        logger.info(f"Failed: {failed_count}")
        logger.info(f"{'='*60}")
        
        return {'success': success_count, 'failed': failed_count}


def main():
    parser = argparse.ArgumentParser(
        description='Download Japanese Pokemon card images from JSON data'
    )
    parser.add_argument('--input', required=True, help='Input JSON file path')
    parser.add_argument('--limit', type=int, help='Maximum number of images to download')
    parser.add_argument('--delay', type=float, default=1.0,
                        help='Delay between downloads in seconds (default: 1.0)')
    parser.add_argument('--data-root', help='Root directory for data storage')
    
    args = parser.parse_args()
    
    # Initialize downloader
    downloader = JapaneseImageDownloader(args.data_root)
    
    # Download images
    json_path = Path(args.input)
    if not json_path.exists():
        logger.error(f"Input file not found: {json_path}")
        return 1
    
    results = downloader.download_from_json(json_path, args.limit, args.delay)
    
    return 0 if results['failed'] == 0 else 1


if __name__ == '__main__':
    exit(main())
