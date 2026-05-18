# scrape-products-web-direct.ts — Documentation

**Source file:** `scrapers/scrape-products-web-direct.ts`
**Last modified:** `2026-05-17 20:23`
**MD5:** `96AD85063CE37C6DAB4307311C7ED41A`
**Summarised by model:** `GPT-5.3-Codex`

## Purpose

Scrape product data directly from Pokemon Asia Hong Kong product search pages and optionally import into the database without overwriting existing records.

The script can also include Japan recent products from the official Japan products API top list to quickly backfill newest releases (for example `m4`, `m5`).

This script is designed for safe migration from external scraper logic into this repository:
- Scrape `hk-en` and `hk` product pages
- Export JSON snapshot of scraped rows
- Support dry run for insertion checks
- Insert-only DB behavior (existing products are skipped)

## Usage

```bash
# Dry run first 5 pages (recommended verification run)
npx tsx scrapers/scrape-products-web-direct.ts --dry-run --import-db --max-pages 5

# Real insert-only import (no overwrite), first 5 pages
npx tsx scrapers/scrape-products-web-direct.ts --import-db --max-pages 5

# Include Japan top-list products (official API)
npx tsx scrapers/scrape-products-web-direct.ts --import-db --max-pages 5 --include-japan-top

# Scrape only and export JSON (no DB import)
npx tsx scrapers/scrape-products-web-direct.ts --max-pages 5
```

## CLI Options

- `--max-pages <N>`: maximum page number to scrape per region, default `5`
- `--dry-run`: evaluate insert/skip counts without DB writes
- `--import-db`: enable DB import path
- `--output <path>`: JSON output path, default `data/products/web_products_dryrun.json`
- `--include-japan-top`: include Japan products from `https://www.pokemon-card.com/products/topList.php`

## Step-by-Step Logic

1. Parse CLI options and print run mode.
2. Scrape HK EN pages: `https://asia.pokemon-card.com/hk-en/card-search/?pageNo=N`.
3. Scrape HK ZH pages: `https://asia.pokemon-card.com/hk/card-search/?pageNo=N`.
4. Optional: fetch Japan top products from `https://www.pokemon-card.com/products/topList.php`.
4. Parse each page into product rows using `expansionItem` blocks (and anchor fallback parser).
5. Normalize fields:
   - release date to `YYYY-MM-DD` where possible
   - code from `expansionCodes` query parameter
   - absolute product/link/image URLs
6. Deduplicate rows by `(country, product_name, code, release_date)`.
7. Save JSON snapshot to disk.
8. If DB import enabled:
   - seed `ProductType`
   - infer type for HK EN/HK ZH products
   - for each row, check existing product in this order and insert only if missing:
     - strict composite key `(country, code, productName, releaseDate)`
     - `(country, code)`
     - `(country, link)`
     - `(country, productName)`
9. Print summary (`Scraped`, `Would insert`, `Would skip`, `Errors`).

## Key Design Decisions

- Insert-only behavior prevents accidental overwrite of historical product info.
- Strong duplicate guards prevent re-inserting the same product when only title/date formatting differs.
- Dry-run mode mirrors import flow while guaranteeing no data mutation.
- Two parser paths (`expansionItem` and fallback anchor parser) improve resilience against minor page markup changes.
- Product type inference reuses the existing project conventions from direct import logic.

## Related Scripts

- `scrapers/import-products-direct.ts`: JSON-based direct import (now insert-only)
- `scrapers/dryrun-import-products.js`: older dry-run helper for pre-exported JSON
