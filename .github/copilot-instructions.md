# PTCG CardDB - AI Coding Agent Instructions

## Project Overview
**PTCG CardDB** is a multi-language Pokemon Trading Card Game database with tournament tracking, deck building, and market pricing. This is a TypeScript monorepo using **pnpm workspaces** and **Turborepo**.

**Core Architecture:** Multi-language card system where cards exist as language variants (ja-JP, zh-HK, en-US) linked to canonical `PrimaryCard` identities. Each card has a unique `webCardId` format (e.g., `hk00014744`, `jp49355`). Regional expansion codes (JP "SV8" vs HK "SV08" vs EN "sv9") map to a canonical `PrimaryExpansion`.

## Workspace Structure

```
apps/
  api/              # NestJS REST API (Port 4000)
  web/              # Next.js frontend (Port 3001)
packages/
  database/         # Prisma schema + client (@ptcg/database)
  shared-types/     # TypeScript types (@ptcg/shared-types)
scrapers/           # Python scrapers for card/tournament data
data/               # Persistent data storage (cards, images, events)
```

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
pnpm db:generate      # Generate Prisma client (run after schema changes)
pnpm db:migrate       # Create and apply migrations
pnpm db:studio        # Open Prisma Studio
pnpm db:seed          # Seed database with test data
```

**Critical:** After modifying `schema.prisma`, always run `pnpm db:generate` before building or running apps.

### Scraper & Import Workflows

**Japanese Card Import Pipeline:**
```powershell
# 1. Scrape cards with HTML caching (for debugging/re-processing)
cd scrapers
python src/japanese_card_scraper.py --id-range 48000 100 --cache-html

# 2. Fast offline re-processing (20 threads, cache-only)
python src/japanese_card_scraper.py --id-range 48000 1000 --cache-only --threads 20

# 3. Import JSON to database via API
python import_cards_to_api.py --file "../data/cards/japan/japanese_cards_40k_sv9.json"

# 4. Update existing cards with types/supertype/rarity (if schema evolved)
node update-existing-cards.mjs
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
  - webCardId="hk00014744", language=ZH_HK, variantType=NORMAL
  - webCardId="jp49355", language=JA_JP, variantType=HOLO

### Expansion Code Mapping
Regional codes map to canonical expansions via `RegionalExpansion`:
- Japan: "SV8" → PrimaryExpansion "SV9"
- Hong Kong: "SV08" → PrimaryExpansion "SV9"
- English: "sv9" → PrimaryExpansion "SV9"

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

## Database Constraints & Validation

### Critical Unique Constraints
- **Card:** `[primaryCardId, language, variantType]` - Prevents duplicate language variants
- **Card:** `webCardId` - Globally unique scraper identifier
- **PrimaryCard:** `[primaryExpansionId, cardNumber]` - One card number per expansion
- **RegionalExpansion:** `[primaryExpansionId, region]` - One regional code per region

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
**Script:** `scrapers/import_cards_to_api.py`

**Workflow:**
1. Reads JSON from `data/cards/{region}/`
2. Batches cards (default: 100 per request)
3. POSTs to `http://localhost:4000/api/v1/cards/import/batch`
4. Logs success/failure with detailed error reporting

**Usage:**
```powershell
# Import all Japanese cards
python import_cards_to_api.py

# Import specific file with custom batch size
python import_cards_to_api.py --file "../data/cards/japan/japanese_cards_40k_sv9.json" --batch-size 50
```

**Output Format:**
```
Files processed:  94
Total cards:      9,593
Successfully imported: 9,593
Failed:           0
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
1. **API Server** - Debug NestJS API on port 4000
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
curl http://localhost:4000/api/v1/cards?take=1

# Check specific filter
curl "http://localhost:4000/api/v1/cards?types=GRASS&take=3"
```

**Common API Issues:**
1. **Port 4000 in use** - Kill existing process:
   ```powershell
   Get-NetTCPConnection -LocalPort 4000 | Select-Object -ExpandProperty OwningProcess | Stop-Process -Force
   ```

2. **Prisma client not generated** - Always regenerate after schema changes:
   ```bash
   cd packages/database
   pnpm db:generate
   ```

3. **Import validation errors** - Set `forbidNonWhitelisted: false` in `main.ts` for backward compatibility with scraped JSON

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