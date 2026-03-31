# PTCG_2026 — Complete CLI Manual

> All commands are run from the workspace root (`c:\AI_Server\Coding\PTCG_2026`) unless noted otherwise.

---

## Table of Contents

1. [Root pnpm / Turborepo Commands](#1-root-pnpm--turborepo-commands)
2. [API Server (NestJS)](#2-api-server-nestjs)
3. [Web App (Next.js)](#3-web-app-nextjs)
4. [Database (Prisma)](#4-database-prisma)
5. [Tournament Import Pipeline](#5-tournament-import-pipeline)
6. [Copilot Agent (Local LLM)](#6-copilot-agent-local-llm)
7. [Japanese Card Scraper](#7-japanese-card-scraper)
8. [HK Card Scraper](#8-hk-card-scraper)
9. [English Card Scraper](#9-english-card-scraper)
10. [Download Japan Card Images](#10-download-japan-card-images)
11. [JP Events Scraper](#11-jp-events-scraper)
12. [Import Cards to API (Python)](#12-import-cards-to-api-python)
13. [Import Cards Direct (Recommended)](#13-import-cards-direct-recommended)
14. [Seed Tournaments](#14-seed-tournaments)
15. [Resync Deck Cards](#15-resync-deck-cards)
16. [Remap Deck Cards](#16-remap-deck-cards)
17. [Remove Duplicate Cards](#17-remove-duplicate-cards)
18. [Import Market Prices](#18-import-market-prices)
19. [Process HTML Cache](#19-process-html-cache)
20. [Scrape Expansion](#20-scrape-expansion)

---

## 1. Root pnpm / Turborepo Commands

**Location:** `package.json` (workspace root)  
**Runner:** `pnpm <script>`

| Command | Description |
|---|---|
| `pnpm dev` | Start all apps in dev mode via Turbo |
| `pnpm build` | Build all packages and apps |
| `pnpm test` | Run all tests across the workspace |
| `pnpm test:watch` | Watch mode for tests |
| `pnpm lint` | Lint all packages |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm format` | Prettier-format all `.ts`, `.tsx`, `.md`, `.json` files |
| `pnpm type-check` | TypeScript type-check with no emit |
| `pnpm clean` | Delete all build outputs and `node_modules` |
| `pnpm events:import:new` | Import only new tournament events |
| `pnpm events:import:repair-all` | Re-scrape and refresh all events |
| `pnpm events:import:repair-event` | Repair a single specific event |

**Examples:**
```powershell
pnpm dev
pnpm build
pnpm lint:fix
pnpm events:import:new
```

---

## 2. API Server (NestJS)

**Location:** `apps/api/`  
**Port:** `4000`  
**Runner:** `cd apps/api && npm run <script>` or `pnpm --filter @ptcg/api <script>`

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with `ts-node` + tsconfig-paths |
| `npm run start` | Start from compiled `dist/` |
| `npm run start:dev` | Start with `--watch` flag |
| `npm run start:debug` | Start with Node debugger + watch |
| `npm run start:prod` | Start production build |
| `npm run build` | Compile via `nest build` |
| `npm run lint` | Lint `src/` with eslint + auto-fix |
| `npm run test` | Run Jest tests |
| `npm run test:watch` | Jest watch mode |
| `npm run test:cov` | Jest with coverage report |
| `npm run type-check` | TypeScript check, no emit |

**Examples:**
```powershell
cd apps/api
npm run dev
npm run start:debug
npm run test:cov
```

**Tip — Kill stuck port 4000:**
```powershell
Get-NetTCPConnection -LocalPort 4000 | Select-Object -ExpandProperty OwningProcess | Stop-Process -Force
```

---

## 3. Web App (Next.js)

**Location:** `apps/web/`  
**Port:** `3001`  
**Runner:** `cd apps/web && npm run <script>`

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js dev server on port 3001 |
| `npm run build` | Build production bundle |
| `npm run start` | Start production server |
| `npm run lint` | Run eslint |
| `npm run test` | Run Jest tests |
| `npm run test:watch` | Jest watch mode |
| `npm run test:coverage` | Jest with coverage report |

**Examples:**
```powershell
cd apps/web
npm run dev
npm test -- page.test.tsx
npm run test:coverage
```

---

## 4. Database (Prisma)

**Location:** `packages/database/`  
**Runner:** `cd packages/database && pnpm <script>` or `pnpm --filter @ptcg/database <script>`

| Command | Description |
|---|---|
| `pnpm db:generate` | Generate Prisma Client — **run after every schema change** |
| `pnpm db:migrate` | Create new migration interactively (**dev only — interactive, never use in scripts**) |
| `pnpm db:migrate:deploy` | Apply existing migrations non-interactively (**safe to use in scripts**) |
| `pnpm db:seed` | Run `prisma/seed.ts` to populate test data |
| `pnpm db:studio` | Open Prisma Studio GUI |
| `pnpm build` | Compile TypeScript |
| `pnpm dev` | Watch-mode compile |
| `pnpm type-check` | TypeScript check, no emit |

**Examples:**
```powershell
cd packages/database
pnpm db:generate
pnpm db:migrate -- --name add_card_price
pnpm db:migrate:deploy
pnpm db:studio
```

> **Warning:** Never use `pnpm db:migrate` in automated scripts — it is interactive and will hang. Use `pnpm db:migrate:deploy` instead.

---

## 5. Tournament Import Pipeline

**Location:** `scripts/tournament-import-pipeline.mjs`

```
node scripts/tournament-import-pipeline.mjs <mode> [options]
```

| Argument | Values | Description |
|---|---|---|
| `mode` | `import-new` *(default)* | Import only new tournaments |
| | `repair-all` | Re-scrape and refresh all events |
| | `repair-event` | Repair one specific event |
| `--event-id=<id>` | e.g. `952769` | **Required** when mode is `repair-event` |

**Examples:**
```powershell
node scripts/tournament-import-pipeline.mjs import-new
node scripts/tournament-import-pipeline.mjs repair-all
node scripts/tournament-import-pipeline.mjs repair-event --event-id=952769
```

> Also available as pnpm aliases: `pnpm events:import:new`, `pnpm events:import:repair-all`, `pnpm events:import:repair-event`.

---

## 6. Copilot Agent (Local LLM)

**Location:** `scripts/copilot-agent.js`  
**Requires:** [Ollama](https://ollama.ai) running locally (default model: `deepseek-coder-v2:16b`)

```
node scripts/copilot-agent.js <file-path> [analysis-type]
```

| Argument | Values | Default | Description |
|---|---|---|---|
| `file-path` | any path | *(required)* | File to analyze |
| `analysis-type` | `comprehensive` | `comprehensive` | Full analysis |
| | `code-review` | | Code quality review |
| | `architecture` | | Architectural analysis |
| | `bug-hunt` | | Bug detection |
| | `migration` | | Migration safety check |

**Examples:**
```powershell
node scripts/copilot-agent.js apps/api/src/cards/cards.service.ts
node scripts/copilot-agent.js packages/database/prisma/schema.prisma architecture
node scripts/copilot-agent.js scrapers/import-cards-direct.ts bug-hunt
node scripts/copilot-agent.js apps/web/src/app/cards/page.tsx code-review
```

> Also runnable as VS Code Tasks: `Ctrl+Shift+P` → **Tasks: Run Task** → choose analysis type.

---

## 7. Japanese Card Scraper

**Location:** `scrapers/src/japanese_card_scraper.py`

```
cd scrapers
python src/japanese_card_scraper.py [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `--ids <list>` | `str` | — | Comma-separated card IDs to scrape |
| `--id-range <start> <count>` | `int int` | — | Start ID + number of cards |
| `--output <file>` | `str` | `japanese_cards.json` | Output JSON file path |
| `--compact-json` | flag | off | Write compact (non-pretty) JSON |
| `--cache-html` | flag | off | Save raw HTML to `data/html/japan/` |
| `--refresh-cache` | flag | off | Force re-fetch already-cached HTML |
| `--cache-only` | flag | off | Parse from local cache only (no HTTP) |
| `--expansions <codes>` | `str` | — | Comma-separated expansion codes to keep (e.g. `sv8,sv9`) |
| `--threads <n>` | `int` | `1` | Number of parallel worker threads |
| `--min-request-interval <s>` | `float` | `2.0` | Min seconds between HTTP requests |
| `--quiet` | flag | off | Suppress per-card log output |

**Output location:** `data/cards/japan/japanese_cards_{expansion}.json`

**Examples:**
```powershell
# Initial scrape with HTML caching (for later re-processing)
python src/japanese_card_scraper.py --id-range 50000 100 --cache-html

# Fast offline re-processing from cache (20 threads)
python src/japanese_card_scraper.py --id-range 48000 1000 --cache-only --threads 20

# Scrape specific card IDs
python src/japanese_card_scraper.py --ids 48717,48879,49536

# Scrape with expansion filter
python src/japanese_card_scraper.py --id-range 48000 1000 --expansions sv9 --cache-html

# Slow/polite scrape with 3-second interval
python src/japanese_card_scraper.py --id-range 48000 100 --min-request-interval 3.0
```

---

## 8. HK Card Scraper

**Location:** `scrapers/src/hk_card_scraper.py`

```
cd scrapers
python src/hk_card_scraper.py [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `--ids <list>` | `str` | — | Comma-separated card IDs |
| `--id-range <start> <count>` | `int int` | — | Start ID + count |
| `--output <file>` | `str` | `hk_cards.json` | Output JSON file |
| `--cache-html` | flag | off | Save HTML cache to `data/html/hongkong/` |
| `--refresh-cache` | flag | off | Force re-fetch cached HTML |
| `--cache-only` | flag | off | Parse from local cache only |
| `--threads <n>` | `int` | `1` | Parallel worker threads |
| `--quiet` | flag | off | Suppress per-card logging |
| `--html-cache-dir <path>` | `str` | auto | Custom HTML cache directory |

**Examples:**
```powershell
# Scrape with caching
python src/hk_card_scraper.py --id-range 1000 100 --cache-html

# Fast re-process from cache
python src/hk_card_scraper.py --id-range 1000 18000 --cache-only --threads 10 --quiet

# Custom cache directory
python src/hk_card_scraper.py --html-cache-dir "D:/ptcg_cache/hk" --cache-only --threads 8
```

---

## 9. English Card Scraper

**Location:** `scrapers/src/english_card_scraper.py`

```
cd scrapers
python src/english_card_scraper.py [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `--ids <list>` | `str` | — | Comma-separated card IDs |
| `--id-range <start> <count>` | `int int` | — | Start ID + count |
| `--output <file>` | `str` | `english_cards.json` | Output JSON file |
| `--cache-html` | flag | off | Save HTML cache |
| `--refresh-cache` | flag | off | Force re-fetch |
| `--cache-only` | flag | off | Cache-only parsing |
| `--threads <n>` | `int` | `1` | Parallel workers |
| `--quiet` | flag | off | Suppress logging |

**Examples:**
```powershell
python src/english_card_scraper.py --id-range 1000 100 --cache-html
python src/english_card_scraper.py --id-range 1000 5000 --cache-only --threads 10
```

---

## 10. Download Japan Card Images

**Location:** `scrapers/src/download_japan_images.py`

```
cd scrapers
python src/download_japan_images.py --input <file> [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `--input <file>` | `str` | *(required)* | Input JSON from card scraper |
| `--limit <n>` | `int` | none | Max images to download |
| `--delay <s>` | `float` | `1.0` | Seconds between downloads |
| `--data-root <path>` | `str` | auto | Root data storage directory |

**Output location:** `data/images/cards/japan/{expansion}/`

**Examples:**
```powershell
python src/download_japan_images.py --input ../data/cards/japan/japanese_cards_40k_sv9.json
python src/download_japan_images.py --input ../data/cards/japan/japanese_cards_40k_sv9.json --limit 50 --delay 2.0
```

---

## 11. JP Events Scraper

**Location:** `scrapers/src/jpevents_scraper.py`

```
cd scrapers
python src/jpevents_scraper.py [start_offset] [--reload-info]
```

| Argument | Type | Default | Description |
|---|---|---|---|
| `start_offset` | positional int | `0` | Skip the N most-recent events |
| `--reload-info` | flag | off | Re-scrape event info even if folder exists |

**Examples:**
```powershell
# Scrape from the beginning
python src/jpevents_scraper.py

# Skip the 50 most-recent events (already imported)
python src/jpevents_scraper.py 50

# Re-scrape info for existing events
python src/jpevents_scraper.py --reload-info

# Skip 100 recent + force re-scrape info
python src/jpevents_scraper.py 100 --reload-info
```

---

## 12. Import Cards to API (Python)

**Location:** `scrapers/import_cards_to_api.py`  
**Requires:** API server running on port 4000

```
cd scrapers
python import_cards_to_api.py [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `--dir <path>` | `str` | `data/cards/japan` | Directory containing JSON files |
| `--pattern <glob>` | `str` | `japanese_cards_40k_*.json` | Glob pattern for JSON files |
| `--api-url <url>` | `str` | `http://localhost:4000/api/v1/cards/import/batch` | API batch import endpoint |
| `--batch-size <n>` | `int` | `100` | Cards per POST request |
| `--file <path>` | `str` | — | Import a single file (overrides `--dir`) |

**Examples:**
```powershell
# Import all Japanese cards (default directory)
python import_cards_to_api.py

# Import a specific file
python import_cards_to_api.py --file "../data/cards/japan/japanese_cards_40k_sv9.json"

# Smaller batch size
python import_cards_to_api.py --batch-size 50

# Match specific expansion files only
python import_cards_to_api.py --pattern "japanese_cards_40k_sv*.json"
```

> **Note:** Use direct import (Section 13) instead when API validation causes issues.

---

## 13. Import Cards Direct (Recommended)

**Location:** `scrapers/import-cards-direct.ts`  
**Bypasses API — writes directly to the database via Prisma Client**

```
npx tsx scrapers/import-cards-direct.ts [baseDir] [regionOrPattern]
```

| Argument | Positional | Default | Description |
|---|---|---|---|
| `baseDir` | 1st | `data/cards` | Base cards directory |
| `regionOrPattern` | 2nd | all regions | Region name (`japan`, `english`, `hongkong`, `china`) or single directory path |

**Examples:**
```powershell
# Import all regions
npx tsx scrapers/import-cards-direct.ts

# Import from custom base directory
npx tsx scrapers/import-cards-direct.ts "data/cards"

# Import only one region
npx tsx scrapers/import-cards-direct.ts "../data/cards" "japan"

# Point directly at a region folder
npx tsx scrapers/import-cards-direct.ts "../data/cards/japan"
```

Also via PowerShell wrapper:
```powershell
cd scrapers
./import-cards.ps1
```

**Expected output:**
```
============================================================
IMPORT SUMMARY
============================================================
Files processed: 94
Successfully imported: 9593
Failed: 0
============================================================
```

---

## 14. Seed Tournaments

**Location:** `scrapers/seed-tournaments.ts`

```
npx tsx scrapers/seed-tournaments.ts [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `--all` | flag | off | Process all events (removes limit) |
| `--limit=<n>` | `int` | `50` | Max events to process |
| `--event-id=<id>` | `str` | — | Process only one specific event |
| `--refresh-existing` | flag | off | Re-process already-seeded events |
| `--source-root=<path>` | `str` | auto-detect | Path to `event_data` directory |
| `--dry-run` | flag | off | Preview changes without writing to DB |
| `--verbose` | flag | off | Extra logging |

**Auto-detected source root candidates:**
- `C:/AI_Server/Coding/PTCG_CardDB/event_data`
- `C:/AI_Server/Coding/PTCG_CardDB/1_Webscraper/event_data`
- `../PTCG_CardDB/event_data`

**Examples:**
```powershell
# Seed latest 50 events (default)
npx tsx scrapers/seed-tournaments.ts

# Seed all events, re-processing existing ones
npx tsx scrapers/seed-tournaments.ts --all --refresh-existing

# Repair one specific event
npx tsx scrapers/seed-tournaments.ts --event-id=952769 --verbose

# Preview without writing
npx tsx scrapers/seed-tournaments.ts --limit=10 --dry-run

# Custom data root
npx tsx scrapers/seed-tournaments.ts --source-root="D:/data/event_data"
```

---

## 15. Resync Deck Cards

**Location:** `scrapers/resync-deck-cards.ts`  
Re-links deck card references after card data changes.

```
npx tsx scrapers/resync-deck-cards.ts [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `--dry-run` | flag | off | Preview without DB changes |
| `--limit=<n>` | `int` | all | Process first N decks only |
| `--report-file=<path>` | `str` | — | Write missing cards report to JSON file |

**Examples:**
```powershell
npx tsx scrapers/resync-deck-cards.ts
npx tsx scrapers/resync-deck-cards.ts --dry-run
npx tsx scrapers/resync-deck-cards.ts --report-file=missing_cards.json
npx tsx scrapers/resync-deck-cards.ts --limit=500
```

---

## 16. Remap Deck Cards

**Location:** `scrapers/remap-deck-cards.ts`  
Remaps deck card foreign keys after card merges or ID changes.

```
npx tsx scrapers/remap-deck-cards.ts [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `--dry-run` | flag | off | Preview remaps without writing to DB |
| `--verbose` | flag | off | Extra logging |
| `--deck-id=<UUID>` | `str` | — | Process only one specific deck |

**Examples:**
```powershell
npx tsx scrapers/remap-deck-cards.ts
npx tsx scrapers/remap-deck-cards.ts --dry-run --verbose
npx tsx scrapers/remap-deck-cards.ts --deck-id=abc123-...
```

---

## 17. Remove Duplicate Cards

**Location:** `scrapers/remove-duplicates.ts`

```
npx tsx scrapers/remove-duplicates.ts [--dry-run]
```

| Option | Description |
|---|---|
| `--dry-run` | Show what would be deleted without deleting |

**Examples:**
```powershell
# Preview duplicates (safe)
npx tsx scrapers/remove-duplicates.ts --dry-run

# Actually remove duplicates
npx tsx scrapers/remove-duplicates.ts
```

---

## 18. Import Market Prices

**Location:** `scrapers/import-market-prices.ts`

```
npx tsx scrapers/import-market-prices.ts [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `--dry-run` | flag | off | Preview without writing to DB |
| `--verbose` | flag | off | Extra logging |
| `--file=<path>` | `str` | auto-detect | Path to `market-prices.json` |

**Auto-detected file candidates:**
- `../../PTCG_CardDB_Tc/market-prices.json`
- `../PTCG_CardDB_Tc/market-prices.json`
- `C:/AI_Server/Coding/PTCG_CardDB_Tc/market-prices.json`

**Examples:**
```powershell
npx tsx scrapers/import-market-prices.ts
npx tsx scrapers/import-market-prices.ts --dry-run
npx tsx scrapers/import-market-prices.ts --verbose
npx tsx scrapers/import-market-prices.ts --file="C:/path/to/market-prices.json"
```

---

## 19. Process HTML Cache

**Location:** `scrapers/process_html_cache.py`  
Converts cached HTML files to JSON without making HTTP requests.

```
cd scrapers
python process_html_cache.py [--region REGION]
```

| Option | Choices | Default | Description |
|---|---|---|---|
| `--region` | `japan`, `hongkong`, `english`, `all` | `all` | Which region's HTML cache to process |

**Examples:**
```powershell
# Process all regions
python process_html_cache.py

# Process only Japan
python process_html_cache.py --region japan

# Process only Hong Kong
python process_html_cache.py --region hongkong
```

---

## 20. Scrape Expansion

**Location:** `scrapers/scrape_expansion.py`  
Scrapes all cards for a specific regional expansion.

```
cd scrapers
python scrape_expansion.py --region <region> --expansion <code>
```

| Option | Choices / Type | Required | Description |
|---|---|---|---|
| `--region` | `hongkong`, `english` | yes | Target region |
| `--expansion` | e.g. `sv9` | yes | Expansion code to scrape |

**Examples:**
```powershell
python scrape_expansion.py --region hongkong --expansion sv9
python scrape_expansion.py --region english --expansion sv9
```

> **Note:** JS-rendered pages may cause incomplete card ID discovery for newer expansions.

---

## Quick Reference — Common Workflows

### Full Japanese Card Import Pipeline
```powershell
# 1. Scrape new cards (with HTML cache for re-use)
cd scrapers
python src/japanese_card_scraper.py --id-range 48000 1000 --cache-html

# 2. (Optional) Re-process cache if data mapping changes
python src/japanese_card_scraper.py --id-range 48000 1000 --cache-only --threads 20

# 3. Import to database (direct, recommended)
cd ..
npx tsx scrapers/import-cards-direct.ts
```

### Import Tournament Data
```powershell
cd scrapers
python src/jpevents_scraper.py 50       # skip latest 50 already imported
cd ..
pnpm events:import:new                  # seed new events to DB
```

### Fresh Development Setup
```powershell
pnpm install
cd packages/database
pnpm db:migrate:deploy
pnpm db:generate
cd ../..
pnpm dev
```

### After Schema Changes
```powershell
cd packages/database
pnpm db:migrate -- --name describe_change
pnpm db:generate
cd ../..
pnpm build
```
