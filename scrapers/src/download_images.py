"""
Card Image Downloader
Downloads card images from Pokemon Card website and stores them in organized folders
"""

import os
import sys
import requests
import time
from pathlib import Path
from typing import Optional, Dict, List
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ImageDownloader:
    """Download and manage card images"""
    
    def __init__(self, data_root: str = None):
        """
        Initialize image downloader
        
        Args:
            data_root: Root directory for data storage (defaults to ../../data)
        """
        if data_root is None:
            # Default to data folder in project root
            script_dir = Path(__file__).parent.parent.parent
            data_root = script_dir / 'data'
        
        self.data_root = Path(data_root)
        self.images_dir = self.data_root / 'images' / 'cards'
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def download_card_image(
        self, 
        web_card_id: str, 
        image_url: str, 
        region: str = 'hk',
        expansion_code: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Download a single card image
        
        Args:
            web_card_id: Unique card identifier (e.g., 'hk00014744')
            image_url: URL to download image from
            region: Region code (hk/jp/en)
            expansion_code: Optional expansion code for folder organization
            
        Returns:
            Dict with download result
        """
        try:
            # Determine storage path
            if expansion_code:
                target_dir = self.images_dir / region / expansion_code
            else:
                target_dir = self.images_dir / region
            
            # Create directory if it doesn't exist
            target_dir.mkdir(parents=True, exist_ok=True)
            
            # Download image
            logger.info(f"Downloading {web_card_id} from {image_url}")
            response = self.session.get(image_url, timeout=30)
            response.raise_for_status()
            
            # Save image
            file_path = target_dir / f"{web_card_id}.png"
            with open(file_path, 'wb') as f:
                f.write(response.content)
            
            file_size = file_path.stat().st_size
            logger.info(f"Saved {web_card_id} ({file_size} bytes) to {file_path}")
            
            return {
                'success': True,
                'web_card_id': web_card_id,
                'path': str(file_path),
                'file_size': file_size
            }
            
        except requests.RequestException as e:
            logger.error(f"Failed to download {web_card_id}: {str(e)}")
            return {
                'success': False,
                'web_card_id': web_card_id,
                'error': str(e)
            }
        except Exception as e:
            logger.error(f"Unexpected error downloading {web_card_id}: {str(e)}")
            return {
                'success': False,
                'web_card_id': web_card_id,
                'error': str(e)
            }
    
    def download_batch(
        self,
        cards: List[Dict[str, str]],
        delay: float = 1.0
    ) -> Dict[str, int]:
        """
        Download multiple card images
        
        Args:
            cards: List of dicts with 'web_card_id', 'image_url', 'region', 'expansion_code'
            delay: Delay between requests in seconds
            
        Returns:
            Dict with success/failure counts
        """
        results = {
            'total': len(cards),
            'success': 0,
            'failed': 0,
            'errors': []
        }
        
        for i, card in enumerate(cards, 1):
            logger.info(f"Processing {i}/{len(cards)}: {card['web_card_id']}")
            
            result = self.download_card_image(
                web_card_id=card['web_card_id'],
                image_url=card['image_url'],
                region=card.get('region', 'hk'),
                expansion_code=card.get('expansion_code')
            )
            
            if result['success']:
                results['success'] += 1
            else:
                results['failed'] += 1
                results['errors'].append(result)
            
            # Rate limiting
            if i < len(cards):
                time.sleep(delay)
        
        logger.info(
            f"Batch download complete: {results['success']} succeeded, "
            f"{results['failed']} failed"
        )
        
        return results
    
    def check_image_exists(
        self,
        web_card_id: str,
        region: str = 'hk'
    ) -> bool:
        """
        Check if an image already exists in storage
        
        Args:
            web_card_id: Card identifier
            region: Region code
            
        Returns:
            True if image exists
        """
        region_dir = self.images_dir / region
        
        # Check all subdirectories
        for path in region_dir.rglob(f"{web_card_id}.png"):
            return True
        
        return False


def main():
    """Example usage"""
    downloader = ImageDownloader()
    
    # Example: Download sample cards
    sample_cards = [
        {
            'web_card_id': 'hk00017762',
            'image_url': 'https://asia.pokemon-card.com/hk/card-img/hk00017762.png',
            'region': 'hk',
            'expansion_code': 'SV08'
        },
        {
            'web_card_id': 'hk00017761',
            'image_url': 'https://asia.pokemon-card.com/hk/card-img/hk00017761.png',
            'region': 'hk',
            'expansion_code': 'SV08'
        },
        {
            'web_card_id': 'hk00017760',
            'image_url': 'https://asia.pokemon-card.com/hk/card-img/hk00017760.png',
            'region': 'hk',
            'expansion_code': 'SV08'
        }
    ]
    
    # Download batch
    results = downloader.download_batch(sample_cards, delay=1.0)
    
    print(f"\nDownload Summary:")
    print(f"Total: {results['total']}")
    print(f"Success: {results['success']}")
    print(f"Failed: {results['failed']}")
    
    if results['errors']:
        print("\nErrors:")
        for error in results['errors']:
            print(f"  - {error['web_card_id']}: {error['error']}")


if __name__ == '__main__':
    main()
