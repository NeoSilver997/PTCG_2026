# Data Storage Directory

This directory contains all persistent data for the PTCG CardDB project.

## Directory Structure

### 📁 `images/` - Card Images
- **cards/{region}/** - Full-size card images organized by region (hk/jp/en)
- **thumbnails/{region}/** - Optimized thumbnails (200x280px) for list views
- **cache/** - Temporary image cache

**Naming Convention:** Files are named using `webCardId` (e.g., `hk00014744.png`)

### 📁 `html/` - Archived HTML Files
- **cards/{region}/** - Scraped card detail pages for backup/debugging
- **events/** - Tournament and event pages
- **expansions/{region}/** - Expansion listing pages

**Purpose:** Allows re-parsing data if scraper logic changes, debugging scraper issues

### 📁 `events/` - Tournament Data
- **raw/** - Unprocessed scraper output (JSON)
- **processed/** - Validated and normalized event data
- **archives/** - Historical data organized by year/month

**File Format:**
```json
{
  "eventId": "2026-01-15_hong-kong-championship",
  "name": "香港錦標賽 2026",
  "date": "2026-01-15",
  "location": "香港會議展覽中心",
  "type": "CHAMPIONSHIP",
  "participants": 128,
  "topDecks": [
    {
      "placement": 1,
      "playerName": "陳大明",
      "deckType": "草系組合技",
      "deckList": {...}
    }
  ]
}
```

### 📁 `decks/` - Deck Lists
- **tournament/** - Winning decks from tournaments
- **user/** - User-created decks (organized by userId)
- **meta/** - Meta deck analysis and statistics

**File Format:**
```json
{
  "deckId": "xxx",
  "name": "莉佳的草系套牌",
  "type": "CONTROL",
  "format": "STANDARD",
  "cards": [
    {
      "cardId": "hk00014744",
      "quantity": 2,
      "category": "POKEMON"
    }
  ],
  "metadata": {
    "totalCards": 60,
    "pokemonCount": 18,
    "trainerCount": 30,
    "energyCount": 12
  }
}
```

### 📁 `prices/` - Market Prices
- **snapshots/** - Daily price dumps for all cards
- **history/{cardId}/** - Per-card historical pricing data

**Retention:** Keep detailed daily data for 1 year, monthly aggregates after that

### 📁 `exports/` - User Data Exports
- **collections/** - Collection exports
- **decks/** - Deck list exports
- **reports/** - Generated analysis reports

## Maintenance

### Automated Tasks
- **Daily**: Download new card images, price snapshots
- **Weekly**: Clean up old HTML archives (>30 days), compress to gzip
- **Monthly**: Archive event data, optimize storage
- **Quarterly**: Full backup, remove deprecated cards

### Manual Cleanup
To clean temporary files:
```bash
# Remove cache
rm -rf data/images/cache/*
rm -rf scrapers/downloads/temp/*

# Compress old HTML archives
find data/html -name "*.html" -mtime +30 -exec gzip {} \;
```

## API Integration

Images are served via API endpoints:
```
GET /api/v1/cards/:cardId/image        # Full-size image
GET /api/v1/cards/:cardId/thumbnail    # Thumbnail
```

## Storage Estimates

Based on 10,000 cards:
- Full images (~500KB each): ~5 GB
- Thumbnails (~50KB each): ~500 MB
- HTML archives (~100KB each): ~1 GB
- Event data: ~100 MB
- Deck data: ~500 MB
- Price data (1 year): ~1 GB

**Total Estimated:** ~8-10 GB

## Security Notes

- All data files are in `.gitignore` to avoid committing large binary files
- User exports should be privacy-aware (anonymize if needed)
- Implement access controls in API layer for sensitive data
