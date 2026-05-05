# PTCG CardDB - AI Coding Agent Instructions

## Project Overview
**PTCG CardDB** is a multi-language Pokemon Trading Card Game database with tournament tracking, deck building, and market pricing. This is a TypeScript monorepo using **pnpm workspaces** and **Turborepo**.

**Core Architecture:** Multi-language card system where cards exist as language variants (ja-JP, zh-TW, en-US) linked to canonical `PrimaryCard` identities. Each card has a unique `webCardId` format (e.g., `hk00014744`, `jp49355`). Regional expansion codes (JP "SV8" vs HK "SV08" vs EN "sv9") map to a canonical `PrimaryExpansion`.

## Workspace Structure

```
apps/
  api/              # NestJS REST API (Port 4200)
  web/              # Next.js frontend (Port 3001)
packages/
  database/         # Prisma schema + client (@ptcg/database)
  shared-types/     # TypeScript types (@ptcg/shared-types)
scrapers/           # Python scrapers for card/tournament data
data/               # Persistent data storage (cards, images, events)
docs/               # Markdown documentation for core logic files
  scrapers/         # Docs mirroring scrapers/ structure (e.g. map-hk-to-jp.ts.md)
```

## Documentation Convention

**When core logic in a scraper or script is updated, update the corresponding markdown doc in `docs/`.**

The docs folder mirrors the source tree:
- `scrapers/map-hk-to-jp.ts` → `docs/scrapers/map-hk-to-jp.ts.md`
- Any new core scraper/script → create `docs/<folder>/<filename>.md`

Each doc should cover: purpose, usage, step-by-step logic, key design decisions, and related scripts.

### Doc Header Format (required on every doc file)

Every doc must begin with this header block:

```md
# <filename> — Documentation

**Source file:** `<relative/path/to/file>`
**Last modified:** `YYYY-MM-DD HH:mm`
**MD5:** `<md5-hash-of-source-file>`
**Summarised by model:** `<model-name-at-time-of-writing>`
```

### MD5 Verification Workflow

When updating a doc after changing the source file:

1. Compute the MD5 and last-modified time:
   ```powershell
   $file = "scrapers\map-hk-to-jp.ts"
   $md5  = (Get-FileHash $file -Algorithm MD5).Hash
   $mod  = (Get-Item $file).LastWriteTime.ToString("yyyy-MM-dd HH:mm")
   Write-Host "MD5: $md5  Modified: $mod"
   ```
2. Paste the values into the doc header (`**MD5:**` and `**Last modified:**`).
3. To verify a doc is current, re-run the command and compare — if the hash differs, the doc is stale and must be updated.

**Workspace package imports:** Use `@ptcg/database` and `@ptcg/shared-types` aliases (defined in each app's tsconfig.json).

## Essential Developer Workflows

### Build & Development
```bash
pnpm install          # Install all dependencies
pnpm dev              # Run all apps in dev mode (Turbo)
pnpm build            # Build all packages and apps
pnpm lint:fix         # Fix linting issues
```

### Database Operations
```bash
cd packages/database
pnpm db:generate             # Generate Prisma client (run after schema changes)
pnpm db:migrate:deploy       # Apply existing migrations (NON-INTERACTIVE - use in scripts)
pnpm db:migrate -- --name X  # Create new migration during development (INTERACTIVE)
pnpm db:studio               # Open Prisma Studio
pnpm db:seed                 # Seed database with test data
```

**Critical:** 
- After modifying `schema.prisma`, always run `pnpm db:generate` before building or running apps.
- **NEVER use `pnpm db:migrate` in scripts** - it's interactive and will hang. Use `pnpm db:migrate:deploy` instead.
- See [DATABASE_MIGRATION_GUIDE.md](../DATABASE_MIGRATION_GUIDE.md) for detailed migration workflows.

### Scraper & Import Workflows

**Japanese Card Import Pipeline:**
```powershell
# 1. Scrape cards with HTML caching (for debugging/re-processing)
cd scrapers
python src/japanese_card_scraper.py --id-range 48000 100 --cache-html

# 2. Fast offline re-processing (20 threads, cache-only)
python src/japanese_card_scraper.py --id-range 48000 1000 --cache-only --threads 20

# 3. Import JSON to database (RECOMMENDED: Direct import)
cd ..
npx tsx scrapers/import-cards-direct.ts

# Alternative: Import via API (if API validation is needed)
python scrapers/import_cards_to_api.py --file "data/cards/japan/japanese_cards_40k_sv9.json"
```

**Data Storage Structure:**
- `data/cards/{region}/` - Scraped card JSON organized by region
- `data/images/cards/{region}/{expansion}/` - Card images (named by webCardId)
- `data/html/{region}/` - Cached HTML for debugging/re-parsing
- `data/events/` - Tournament data (raw, processed, archives)
- `data/decks/` - Tournament decks and user exports

### Testing
```bash
pnpm test                    # Run all tests across workspace
pnpm test:watch              # Watch mode for tests

# Test specific app
cd apps/web
npm test                     # Run all tests
npm test -- page.test.tsx    # Run specific test file
npm test:watch               # Watch mode
```

**Test File Location:** `apps/web/src/app/cards/__tests__/page.test.tsx`

## Data Model Patterns

### Multi-Language Card System
Cards follow a **two-tier architecture**:

1. **PrimaryCard** - Canonical identity (expansion + card number)
2. **Card** - Language-specific variant with unique constraint:
   ```prisma
   @@unique([primaryCardId, language, variantType])
   ```

**Example Flow:**
- PrimaryCard: expansion="SV9", cardNumber="001"
- Card variants:
  - webCardId="hk00014744", language=ZH_TW, variantType=NORMAL
  - webCardId="jp49355", language=JA_JP, variantType=HOLO

### Expansion Code Mapping
Regional codes map to canonical expansions via `RegionalExpansion`:
- Japan: "SV8" → PrimaryExpansion "SV9"
- Hong Kong: "SV08" → PrimaryExpansion "SV9"
- English: "sv9" → PrimaryExpansion "SV9"

## PTCG Card Rules & Game Mechanics Reference

### Language Codes & Region Mapping (Critical)
The `language` field uses `LanguageCode` enum, NOT region names. **`ZH_HK` does not exist.**

| Region | LanguageCode | Notes |
|--------|-------------|-------|
| `JP`   | `JA_JP`     | Japanese – scraped from pokemon-card.com |
| `HK`   | `ZH_TW`     | Traditional Chinese – HK/TW cards |
| `EN`   | `EN_US`     | English (Asia) |

**Common mistake:** Using `ZH_HK` — the correct enum is `ZH_TW`.

### Supertypes
Every card has exactly one supertype:
- **POKEMON** – Has HP, types, attacks/abilities. Evolution stage applies here.
- **TRAINER** – No HP. Subtypes: `ITEM`, `SUPPORTER`, `STADIUM`, `TOOL`.
- **ENERGY** – Provides energy for attack costs. Subtypes: `BASIC_ENERGY`, `SPECIAL_ENERGY`.

### Pokemon Types (11 types in Scarlet/Violet era)
`COLORLESS` `DARKNESS` `DRAGON` `FAIRY` `FIGHTING` `FIRE` `GRASS` `LIGHTNING` `METAL` `PSYCHIC` `WATER`

> `FAIRY` is a legacy type (removed in Sword/Shield); some older cards still carry it.  
> `STELLAR` exists in the video game but is **not** in the current `PokemonType` enum.

### Subtypes (Trainer & Energy only — Pokemon cards use `evolutionStage` instead)
| Subtype | Supertype | Rules |
|---------|-----------|-------|
| `ITEM` | TRAINER | Can play multiple per turn |
| `SUPPORTER` | TRAINER | Only one per turn; discard after use |
| `STADIUM` | TRAINER | Replaces the previous Stadium in play |
| `TOOL` | TRAINER | Attaches to a Pokemon; removed when Pokemon is KO'd |
| `BASIC_ENERGY` | ENERGY | Unlimited copies in deck |
| `SPECIAL_ENERGY` | ENERGY | Max 4 copies; provides special benefits |
| `TERA` | TRAINER | Scarlet/Violet Tera mechanic support cards |

### Evolution Stages (Pokemon only)
| Stage | Meaning | Play rule |
|-------|---------|-----------|
| `BASIC` | No prior stage | Play directly to bench |
| `STAGE_1` | Evolves from Basic | Evolve from a Basic already in play |
| `STAGE_2` | Evolves from Stage 1 | Evolve from a Stage 1 already in play |

### RuleBox (Special Pokemon mechanics — opponent draws extra prizes on KO)
| RuleBox | Era | Prize cards on KO | Standard 2026? | Notes |
|---------|-----|-------------------|----------------|-------|
| `EX` | Scarlet/Violet | 2 | ✅ Current | Modern `ex` lowercase |
| `V` | Sword/Shield | 2 | ❌ Rotated | - |
| `VMAX` | Sword/Shield | 3 | ❌ Rotated | Evolves from V |
| `VSTAR` | Sword/Shield | 2 | ❌ Rotated | Evolves from V; one VSTAR Power per game |
| `GX` | Sun/Moon | 2 | ❌ Rotated | One GX attack per game |
| `MEGA` | X/Y | 2 | ❌ Rotated | Evolves from EX; ends your turn |
| `RADIANT` | Sword/Shield | 1 | ❌ Rotated | Shiny Pokemon; max 1 per deck |

> **Current Standard (H/I/J marks):** Only `EX` rule-box Pokemon are legal. ACE SPEC cards (`ACE` variant) are the only high-power single mechanic in the current format.

### Rarity Tiers (Low → High)
```
COMMON → UNCOMMON → RARE → DOUBLE_RARE → ULTRA_RARE
→ AMAZING_RARE / ILLUSTRATION_RARE → SPECIAL_ILLUSTRATION_RARE → HYPER_RARE
```
Special rarities: `ACE_SPEC` (1 per deck rule), `SHINY_RARE`, `PROMO` (event/product exclusive)

### Variant Types (Print variants — mostly JP-origin codes)
| VariantType | Full name | Description |
|-------------|-----------|-------------|
| `NORMAL` | Normal | Standard non-foil print |
| `REVERSE_HOLO` | Reverse Holo | Foil background, non-holo art |
| `HOLO` | Holo Rare | Foil artwork |
| `FULL_ART` | Full Art | Full-bleed art print |
| `SECRET_RARE` | Secret Rare | Card number exceeds set total |
| `AR` | Art Rare | Full-art Trainer/Energy (JP term) |
| `SAR` | Special Art Rare | Full-art Pokemon with illustrated background |
| `SSR` | Super Special Rare | - |
| `SR` | Super Rare | JP gold card / Full Art equivalent |
| `UR` | Ultra Rare | JP gold etched card |
| `MUR` | Master Ultra Rare | Highest tier gold card |
| `MA` | Mirror/Master Art | Alternate art variant |
| `CHR` | Character Rare | Character-focused art with Pokemon |
| `BWR` | Black & White Rare | Illustrated black & white style |
| `ACE` | ACE SPEC | High-power card; **max 1 ACE SPEC per deck** |
| `PROMO` | Promo | Promotional exclusive print |
| `C` / `R` / `U` | Common/Rare/Uncommon | Alternate set-code variants |

### JSON Field Formats

**`attacks` field:**
```json
[
  {
    "name": "Blaze Ball",
    "cost": ["FIRE", "FIRE", "COLORLESS"],
    "damage": "130",
    "effect": "Discard 2 Energy from this Pokémon."
  }
]
```

**`abilities` field:**
```json
[
  {
    "name": "Blaze",
    "description": "Once per turn, when this Pokémon is your Active Pokémon, you may use this Ability."
  }
]
```

**`weaknesses` / `resistances` fields:**
```json
[{ "type": "FIRE", "value": "×2" }]      // weakness
[{ "type": "METAL", "value": "-30" }]    // resistance
```

### Regulation Marks (Standard Format Legality)
Cards printed since Sword/Shield carry a letter regulation mark (`A`–`J`).  
- **Currently Standard-legal (2026):** `H`, `I`, `J`  
- **Rotated out (illegal):** `A`–`G`  
- **No mark:** PROMO or pre-regulation era card  
Stored in the `regulationMark` field on `Card`. Use this for Standard format deck validation.

### Deck Building Rules
| Rule | Constraint |
|------|-----------|
| Deck size | Exactly **60** cards |
| Card copies | Max **4** copies of any single card (by name) |
| Basic Energy | **Unlimited** copies |
| ACE SPEC | Max **1** ACE SPEC card per deck |
| RADIANT Pokemon | Max **1** RADIANT Pokemon per deck (rotated, legacy only) |
| Standard format | Only cards with regulation marks `H`, `I`, `J` (2026) |
| VSTAR Power | Only **1** VSTAR Power ability can be used per game (rotated, legacy only) |

### Card Number Formats
Stored in `cardNumber` on `PrimaryCard` (number portion only, e.g. `"001"`):
- Regular: `"001/064"` → stored as `"001"`
- Trainer Gallery: `"TG01/TG30"` → stored as `"TG01"`
- Promo: `"SWSH001"` / `"SVP001"` → stored as-is

### Complete Enum Quick Reference
```
Supertype:      POKEMON | TRAINER | ENERGY
PokemonType:    COLORLESS DARKNESS DRAGON FAIRY FIGHTING FIRE GRASS LIGHTNING METAL PSYCHIC WATER
Subtype:        ITEM SUPPORTER STADIUM TOOL BASIC_ENERGY SPECIAL_ENERGY TERA
EvolutionStage: BASIC | STAGE_1 | STAGE_2
RuleBox:        EX GX V VMAX VSTAR RADIANT MEGA
Rarity:         COMMON UNCOMMON RARE DOUBLE_RARE ULTRA_RARE ILLUSTRATION_RARE
                SPECIAL_ILLUSTRATION_RARE HYPER_RARE PROMO AMAZING_RARE SHINY_RARE ACE_SPEC
VariantType:    NORMAL REVERSE_HOLO HOLO FULL_ART SECRET_RARE PROMO
                AR SAR SSR SR UR MUR MA CHR U BWR ACE R C
LanguageCode:   JA_JP | ZH_TW | EN_US
Region:         JP | HK | EN
```

## NestJS API Conventions

### Module Structure
Each feature module follows this pattern:
```typescript
feature/
  feature.module.ts      # Module definition
  feature.controller.ts  # REST endpoints
  feature.service.ts     # Business logic
  dto/                   # DTOs with class-validator
  entities/              # Response types
```

### Database Access
**Always use `PrismaService`** injected via DI:
```typescript
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class CardsService {
  constructor(private prisma: PrismaService) {}
}
```

### Rate Limiting
Configured in [app.module.ts](apps/api/src/app.module.ts):
- **short:** 3 req/second
- **medium:** 20 req/10 seconds
- **long:** 100 req/minute

### Error Handling
Global exception filter at [all-exceptions.filter.ts](apps/api/src/common/filters/all-exceptions.filter.ts) returns standardized errors:
```json
{
  "statusCode": 400,
  "message": "Error message",
  "error": "BadRequest",
  "timestamp": "2026-01-21T...",
  "path": "/api/v1/cards"
}
```

### JSON Field Filtering (Critical Pattern)

**Problem:** PostgreSQL JSONB fields store JSON `null` as a value, not SQL `NULL`. Prisma's `{ field: null }` or `{ field: { not: null } }` doesn't work for JSON fields.

**Solution:** Use raw SQL queries with proper JSONB comparisons:

```typescript
// Checking for JSON null (cards without abilities)
const withoutAbilities = await prisma.$queryRaw`
  SELECT * FROM cards 
  WHERE abilities = 'null'::jsonb
`;

// Checking for actual JSON data (cards with abilities)
const withAbilities = await prisma.$queryRaw`
  SELECT * FROM cards 
  WHERE abilities IS NOT NULL AND abilities != 'null'::jsonb
`;
```

**DTO Pattern for Boolean Query Parameters:**

Query string parameters are always strings. Use `@Transform` to convert `"true"`/`"false"` strings:

```typescript
import { Transform } from 'class-transformer';

@ApiProperty({ required: false, type: Boolean })
@IsOptional()
@Transform(({ value }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
})
@IsBoolean()
hasAbilities?: boolean;
```

**Common Mistakes:**
- Using `@Type(() => Boolean)` - doesn't handle `"false"` string correctly
- Using `IS NULL` for JSONB fields - matches SQL NULL, not JSON null
- Forgetting `c.` table alias prefix in raw SQL WHERE clauses

## Database Constraints & Validation

### Critical Unique Constraints
- **Card:** `[primaryCardId, language, variantType]` - Prevents duplicate language variants
- **Card:** `webCardId` - Globally unique scraper identifier
- **PrimaryCard:** `[primaryExpansionId, cardNumber]` - One card number per expansion
- **RegionalExpansion:** `[primaryExpansionId, region]` - One regional code per region

### Business Logic Validation
- **Pokemon cards MUST have types:** All cards with `supertype: POKEMON` must have at least one entry in the `types` array (PokemonType enum)
- **Type validation:** Service layer throws BadRequestException if a Pokemon card is imported without types
- **Data mapping:** The `pokemonTypes` field from scrapers is mapped to `types` in the database

### Foreign Key Cascades
All relationships use `onDelete: Cascade` to maintain referential integrity when deleting parents.

### Validation Requirements (NFR-4)
- All DTOs must use `class-validator` decorators
- Input sanitization to prevent XSS
- Parameterized queries only (Prisma handles this)
- Environment variables for all secrets (never hardcode)

## Scraper Integration

### Japanese Card Scraper (Production-Ready)
**Location:** `scrapers/src/japanese_card_scraper.py`

**Key Features:**
- Multi-threaded with configurable rate limiting (default: 2s between requests)
- HTML caching for fast offline re-processing (cache-only mode)
- Automatic expansion grouping (outputs `japanese_cards_{expansion}.json`)
- Maps Japanese rarity codes to database enums (AR→ILLUSTRATION_RARE, SAR→SPECIAL_ILLUSTRATION_RARE, etc.)

**Critical Pattern - Always Use HTML Caching:**
```powershell
# Step 1: Initial scrape (creates HTML cache for debugging)
python src/japanese_card_scraper.py --id-range 48000 100 --cache-html

# Step 2: Fast re-processing if data mapping changes
python src/japanese_card_scraper.py --id-range 48000 1000 --cache-only --threads 20
```

**Data Mapping to Prisma Schema:**
- `pokemonTypes` (scraper) → `types` (database) - Array of `PokemonType` enum
- `rarity` - Maps JP codes: `C`→`COMMON`, `U`→`UNCOMMON`, `RR`→`DOUBLE_RARE`, `AR`→`ILLUSTRATION_RARE`, `SAR`→`SPECIAL_ILLUSTRATION_RARE`, `SR`→`ULTRA_RARE`, `UR`→`HYPER_RARE`
- `supertype` - `POKEMON`, `TRAINER`, `ENERGY`
- `subtype` - `BASIC`, `STAGE_1`, `STAGE_2`, `ITEM`, `SUPPORTER`, `STADIUM`, `TOOL`

### Import Pipeline to Database

**RECOMMENDED: Direct Database Import**
**Script:** `scrapers/import-cards-direct.ts`

**Advantages:**
- Bypasses API validation issues
- Direct Prisma Client access
- Handles both Japanese text and English enum values
- Automatic PrimaryCard/RegionalExpansion creation
- Skills signature for duplicate detection

**Usage:**
```powershell
# Import all Japanese cards from default directory
cd c:\AI_Server\Coding\PTCG_2026
npx tsx scrapers/import-cards-direct.ts

# Import from specific directory with pattern
npx tsx scrapers/import-cards-direct.ts "../data/cards/japan" "japanese_cards_40k_sv*.json"
```

**Output Format:**
```
============================================================
IMPORT SUMMARY
============================================================
Files processed: 94
Successfully imported: 9593
Failed: 0
============================================================
```

**Alternative: API Import (when validation needed)**
**Script:** `scrapers/import_cards_to_api.py`

**Workflow:**
1. Reads JSON from `data/cards/{region}/`
2. Batches cards (default: 100 per request)
3. POSTs to `http://localhost:4200/api/v1/cards/import/batch`
4. Requires API server running on port 4200

**Usage:**
```powershell
# Import all Japanese cards
python scrapers/import_cards_to_api.py

# Import specific file with custom batch size
python scrapers/import_cards_to_api.py --file "../data/cards/japan/japanese_cards_40k_sv9.json" --batch-size 50
```

### Defensive Parsing (FR-5)
- HTML caching system: Stores raw HTML in `data/html/{region}/` for re-parsing without re-scraping
- Error handling: Continues scraping on individual card failures, logs errors to file
- Duplicate prevention: API checks `webCardId` unique constraint before insert
- Validation: Pre-insert validation at DTO level with `class-validator`

### Scraper Job Tracking
Jobs logged in `ScraperJob` model with:
- `source` - Region (HK, JP, EN)
- `status` - PENDING, RUNNING, SUCCESS, FAILED
- `errors` - JSON array of error objects

## Tournament & Deck System

### Tournament Data Flow
1. Scrape from Pokemon events website → `Tournament` model
2. Store player results → `TournamentResult` (with placement, playerName)
3. Optional deck linkage → `Deck` (with 60-card validation)

### Deck Validation (FR-8)
- Must contain exactly 60 cards
- Max 4 copies per card (except Basic Energy)
- Stored in `DeckCard` with quantity tracking

## Performance Requirements (NFR-1)

### Pagination
All list endpoints must support:
```typescript
{
  skip?: number;    // Default: 0
  take?: number;    // Default: 50, Max: 100
}
```

### Query Optimization
- Use Prisma `select` and `include` to prevent N+1 queries
- Index all frequently queried fields (see `@@index` in schema.prisma)
- Virtual scrolling for frontend lists >100 items

### Caching Strategy (NFR-2)
Redis TTL recommendations:
- Cards list: 5 minutes
- Card details: 15 minutes
- Tournaments: 1 hour
- Invalidate cache after mutations

## Common Pitfalls

1. **Forgot to generate Prisma client** - Run `pnpm db:generate` after schema changes
2. **Wrong import path** - Use `@ptcg/database` not relative paths to packages
3. **Missing unique constraint** - Cards need `[primaryCardId, language, variantType]`
4. **Expansion code confusion** - Always map regional codes to `PrimaryExpansion`
5. **Scraper duplicates** - Check `webCardId` before inserting cards
6. **Missing cascade deletes** - Use `onDelete: Cascade` for parent-child relations
7. **Pagination limits** - Enforce max: 100 items per page
8. **Pokemon cards without types** - All `supertype: POKEMON` cards MUST have at least one type in `types` array
9. **API import validation issues** - Use direct import (`import-cards-direct.ts`) to bypass DTO validation problems
10. **Missing `pokemonTypes` field** - Ensure import scripts handle both `types` and `pokemonTypes` from JSON
11. **JSON null vs SQL NULL** - PostgreSQL JSONB fields store JSON `null` as a value, not SQL `NULL`. Use `field = 'null'::jsonb` not `field IS NULL`
12. **Boolean query parameters** - Query string `"false"` is truthy in JavaScript. Use `@Transform` decorator to properly convert string to boolean

## Key Files Reference

- [schema.prisma](packages/database/prisma/schema.prisma) - Complete data model with enums
- [app.module.ts](apps/api/src/app.module.ts) - NestJS module configuration and rate limiting
- [shared-types/index.ts](packages/shared-types/src/index.ts) - TypeScript type definitions
- [README.md](README.md) - Functional requirements (FR-1 to FR-9) and NFRs
- [IMPLEMENTATION.md](IMPLEMENTATION.md) - Setup status and API endpoint specs

## Project-Specific Conventions

- **Enum naming:** Use SCREAMING_SNAKE_CASE in Prisma (e.g., `JA_JP`, `REVERSE_HOLO`)
- **JSON fields:** Use `abilities` and `attacks` as JSON arrays for complex card data
- **Timestamp fields:** Always include `createdAt` and `updatedAt` on models
- **Composite constraints:** Prefer `@@unique([field1, field2])` over multiple `@unique`
- **Error arrays:** Store scraper errors as JSON array in `ScraperJob.errors`
## Debugging & Testing

### VS Code Launch Configurations

The project includes preconfigured debug setups in [.vscode/launch.json](.vscode/launch.json):

**Available Configurations:**
1. **API Server** - Debug NestJS API on port 4200
   - Uses `pnpm --filter @ptcg/api dev`
   - Runs with ts-node and tsconfig-paths
   - Auto-attaches debugger to Node process
   
2. **Web App** - Debug Next.js frontend on port 3001
   - Full-stack debugging with server and client components
   
3. **Admin GUI** - Debug admin dashboard on port 3332

**Usage:**
- Press `F5` or use Debug panel → Select configuration → Start debugging
- Set breakpoints by clicking line numbers
- Use Debug Console for REPL evaluation

### Running Tests

**Frontend Tests (Jest + React Testing Library):**
```bash
cd apps/web
npm test                     # Run all tests
npm test -- --coverage       # With coverage report
npm test -- page.test.tsx    # Run specific test file
npm test:watch               # Watch mode for TDD
```

**Test Structure:**
- Tests located in `__tests__/` directories next to source files
- Mock API calls with `jest.mock('@/lib/api-client')`
- Use `@testing-library/react` for component testing
- All tests must use `render()` with `QueryClientProvider` wrapper

**Common Test Patterns:**
```typescript
// Mock API client
jest.mock('@/lib/api-client');
const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

// Setup test wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// Test filter functionality
it('should filter by types', async () => {
  mockApiClient.get.mockResolvedValue(mockResponse);
  render(<CardsPage />, { wrapper: createWrapper() });
  
  await waitFor(() => {
    expect(screen.getByText('Card Name')).toBeInTheDocument();
  });
  
  const typesSelect = screen.getAllByRole('combobox')[1];
  fireEvent.change(typesSelect, { target: { value: 'FIRE' } });
  
  await waitFor(() => {
    expect(mockApiClient.get).toHaveBeenCalledWith(
      expect.stringContaining('types=FIRE')
    );
  });
});
```

### Debugging API Issues

**Check API Server Status:**
```bash
# Test if API is running
curl http://localhost:4200/api/v1/cards?take=1

# Check specific filter
curl "http://localhost:4200/api/v1/cards?types=GRASS&take=3"
```

**Common API Issues:**
1. **Port 4200 in use** - Kill existing process:
   ```powershell
   Get-NetTCPConnection -LocalPort 4200 | Select-Object -ExpandProperty OwningProcess | Stop-Process -Force
   ```

2. **Prisma client not generated** - Always regenerate after schema changes:
   ```bash
   cd packages/database
   pnpm db:generate
   ```

3. **Import validation errors** - Use direct import instead:
   ```bash
   npx tsx scrapers/import-cards-direct.ts
   ```
   This bypasses DTO validation and handles both Japanese text and English enum values.

4. **DTO stripping fields** - If using API import, ensure all fields have `@IsOptional()` decorator in DTO:
   ```typescript
   @IsOptional()
   @ApiProperty({ required: false })
   fieldName?: type;
   ```

### Database Debugging

**Direct Database Queries:**
```bash
cd packages/database
pnpm db:studio              # Open Prisma Studio GUI
```

**Test Filters with Node:**
```javascript
node -e "
const { PrismaClient } = require('./packages/database/node_modules/.prisma/client');
const prisma = new PrismaClient();
prisma.card.findMany({ 
  where: { types: { has: 'GRASS' } }, 
  take: 3,
  select: { webCardId: true, name: true, types: true }
}).then(console.log).then(() => process.exit(0));
"
```

**Utility Scripts:**
- `packages/database/test-filters.js` - Test all card filters
- `scrapers/update-existing-cards.mjs` - Update cards with types/supertype/rarity from JSON

### Testing Checklist

Before committing changes:
- [ ] Run `npm test` - All tests pass
- [ ] Run `pnpm build` - No TypeScript errors
- [ ] Run `pnpm lint:fix` - Code style consistent
- [ ] Test API endpoints manually with curl/Postman
- [ ] Verify database schema is up-to-date (`pnpm db:generate`)
- [ ] Check `.vscode/launch.json` works for debugging
- [ ] Update test cases if adding new filters/features

### Troubleshooting Tests

**Issue: "Cannot find module '@/lib/api-client'"**
- Solution: Check `tsconfig.json` has correct path mappings
- Ensure Jest config includes `moduleNameMapper` for path aliases

**Issue: "Tests hang/timeout"**
- Solution: Mock all API calls with `mockApiClient.get.mockResolvedValue()`
- Set `retry: false` in QueryClient default options
- Use `waitFor()` for async assertions

**Issue: "Combobox index wrong after adding filter"**
- Solution: Update all test combobox indices when adding new dropdowns
- Order: supertype[0], types[1], rarity[2], language[3]

**Issue: "API returns 400 Bad Request during import"**
- Solution: Check DTO accepts all fields from JSON (language, region, scrapedAt, etc.)
- Set `forbidNonWhitelisted: false` in ValidationPipe
- Verify `pokemonTypes` field is mapped to `types` in service

**Issue: "Filter returns same results for true/false"**
- Solution: Check if filtering on JSONB field - use raw SQL with `= 'null'::jsonb` not `IS NULL`
- Verify boolean query parameters use `@Transform` decorator, not `@Type(() => Boolean)`
- Add logging to see actual SQL WHERE clause being generated

## Deck View Logic (apps/web)

### File: `apps/web/src/app/deck-builder/event/[deckCode]/page.tsx`

The event deck view page handles tournament deck display with card role assignment.

### Section Keys & Display Order
```typescript
type SectionKey =
  | 'pokemon-main'       // 主攻 – primary attackers
  | 'pokemon-secondary'  // 副攻 – secondary/tech attackers
  | 'pokemon-support'    // 輔助 – draw/search engines
  | 'pokemon-evolution'  // 進化 – evolution stage cards
  | 'ace'               // ACE SPEC
  | 'supporter'         // Supporter trainers
  | 'stadium'           // Stadium trainers
  | 'item'              // Item trainers
  | 'tool'              // Tool trainers
  | 'basic-energy'      // Basic Energy
  | 'special-energy';   // Special Energy
```

### Card Role System
Each Pokemon is assigned a `PokemonRole` which overrides auto-classification. Roles are stored in `DeckCardRole` (DB), localStorage (cache), and cross-deck global lookup.

**Priority chain:**
1. **Deck-specific DB role** (`/decks/code/{code}/roles`) — highest priority
2. **Cross-deck global role** (`/decks/roles/lookup?cards=...`) — fills unset cards
3. **Auto-derived** from `getSectionKey(entry)` — fallback from card data

**Role key:** Always use `primaryCardId ?? canonicalWebCardId ?? webCardId` (NOT `webCardId` alone).

**DB enum → UI role mapping:**
```typescript
const DB_TO_ROLE = {
  POKEMON_MAIN: 'pokemon-main',
  POKEMON_SECONDARY: 'pokemon-secondary',
  POKEMON_SUPPORT: 'pokemon-support',
  POKEMON_EVOLUTION: 'pokemon-evolution',
};
```

### DB Cards vs deckData Merge Pattern
The deck may have:
- **DB cards** (`data.cards`) – full card objects from `DeckCard` join, include HP/attacks/subtypes
- **deckData** (`data.deckData`) – raw import entries with only `cardId/cardName/quantity/imageUrl`

Merge rule: Use DB cards first; add `deckData` entries only if not already matched by normalized webCardId OR card name. Normalize IDs by stripping leading prefix letters and zeros: `"jp48778"` → `"48778"`, `"hk00014744"` → `"14744"`.

**Supertype inference from imageUrl** (deckData fallback only):
- `_P_` in URL → `POKEMON`
- `_E_` in URL → `ENERGY`
- `_T_` in URL → `TRAINER`

### Archetype Name Derivation
Computed client-side and persisted via `PATCH /decks/code/{code}/meta`:
1. Take `pokemon-main` section, filter out lower evolution stages (keep highest in chain)
2. Prefer `zhName` over `name` for display
3. Append up to 1 draw-engine support Pokemon if it matches known draw-engine JP names (e.g. リーリエのピッピex, ノコッチex, ゲノセクトex, フーディン)
4. Add ACE SPEC name (`aceName`) separately

### Known Draw-Engine Pokemon (filter from archetype name)
```typescript
const DRAW_ENGINE_JP = ['リーリエのピッピex', 'ノコッチex', 'ゲノセクトex', 'フーディン'];
```
These appear in almost every deck — exclude from main archetype name but include as support note.

### Known ACE SPEC Cards (JP names for inference)
Used when `deckData` has no rarity — infer `ACE_SPEC_RARE` if card name matches:
`マキシマムベルト`, `プライムキャッチャー`, `テラスタルオーブ`, `マスターボール`, `アンフェアスタンプ`, `ヒーローマント`, `ネオアッパーエネルギー`, and others. See page source for full list.

### API Endpoints Used by Deck View
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/decks/code/{deckCode}` | Fetch deck with cards + pricing |
| GET | `/decks/code/{deckCode}/roles` | Fetch deck-specific Pokemon roles |
| PUT | `/decks/code/{deckCode}/roles/{cardId}` | Upsert a single card's role |
| GET | `/decks/roles/lookup?cards=id1,id2,...` | Cross-deck role lookup by primaryCardId |
| PATCH | `/decks/code/{deckCode}/meta` | Persist computed archetype + ACE name |

### Deck Price View
Route: `/deck-builder/event/{deckCode}/prices`  
Linked from `DeckSummary` via `priceBreakdownHref` prop.

---

## Scraper Reference

### Scraper Locations
| Scraper | File | Region | Source |
|---------|------|--------|--------|
| Japanese | `scrapers/src/japanese_card_scraper.py` | JP | pokemon-card.com |
| Hong Kong | `scrapers/src/hk_card_scraper.py` | HK | ptcg.com.hk |
| English (Asia) | `scrapers/src/english_card_scraper.py` | EN | Various |

### Japanese Rarity Code → DB Enum
| JP Code | DB Enum |
|---------|---------|
| `C` | `COMMON` |
| `U` | `UNCOMMON` |
| `R` | `RARE` |
| `RR` | `DOUBLE_RARE` |
| `RRR` | `ULTRA_RARE` |
| `AR` | `ILLUSTRATION_RARE` |
| `SAR` | `SPECIAL_ILLUSTRATION_RARE` |
| `SR` | `SHINY_RARE` |
| `UR` | `HYPER_RARE` |
| `ACE` | `ACE_SPEC` |
| `PROMO` | `PROMO` |

### Japanese Supertype Detection (HTML indicators)
```python
# pokemon-card.com page signals:
'ポケモン'     → POKEMON
'トレーナーズ' → TRAINER
'エネルギー'   → ENERGY
```

### Japanese Trainer Subtype Detection (section heading)
```python
'ポケモンのどうぐ' → TOOL
'スタジアム'       → STADIUM
'サポート'         → SUPPORTER
(default)           → ITEM
```

### Japanese Energy Subtype Detection
```python
'基本' in page_text → BASIC_ENERGY
(default)            → SPECIAL_ENERGY
```

### Scraper Output JSON Schema
```json
{
  "webCardId": "jp49355",
  "name": "ピカチュウ",
  "language": "JA_JP",
  "region": "JP",
  "supertype": "POKEMON",
  "evolutionStage": "BASIC",
  "subtype": null,
  "variantType": "NORMAL",
  "rarity": "COMMON",
  "expansionCode": "sv9",
  "collectorNumber": "001/100",
  "hp": 60,
  "pokemonTypes": ["LIGHTNING"],
  "attacks": [{ "name": "でんきショック", "cost": "雷", "damage": "10", "effect": "..." }],
  "abilities": [],
  "weakness": { "type": "FIGHTING", "value": "×2" },
  "retreatCost": 1,
  "regulationMark": "H",
  "artist": "Mitsuhiro Arita",
  "imageUrl": "https://...",
  "sourceUrl": "https://www.pokemon-card.com/...",
  "scrapedAt": "2026-05-05T10:30:00"
}
```

**Note:** `pokemonTypes` (scraper) maps to `types` (DB). Both field names are handled by `import-cards-direct.ts`.

### Direct Import Script (`scrapers/import-cards-direct.ts`)
Key mapping tables used during import:
```typescript
// Rarity short codes (JP scraper output → DB enum)
'C'    → COMMON,  'U' → UNCOMMON,  'R' → RARE,  'RR' → DOUBLE_RARE
'RRR'  → ULTRA_RARE,  'AR' → ILLUSTRATION_RARE,  'SAR' → SPECIAL_ILLUSTRATION_RARE
'SR'   → SHINY_RARE,  'UR' → HYPER_RARE,  'ACE' → ACE_SPEC

// Also accepts full enum strings directly (e.g. "COMMON", "ILLUSTRATION_RARE")
// Evolution stages: 'BASIC', 'STAGE_1', 'STAGE_2', 'MEGA', 'VMAX', 'VSTAR'
// RuleBox detection from card name suffix: 'ex' → EX, 'GX' → GX, 'V' → V, etc.
```