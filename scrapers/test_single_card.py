from src.hk_card_scraper import HkCardScraper
import json

scraper = HkCardScraper()
url = "https://asia.pokemon-card.com/hk/card-search/detail/15498/"
card = scraper.scrape_card_details(url)

print("=== Card 15498 ===")
print(f"Name: {card.get('name')}")
print(f"RegulationMark: {card.get('regulationMark')}")
print(f"\nAttacks:")
print(json.dumps(card.get('attacks', []), indent=2, ensure_ascii=False))
print(f"\nAbilities:")
print(json.dumps(card.get('abilities', []), indent=2, ensure_ascii=False))
