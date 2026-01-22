# PTCG Scrapers

Python-based web scrapers for collecting Pokemon TCG card and tournament data.

## Setup

Install dependencies:

```powershell
cd scrapers
pip install -r requirements.txt
```

## Japanese Card Scraper

Scrapes card details from pokemon-card.com (Japanese official site).

### Basic Usage

```powershell
# Scrape a range of cards with HTML caching
python src/japanese_card_scraper.py --id-range 48000 100 --cache-html

# Scrape specific cards
python src/japanese_card_scraper.py --ids 48717,48879,49536

# Scrape specific expansion only
python src/japanese_card_scraper.py --id-range 48000 1000 --expansions sv9 --cache-html
```

### Advanced Options

```powershell
# Fast offline processing (cache-only mode with 20 threads)
python src/japanese_card_scraper.py --id-range 48000 1000 --cache-only --threads 20

# Refresh cached HTML files
python src/japanese_card_scraper.py --id-range 48000 100 --refresh-cache --cache-html

# Custom rate limiting (3 seconds between requests)
python src/japanese_card_scraper.py --id-range 48000 100 --min-request-interval 3.0

# Compact JSON output (smaller files)
python src/japanese_card_scraper.py --id-range 48000 100 --compact-json
```

### Command Line Options

- `--ids`: Comma-separated list of card IDs to scrape
- `--id-range START COUNT`: Start ID and number of cards to scrape consecutively
- `--output PATH`: JSON output file path (default: japanese_cards.json)
- `--cache-html`: Persist HTML responses in `../data/html/japan/`
- `--cache-only`: Only parse cached HTML files, skip HTTP requests
- `--refresh-cache`: Force re-fetch even if cached HTML exists
- `--expansions CODES`: Filter for specific expansion codes (e.g., "sv8,sv9")
- `--threads N`: Number of parallel workers (default: 1)
- `--min-request-interval SECONDS`: Minimum seconds between requests (default: 2.0)
- `--compact-json`: Write compact JSON without pretty formatting
- `--quiet`: Suppress per-card log output

### Output Format

Cards are saved in PTCG_2026 schema format:

```json
{
  "webCardId": "jp49355",
  "name": "ピカチュウ",
  "language": "JA_JP",
  "region": "JP",
  "supertype": "POKEMON",
  "subtype": "BASIC",
  "variantType": "NORMAL",
  "rarity": "COMMON",
  "expansionCode": "sv9",
  "collectorNumber": "001/100",
  "hp": 60,
  "pokemonTypes": ["LIGHTNING"],
  "evolutionStage": "BASIC",
  "attacks": [
    {
      "name": "でんきショック",
      "cost": "雷",
      "damage": "10",
      "effect": "コインを1回投げウラなら、このワザは失敗。"
    }
  ],
  "weakness": {
    "type": "FIGHTING",
    "value": "×2"
  },
  "retreatCost": 1,
  "imageUrl": "https://www.pokemon-card.com/card_images/large/...",
  "illustrator": "Mitsuhiro Arita",
  "sourceUrl": "https://www.pokemon-card.com/card-search/details.php/card/49355",
  "scrapedAt": "2026-01-22T10:30:00"
}
```

### Data Mapping

The scraper maps Japanese card data to PTCG_2026 database enums:

- **Supertype**: POKEMON, TRAINER, ENERGY
- **Subtype**: BASIC, STAGE_1, STAGE_2, ITEM, SUPPORTER, STADIUM, TOOL, BASIC_ENERGY, SPECIAL_ENERGY
- **Pokemon Types**: FIRE, WATER, LIGHTNING, GRASS, FIGHTING, PSYCHIC, DARKNESS, METAL, COLORLESS, FAIRY, DRAGON
- **Rarity**: COMMON, UNCOMMON, RARE, DOUBLE_RARE, ULTRA_RARE, ILLUSTRATION_RARE, SPECIAL_ILLUSTRATION_RARE, HYPER_RARE, PROMO, etc.
- **Variant Types**: NORMAL, REVERSE_HOLO, HOLO, FULL_ART, SECRET_RARE, AR, SAR, SR, UR, etc.
- **Evolution Stages**: BASIC, STAGE_1, STAGE_2, MEGA, VMAX, VSTAR

### File Organization

- **HTML Cache**: `data/html/japan/{card_id}.html`
- **Card Data**: `data/cards/japan/japanese_cards_{expansion}.json`

Cards are automatically grouped by expansion code into separate JSON files.

## Image Downloader

Download card images from scraped data:

```powershell
python src/download_images.py --input data/cards/japan/japanese_cards_sv9.json
```

## Event Data Manager

Save tournament and event data:

```powershell
python src/save_event_data.py --event-id jp_champs_2026
```

## Best Practices

1. **Always use caching** for large scrapes to enable fast re-processing
2. **Respect rate limits** - default 2s between requests is safe
3. **Use threading cautiously** - max 5 threads for live scraping
4. **Cache-only mode** is safe for unlimited threads
5. **Filter by expansion** to avoid re-scraping old data
6. **Check logs** in `data/logs/` for detailed scraping activity

## Troubleshooting

**Problem**: Cards not scraping
- Check if card IDs are valid on pokemon-card.com
- Verify internet connection
- Increase `--min-request-interval` if getting rate limited

**Problem**: Missing attributes
- Some cards have incomplete data on the source website
- Check raw HTML cache files to verify source data

**Problem**: Slow scraping
- Use `--cache-html` then `--cache-only --threads 20` for fast re-processing
- Reduce `--min-request-interval` carefully (not recommended below 1.0s)

## Integration with NestJS API

Scraped JSON files can be imported into the database using the API's card import endpoints:

```bash
POST /api/v1/cards/import
Content-Type: application/json

{
  "source": "file",
  "filePath": "data/cards/japan/japanese_cards_sv9.json",
  "region": "JP"
}
```

See [API Documentation](../apps/api/README.md) for import endpoints.
