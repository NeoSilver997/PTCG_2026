"""
Import Japanese card JSON files to the API database
"""

import json
import requests
from pathlib import Path
import logging
import time
from typing import List, Dict

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class CardImporter:
    """Import Japanese card data to API"""
    
    def __init__(
        self,
        api_url: str = "http://localhost:4000/api/v1/cards/import/batch",
        batch_size: int = 100
    ):
        self.api_url = api_url
        self.batch_size = batch_size
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
        })
    
    def import_from_directory(
        self,
        json_dir: Path,
        pattern: str = "japanese_cards_*.json"
    ) -> Dict[str, int]:
        """
        Import all JSON files from a directory
        
        Args:
            json_dir: Directory containing JSON files
            pattern: Glob pattern for JSON files
            
        Returns:
            Dict with import statistics
        """
        json_files = sorted(json_dir.glob(pattern))
        
        if not json_files:
            logger.warning(f"No JSON files found matching pattern: {pattern}")
            return {'files': 0, 'success': 0, 'failed': 0}
        
        logger.info(f"Found {len(json_files)} JSON files to import")
        
        total_stats = {
            'files': 0,
            'total_cards': 0,
            'success': 0,
            'failed': 0,
            'errors': []
        }
        
        for json_file in json_files:
            logger.info(f"\n{'='*60}")
            logger.info(f"Processing: {json_file.name}")
            logger.info(f"{'='*60}")
            
            try:
                stats = self.import_from_file(json_file)
                total_stats['files'] += 1
                total_stats['total_cards'] += stats.get('total', 0)
                total_stats['success'] += stats.get('success', 0)
                total_stats['failed'] += stats.get('failed', 0)
                total_stats['errors'].extend(stats.get('errors', []))
                
                logger.info(f"✓ {json_file.name}: {stats.get('success', 0)} success, {stats.get('failed', 0)} failed")
                
            except Exception as e:
                logger.error(f"✗ Failed to process {json_file.name}: {e}")
                total_stats['errors'].append(f"{json_file.name}: {str(e)}")
        
        return total_stats
    
    def import_from_file(self, json_path: Path) -> Dict[str, int]:
        """
        Import cards from a single JSON file
        
        Args:
            json_path: Path to JSON file
            
        Returns:
            Dict with import statistics
        """
        with open(json_path, 'r', encoding='utf-8') as f:
            cards = json.load(f)
        
        if not isinstance(cards, list):
            raise ValueError(f"JSON file must contain an array of cards")
        
        logger.info(f"Loaded {len(cards)} cards from {json_path.name}")
        
        # Import in batches
        stats = {
            'total': len(cards),
            'success': 0,
            'failed': 0,
            'errors': []
        }
        
        for i in range(0, len(cards), self.batch_size):
            batch = cards[i:i + self.batch_size]
            batch_num = i // self.batch_size + 1
            total_batches = (len(cards) + self.batch_size - 1) // self.batch_size
            
            logger.info(f"Importing batch {batch_num}/{total_batches} ({len(batch)} cards)")
            
            try:
                result = self.import_batch(batch)
                stats['success'] += result.get('success', 0)
                stats['failed'] += result.get('failed', 0)
                stats['errors'].extend(result.get('errors', []))
                
            except Exception as e:
                logger.error(f"Batch {batch_num} failed: {e}")
                stats['failed'] += len(batch)
                stats['errors'].append(f"Batch {batch_num}: {str(e)}")
            
            # Small delay between batches
            time.sleep(0.5)
        
        return stats
    
    def import_batch(self, cards: List[Dict]) -> Dict[str, int]:
        """
        Import a batch of cards via API
        
        Args:
            cards: List of card dictionaries
            
        Returns:
            Dict with import results
        """
        payload = {'cards': cards}
        
        try:
            response = self.session.post(
                self.api_url,
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"  ✓ Success: {result.get('success', 0)}, Failed: {result.get('failed', 0)}")
            
            return result
            
        except requests.RequestException as e:
            logger.error(f"  ✗ API request failed: {e}")
            raise
        except json.JSONDecodeError as e:
            logger.error(f"  ✗ Invalid JSON response: {e}")
            raise


def main():
    """Main import function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Import Japanese cards to API database')
    parser.add_argument(
        '--dir',
        type=str,
        default='data/cards/japan',
        help='Directory containing JSON files'
    )
    parser.add_argument(
        '--pattern',
        type=str,
        default='japanese_cards_40k_*.json',
        help='Glob pattern for JSON files'
    )
    parser.add_argument(
        '--api-url',
        type=str,
        default='http://localhost:4000/api/v1/cards/import/batch',
        help='API endpoint URL'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=100,
        help='Number of cards per batch'
    )
    parser.add_argument(
        '--file',
        type=str,
        help='Import a single JSON file instead of directory'
    )
    
    args = parser.parse_args()
    
    importer = CardImporter(
        api_url=args.api_url,
        batch_size=args.batch_size
    )
    
    if args.file:
        # Import single file
        json_path = Path(args.file)
        if not json_path.exists():
            logger.error(f"File not found: {json_path}")
            return
        
        logger.info(f"Importing single file: {json_path}")
        stats = importer.import_from_file(json_path)
        
    else:
        # Import directory
        json_dir = Path(__file__).parent.parent / args.dir
        if not json_dir.exists():
            logger.error(f"Directory not found: {json_dir}")
            return
        
        stats = importer.import_from_directory(json_dir, args.pattern)
    
    # Print summary
    logger.info(f"\n{'='*60}")
    logger.info(f"IMPORT SUMMARY")
    logger.info(f"{'='*60}")
    logger.info(f"Files processed:  {stats.get('files', 1)}")
    logger.info(f"Total cards:      {stats.get('total_cards', stats.get('total', 0))}")
    logger.info(f"Successfully imported: {stats.get('success', 0)}")
    logger.info(f"Failed:           {stats.get('failed', 0)}")
    
    if stats.get('errors'):
        logger.info(f"\nFirst 10 errors:")
        for error in stats['errors'][:10]:
            logger.error(f"  - {error}")
    
    logger.info(f"{'='*60}")


if __name__ == '__main__':
    main()
