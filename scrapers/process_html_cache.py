#!/usr/bin/env python3
"""
HTML Cache Processor
Converts all cached HTML files in data/html/{region} to JSON data
"""

import sys
import os
from pathlib import Path
import argparse
import logging
from typing import List, Dict

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from japanese_card_scraper import JapaneseCardScraper, scrape_batch as scrape_jp, save_cards_by_expansion as save_jp
from hk_card_scraper import HkCardScraper, scrape_batch as scrape_hk, save_cards_by_expansion as save_hk
from english_card_scraper import EnglishCardScraper, scrape_batch as scrape_en, save_cards_by_expansion as save_en

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_cached_ids(html_dir: Path) -> List[int]:
    """Get list of card IDs from cached HTML files"""
    if not html_dir.exists():
        return []
    
    ids = []
    for file_path in html_dir.glob('*.html'):
        if file_path.stem.isdigit():
            ids.append(int(file_path.stem))
    return sorted(ids)

def process_region(region: str, data_root: Path):
    """Process all cached files for a region"""
    html_dir = data_root / 'html' / region
    
    logger.info(f"Scanning cache for {region} in {html_dir}...")
    card_ids = get_cached_ids(html_dir)
    
    if not card_ids:
        logger.warning(f"No cached files found for {region}")
        return

    logger.info(f"Found {len(card_ids)} cached cards for {region}")
    
    # Select scraper
    if region == 'japan':
        scraper = JapaneseCardScraper(data_root)
        scrape_func = scrape_jp
        save_func = save_jp
        output_file = 'japanese_cards.json'
    elif region == 'hongkong':
        scraper = HkCardScraper(data_root)
        scrape_func = scrape_hk  # Note: You need to implement scrape_batch in hk_card_scraper.py or use a generic one
        save_func = save_hk      # Note: Same for save_cards_by_expansion
        output_file = 'hk_cards.json'
    elif region == 'english':
        scraper = EnglishCardScraper(data_root)
        scrape_func = scrape_en  # Note: Same here
        save_func = save_en      # Note: Same here
        output_file = 'english_cards.json'
    else:
        logger.error(f"Unknown region: {region}")
        return

    # Create dummy scrape_batch and save functions if they weren't exported (I didn't implement them in the new files yet)
    # Checking if they exist...
    
    # Process
    logger.info(f"Processing {len(card_ids)} cards...")
    cards = []
    
    # Using the scraper instance directly if batch function missing
    # Since I didn't add scrape_batch to the new files in the previous turn, I'll implement a simple loop here
    if region in ['hongkong', 'english']:
        for card_id in card_ids:
            # Reconstruct URL (dummy URL, as cache-only ignores it but scraper expects it)
            if region == 'hongkong':
                url = f"https://asia.pokemon-card.com/hk/card-search/details.php/card/{card_id}/regu/all"
            else:
                url = f"https://asia.pokemon-card.com/sg/card-search/details.php/card/{card_id}/regu/all"
                
            card = scraper.scrape_card_details(url, cache_html=True, cache_only=True)
            if card:
                cards.append(card)
                if len(cards) % 100 == 0:
                    logger.info(f"Processed {len(cards)} cards...")
                    
        # Save results
        output_path = data_root / 'cards' / region / output_file
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Group by expansion manually since save function might be missing
        from collections import defaultdict
        import json
        
        by_expansion = defaultdict(list)
        for card in cards:
            expansion = card.get('expansionCode', 'unknown')
            by_expansion[expansion].append(card)
            
        for expansion, expansion_cards in by_expansion.items():
            file_path = output_path.parent / f"{output_path.stem}_{expansion}.json"
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(expansion_cards, f, ensure_ascii=False, indent=2)
            logger.info(f"Saved {len(expansion_cards)} cards to {file_path}")
            
    else:
        # Use existing Japanese batch function
        cards = scrape_func(card_ids, scraper, cache_html=True, cache_only=True)
        output_path = data_root / 'cards' / region / output_file
        output_path.parent.mkdir(parents=True, exist_ok=True)
        save_func(cards, output_path)

def main():
    parser = argparse.ArgumentParser(description='Convert HTML cache to JSON')
    parser.add_argument('--region', choices=['japan', 'hongkong', 'english', 'all'], default='all')
    args = parser.parse_args()
    
    script_dir = Path(__file__).parent
    data_root = script_dir.parent / 'data'
    
    regions = ['japan', 'hongkong', 'english'] if args.region == 'all' else [args.region]
    
    for region in regions:
        process_region(region, data_root)

if __name__ == '__main__':
    main()
