# PTCG CardDB - AI Coding Agent Instructions

## Project Overview
**PTCG CardDB** is a multi-language Pokemon Trading Card Game database with tournament tracking, deck building, and market pricing. This is a TypeScript monorepo using **pnpm workspaces** and **Turborepo**.

**Core Architecture:** Multi-language card system where cards exist as language variants (ja-JP, zh-HK, en-US) linked to canonical `PrimaryCard` identities. Each card has a unique `webCardId` format (e.g., `hk00014744`, `jp49355`). Regional expansion codes (JP "SV8" vs HK "SV08" vs EN "sv9") map to a canonical `PrimaryExpansion`.

## Workspace Structure

```
apps/
  api/              # NestJS REST API (Port 4000)
  admin-gui/        # Admin dashboard (Port 3332)
  private-gui/      # Local single-user app (Port 3333)
  public-gui/       # Multi-user web app (Port 3334)
packages/
  database/         # Prisma schema + client (@ptcg/database)
  shared-types/     # TypeScript types (@ptcg/shared-types)
  ui-components/    # Shared React components
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

### Testing
```bash
pnpm test             # Run all tests
pnpm test:watch       # Watch mode for tests
```

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

### Scraper Job Tracking
Jobs logged in `ScraperJob` model with:
- `source` - Region (HK, JP, EN)
- `status` - PENDING, RUNNING, SUCCESS, FAILED
- `errors` - JSON array of error objects

### Defensive Parsing (FR-5)
- `parseCardDetailsSafe()` - Error handling wrapper
- `validateScrapedData()` - Pre-insert validation
- `detectDuplicateCard()` - Check `webCardId` before insert
- `generateFailureReport()` - Structured error logging

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
