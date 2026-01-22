"""
Test script for Japanese Card Scraper
Run this to verify the scraper is working correctly
"""

import sys
from pathlib import Path

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from japanese_card_scraper import JapaneseCardScraper, build_card_url

def test_single_card():
    """Test scraping a single card"""
    print("="*60)
    print("Testing Japanese Card Scraper - Single Card")
    print("="*60)
    
    # Initialize scraper
    scraper = JapaneseCardScraper()
    scraper.quiet = False
    
    # Test with a known card (Pikachu from recent set)
    test_card_id = 49355
    test_url = build_card_url(test_card_id)
    
    print(f"\nFetching card: {test_url}")
    print(f"Card ID: {test_card_id}\n")
    
    # Scrape the card
    card_data = scraper.scrape_card_details(
        test_url,
        cache_html=True,
        refresh_cache=False,
        cache_only=False
    )
    
    if card_data:
        print("\n" + "="*60)
        print("✅ SUCCESS - Card data extracted:")
        print("="*60)
        print(f"Web Card ID: {card_data.get('webCardId')}")
        print(f"Name: {card_data.get('name')}")
        print(f"Language: {card_data.get('language')}")
        print(f"Region: {card_data.get('region')}")
        print(f"Supertype: {card_data.get('supertype')}")
        print(f"Subtype: {card_data.get('subtype')}")
        print(f"Variant: {card_data.get('variantType')}")
        print(f"Rarity: {card_data.get('rarity')}")
        print(f"Expansion: {card_data.get('expansionCode')}")
        print(f"Collector #: {card_data.get('collectorNumber')}")
        
        if card_data.get('hp'):
            print(f"HP: {card_data.get('hp')}")
        if card_data.get('pokemonTypes'):
            print(f"Types: {', '.join(card_data.get('pokemonTypes', []))}")
        if card_data.get('evolutionStage'):
            print(f"Stage: {card_data.get('evolutionStage')}")
        
        if card_data.get('attacks'):
            print(f"\nAttacks: {len(card_data.get('attacks', []))}")
            for attack in card_data.get('attacks', []):
                print(f"  - {attack.get('name')}: {attack.get('cost')} → {attack.get('damage')}")
        
        if card_data.get('abilities'):
            print(f"\nAbilities: {len(card_data.get('abilities', []))}")
            for ability in card_data.get('abilities', []):
                print(f"  - {ability.get('name')}")
        
        print("\n" + "="*60)
        return True
    else:
        print("\n" + "="*60)
        print("❌ FAILED - Could not extract card data")
        print("="*60)
        return False

def test_cache_retrieval():
    """Test retrieving card from cache"""
    print("\n" + "="*60)
    print("Testing Cache Retrieval")
    print("="*60)
    
    scraper = JapaneseCardScraper()
    scraper.quiet = False
    
    test_card_id = 49355
    test_url = build_card_url(test_card_id)
    
    print(f"\nAttempting to retrieve cached card: {test_card_id}\n")
    
    card_data = scraper.scrape_card_details(
        test_url,
        cache_html=True,
        refresh_cache=False,
        cache_only=True  # Only use cache
    )
    
    if card_data:
        print("\n✅ Cache retrieval successful")
        print(f"Card: {card_data.get('name')}")
        return True
    else:
        print("\n⚠️  No cached data found (this is normal if test_single_card() hasn't been run)")
        return False

if __name__ == '__main__':
    print("\n🧪 Japanese Card Scraper Test Suite\n")
    
    # Test 1: Scrape a single card
    test1_passed = test_single_card()
    
    # Test 2: Retrieve from cache
    test2_passed = test_cache_retrieval()
    
    # Summary
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    print(f"Single card scraping: {'✅ PASSED' if test1_passed else '❌ FAILED'}")
    print(f"Cache retrieval:      {'✅ PASSED' if test2_passed else '⚠️  SKIPPED'}")
    print("="*60)
    
    if test1_passed:
        print("\n✅ Scraper is working correctly!")
        print("\nNext steps:")
        print("1. Run: python scrapers/src/japanese_card_scraper.py --id-range 48000 100 --cache-html")
        print("2. Check output in: data/cards/japan/")
        print("3. Import to database via API")
    else:
        print("\n❌ Scraper test failed. Check error messages above.")
    
    print()
