# import-cards-direct.ts — Documentation

**Source file:** `scrapers/import-cards-direct.ts`
**Last modified:** `2026-05-06 21:01`
**MD5:** `FB7A11407A543DA6F4F6D1FC290DDA87`
**Summarised by model:** `Claude Sonnet 4.6`

Directly imports card data from JSON files into the database using Prisma Client. This script is the recommended method as it bypasses the API layer's DTO validation and allows direct manipulation of the database schema.

---

## Usage

```bash
# 1. Import all card data from all regions (japan, english, hongkong, china):
npx tsx scrapers/import-cards-direct.ts

# 2. Import from a specific base directory (e.g., only the 'data/cards' folder):
npx tsx scrapers/import-cards-direct.ts "../data/cards"

# 3. Import from a single region directory (e.g., only the Japanese cards):
npx tsx scrapers/import-cards-direct.ts "../data/cards/japan"
```

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `[directory]` | `../data/cards` | The root directory containing region folders (e.g., `japan`, `english`). |

---

## How It Works — Step by Step

### Step 1 — Initialization and Setup

The script initializes the Prisma Client and sets up global mapping tables for various card attributes (e.g., `SUPERTYPE_MAP`, `RARITY_MAP`, `TYPE_MAP`).

### Step 2 — Directory and Region Discovery

1. **Directory Path**: Determines the root directory to scan for region folders (defaulting to `../data/cards`).
2. **Region Iteration**: Iterates through all subdirectories found (e.g., `japan`, `english`, `hongkong`, `china`).
3. **File Loading**: Reads all JSON files within each region folder.

### Step 3 — Card Data Normalization (The Core Loop)

For every card object found in the JSON files, the script performs extensive normalization and validation:

1. **WebCardId/PrimaryCardId**: The `webCardId` is used as the primary key for deduplication. The script attempts to derive the `PrimaryCardId` and `PrimaryExpansion` ID if they are missing.
2. **Language/Region**: Determines the `LanguageCode` and `Region` based on the source folder.
3. **Attribute Mapping**: Maps scraped text codes (e.g., JP rarity codes like `AR`, `SAR`) to the correct Prisma enums.
4. **`collectorNumber`**: The raw scraper field (e.g., `"062/071"`) is passed through directly to `Card.collectorNumber`. The number-only portion (e.g., `"062"`) is separately extracted for `PrimaryCard.cardNumber` via `collectorNumber.split('/')[0]`.
5. **Data Structure**: Builds a standardized `Card` object containing all necessary fields for the database.

### Step 4 — Database Upsert Logic

The script uses a transaction block (`prisma.$transaction`) to perform bulk upserts for multiple related models:

1. **`PrimaryExpansion`**: Creates/updates the canonical expansion record.
2. **`RegionalExpansion`**: Links the regional code to the canonical `PrimaryExpansion`.
3. **`PrimaryCard`**: Creates/updates the canonical card identity.
4. **`Card`**: Creates/updates the language-specific variant record.
5. **`CardVariant`**: (If applicable) Handles variant-specific data.

### Step 5 — Field Synchronization

The script intelligently handles field synchronization:

- **JP → HK**: If the JP card has a value (e.g., `rarity`), it overwrites the HK card's value if the HK value is null/empty.
- **HK → JP**: If the HK card has a value (e.g., `regulationMark`), it updates the JP card's value if the JP value is null/empty.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Direct Import** | Bypasses API validation, allowing bulk data loading from raw scrapes. |
| **WebCardId as Key** | Ensures global uniqueness across all languages and regions. |
| **PrimaryCardId Derivation** | Uses `[primaryExpansionId, cardNumber]` as the canonical key, ensuring consistency. |
| **`collectorNumber` stored on `Card`** | Each regional print has its own collector number (e.g., sv5M `062/071` vs SVN `020/...`). Storing it on `Card` (not `PrimaryCard`) correctly models per-print numbering. The number-only portion is still extracted into `PrimaryCard.cardNumber`. |
| **Language/Region Mapping** | Uses explicit maps (`SUPERTYPE_MAP`, etc.) to ensure correct enum usage. |
| **Transaction Usage** | Guarantees atomicity for all related inserts/updates, preventing partial data commits. |
| **Handling Missing Data** | Uses `if (!dbCard.field)` checks to ensure that only missing fields are updated, preserving existing data. |

---

## Related Scripts

| Script | Purpose |
|--------|---------|
| `scrapers/japanese_card_scraper.py` | Primary scraper for Japanese card data (HTML source) |
| `scrapers/hk_card_scraper.py` | Scraper for Hong Kong card data (HTML source) |
| `scrapers/english_card_scraper.py` | Scraper for English card data (HTML source) |