# Japanese Card Import Guide

This guide explains how to import the scraped Japanese card data into the PostgreSQL database via the NestJS API.

## Prerequisites

1. **Database Setup**
   ```bash
   cd packages/database
   pnpm db:generate  # Generate Prisma client
   pnpm db:migrate   # Apply migrations
   ```

2. **Environment Variables**
   Create `.env` file in `apps/api/`:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/ptcg_carddb"
   PORT=4000
   ```

3. **Start the API Server**
   ```bash
   cd apps/api
   npm run dev
   ```
   API will run on `http://localhost:4000`

## Import Methods

### Method 1: Batch Import via Python Script (Recommended)

Import all JSON files from the scraped data:

```bash
cd scrapers
python import_cards_to_api.py
```

**Options:**
```bash
# Import specific file
python import_cards_to_api.py --file ../data/cards/japan/japanese_cards_40k_sv9.json

# Custom batch size
python import_cards_to_api.py --batch-size 50

# Custom API URL
python import_cards_to_api.py --api-url http://localhost:4000/api/v1/cards/import/batch

# Custom pattern
python import_cards_to_api.py --pattern "japanese_cards_40k_sv*.json"
```

**Expected Output:**
```
2026-01-22 18:00:00 - INFO - Found 94 JSON files to import
2026-01-22 18:00:01 - INFO - Processing: japanese_cards_40k_sv9.json
2026-01-22 18:00:02 - INFO - Loaded 132 cards from japanese_cards_40k_sv9.json
2026-01-22 18:00:03 - INFO - Importing batch 1/2 (100 cards)
2026-01-22 18:00:05 - INFO -   ✓ Success: 100, Failed: 0
2026-01-22 18:00:06 - INFO - Importing batch 2/2 (32 cards)
2026-01-22 18:00:07 - INFO -   ✓ Success: 32, Failed: 0
============================================================
IMPORT SUMMARY
============================================================
Files processed:  94
Total cards:      9,593
Successfully imported: 9,593
Failed:           0
============================================================
```

### Method 2: Direct API Call (for testing)

Using curl:
```bash
curl -X POST http://localhost:4000/api/v1/cards/import/batch \
  -H "Content-Type: application/json" \
  -d @data/cards/japan/japanese_cards_40k_sv9.json
```

Using PowerShell:
```powershell
$cards = Get-Content "data\cards\japan\japanese_cards_40k_sv9.json" | ConvertFrom-Json
$body = @{ cards = $cards } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method POST -Uri "http://localhost:4000/api/v1/cards/import/batch" `
  -ContentType "application/json" -Body $body
```

### Method 3: File Upload via Swagger UI

1. Open Swagger UI: `http://localhost:4000/api/v1`
2. Navigate to **POST /cards/import/file**
3. Click "Try it out"
4. Upload JSON file
5. Click "Execute"

## Data Mapping

The importer automatically maps Japanese data to Prisma schema:

### Supertype Mapping
| Japanese     | Prisma Enum         |
|--------------|---------------------|
| ポケモン     | `POKEMON`           |
| トレーナーズ | `TRAINER`           |
| エネルギー   | `ENERGY`            |

### Subtype Mapping
| Japanese         | Prisma Enum         |
|------------------|---------------------|
| たねポケモン     | `BASIC`             |
| 1進化            | `STAGE_1`           |
| 2進化            | `STAGE_2`           |
| グッズ           | `ITEM`              |
| サポート         | `SUPPORTER`         |
| スタジアム       | `STADIUM`           |
| ポケモンのどうぐ | `TOOL`              |
| 基本エネルギー   | `BASIC_ENERGY`      |
| 特殊エネルギー   | `SPECIAL_ENERGY`    |

### Pokemon Type Mapping
| Japanese | Prisma Enum   |
|----------|---------------|
| 草       | `GRASS`       |
| 炎       | `FIRE`        |
| 水       | `WATER`       |
| 雷       | `LIGHTNING`   |
| 超       | `PSYCHIC`     |
| 闘       | `FIGHTING`    |
| 悪       | `DARKNESS`    |
| 鋼       | `METAL`       |
| 無色     | `COLORLESS`   |
| ドラゴン | `DRAGON`      |
| フェアリー | `FAIRY`     |

### Rarity Mapping
| Japanese | Prisma Enum                    |
|----------|--------------------------------|
| C        | `COMMON`                       |
| U        | `UNCOMMON`                     |
| R        | `RARE`                         |
| RR       | `DOUBLE_RARE`                  |
| RRR      | `ULTRA_RARE`                   |
| AR       | `ILLUSTRATION_RARE`            |
| SAR      | `SPECIAL_ILLUSTRATION_RARE`    |
| UR       | `HYPER_RARE`                   |
| SR       | `SHINY_RARE`                   |
| ACE      | `ACE_SPEC`                     |

## Database Schema

The import creates/updates these tables:

1. **PrimaryExpansion** - Canonical expansion (e.g., "SV9")
2. **RegionalExpansion** - Japanese regional mapping (e.g., "sv9" → JP region)
3. **PrimaryCard** - Canonical card identity (expansion + card number)
4. **Card** - Language-specific card variant (JA_JP language)

**Key Fields:**
- `webCardId`: Unique identifier (e.g., "jp47009")
- `language`: Always `JA_JP` for Japanese imports
- `variantType`: `NORMAL`, `AR`, `SAR`, `SR`, `UR`, etc.

## Verifying Import

### Check via API
```bash
# Get all Japanese cards
curl http://localhost:4000/api/v1/cards?language=JA_JP

# Get specific card by webCardId
curl http://localhost:4000/api/v1/cards/web/jp47009

# Get cards from expansion
curl http://localhost:4000/api/v1/cards?expansionCode=sv9
```

### Check via Prisma Studio
```bash
cd packages/database
pnpm db:studio
```

Browse to:
- **cards** table - View imported cards
- **primary_cards** table - View canonical card identities
- **regional_expansions** table - View JP expansion mappings

## Performance

- **Batch Size**: 100 cards per request (configurable)
- **Rate**: ~200-300 cards/second
- **Total Time**: ~30-60 seconds for 9,593 cards
- **Database**: Uses upsert logic to handle duplicates

## Troubleshooting

### API not responding
```bash
# Check if API is running
curl http://localhost:4000/health

# Check API logs
cd apps/api
npm run dev
```

### Database connection errors
```bash
# Verify DATABASE_URL in .env
cat apps/api/.env

# Test connection
cd packages/database
pnpm db:studio
```

### Import validation errors
Check the API response for specific error messages. Common issues:
- Missing required fields (webCardId, name, expansionCode, cardNumber)
- Invalid enum values (check mapping tables above)
- Duplicate webCardId (cards are upserted, so this shouldn't fail)

### Partial imports
The script reports success/failed counts. Re-run the import - existing cards will be updated, failed cards will be retried.

## Next Steps

After importing cards:
1. **Import images**: Cards reference images via `imageUrl` field
2. **Add prices**: Use `/api/v1/prices` endpoints
3. **Create decks**: Use `/api/v1/decks` endpoints
4. **Tournament tracking**: Use `/api/v1/tournaments` endpoints
