# PTCG CardDB - Implementation Started

## ✅ Completed Setup

### 1. Project Structure
Created a **monorepo** architecture using **pnpm workspaces** and **Turborepo**:

```
PTCG_2026/
├── apps/
│   ├── admin-gui/          # Admin dashboard (Port 3332)
│   ├── private-gui/        # Local single-user app (Port 3333)
│   ├── public-gui/         # Multi-user web app (Port 3334)
│   └── api/                # NestJS REST API (Port 4000)
├── packages/
│   ├── database/           # Prisma schema & client
│   ├── shared-types/       # TypeScript type definitions
│   └── ui-components/      # Shared React components
├── scrapers/               # Python web scrapers
└── config/                 # Configuration files
```

### 2. Database Package (@ptcg/database)
✅ **Prisma schema created** with multi-language architecture:

**Core Models:**
- `User` - User authentication with roles (GUEST, USER, ADMIN)
- `Session` - JWT session management with refresh tokens
- `PrimaryExpansion` - Canonical expansion identity
- `RegionalExpansion` - Region-specific expansion codes (HK, JP, EN)
- `PrimaryCard` - Canonical card identity
- `Card` - Language-specific card variants (ja-JP, zh-HK, en-US)
- `Collection` - User collections
- `CollectionItem` - Cards in collections
- `Tournament` - Pokemon tournament events
- `TournamentResult` - Tournament standings and player results
- `Deck` - User and tournament deck lists
- `DeckCard` - Cards in decks
- `CardPrice` - Current market prices from various sources
- `PriceHistory` - Historical pricing data
- `ScraperJob` - Scraper execution logs

**Key Features:**
- Multi-language support with `primaryCardId` linking
- Expansion code mapping (e.g., JP "SV8" = HK "SV08" = EN "sv9" → canonical "SV9")
- Unique `webCardId` format: `hk00014744`, `jp49355`
- Composite unique constraints to prevent duplicates
- Foreign key cascades for data integrity
- Tournament tracking from Pokemon events website
- Deck builder with validation (60-card rule, 4-of limit)
- Market price tracking from multiple sources (Yuyu-tei, Hareruya, etc.)
- Historical price charts

### 3. Shared Types Package (@ptcg/shared-types)
✅ **TypeScript interfaces created**:
- `LanguageCode`, `Region`, `UserRole`, `VariantType`
- `ApiResponse<T>`, `PaginationMeta`, `ApiError`
- `CardAbility`, `CardAttack`, `CardSearchParams`
- `CollectionStats`, `ScraperJobResult`
- `AuthTokens`, `UserPayload`

### 4. NestJS API (@ptcg/api)
✅ **Backend structure initialized**:

**Modules Created:**
- `AuthModule` - Authentication & authorization
- `CardsModule` - Card management
- `CollectionsModule` - User collections
- `ExpansionsModule` - Expansion management
- `ScrapersModule` - Scraper job management
- `UsersModule` - User management
- `TournamentsModule` - Tournament results tracking
- `DecksModule` - Deck builder and management
- `PricesModule` - Market price tracking

**Core Services:**
- `PrismaService` - Database connection
- `AllExceptionsFilter` - Global error handling
- Swagger documentation configured at `/api/docs`
- Rate limiting: 100 req/min authenticated, 20 req/min unauthenticated
- Global validation pipes enabled

**Configuration:**
- Environment variables template (`.env.example`)
- TypeScript strict mode enabled
- Path aliases for workspace packages

### 5. Configuration Files
✅ **Monorepo tools configured**:
- `package.json` - Root package with workspace scripts
- `turbo.json` - Turborepo pipeline configuration
- `pnpm-workspace.yaml` - Workspace package locations
- `.gitignore` - Ignoring node_modules, .env, build outputs
- `.prettierrc` - Code formatting standards

---

## 🚀 Next Steps (Phase 1: Foundation)

### Step 1: Install Dependencies
```bash
pnpm install
```

### Step 2: Setup Database
```bash
cd packages/database
npx prisma generate
npx prisma migrate dev --name init
```

### Step 3: Create Seed Data
Create `packages/database/prisma/seed.ts`:
- Seed test users (guest, user, admin)
- Seed sample expansions (SV9, SV8)
- Seed regional expansion mappings
- Seed sample cards in multiple languages

### Step 4: Implement Core API Endpoints

#### 4.1 Cards Module
- `POST /api/v1/cards` - Create card (upsert logic)
- `GET /api/v1/cards` - List cards with pagination
- `GET /api/v1/cards/:id` - Get card details
- `GET /api/v1/cards/search` - Search cards
- `PATCH /api/v1/cards/:id` - Update card
- `DELETE /api/v1/cards/:id` - Delete card

#### 4.2 Expansions Module
- `POST /api/v1/expansions` - Create expansion
- `GET /api/v1/expansions` - List expansions
- `GET /api/v1/expansions/:id` - Get expansion details
- `POST /api/v1/expansions/:id/regional` - Add regional code

#### 4.3 Auth Module
- `POST /api/v1/auth/login` - OAuth login
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/logout` - Revoke session
- `GET /api/v1/auth/me` - Get current user

#### 4.4 Collections Module
- `GET /api/v1/collections` - Get user collections
- `POST /api/v1/collections` - Create collection
- `POST /api/v1/collections/:id/cards` - Add card
- `DELETE /api/v1/collections/:id/cards/:cardId` - Remove card
- `GET /api/v1/collections/:id/stats` - Get statistics

#### 4.5 Tournaments Module
- `GET /api/v1/tournaments` - List tournaments with filters
- `GET /api/v1/tournaments/:id` - Get tournament details
- `GET /api/v1/tournaments/:id/results` - Get tournament results
- `POST /api/v1/tournaments/scrape` - Trigger tournament scraper
- `GET /api/v1/tournaments/stats` - Get meta-game statistics
- `GET /api/v1/tournaments/search/player/:name` - Search by player

#### 4.6 Decks Module
- `GET /api/v1/decks` - List user decks
- `POST /api/v1/decks` - Create deck
- `GET /api/v1/decks/:id` - Get deck details
- `PATCH /api/v1/decks/:id` - Update deck
- `DELETE /api/v1/decks/:id` - Delete deck
- `POST /api/v1/decks/:id/cards` - Add card to deck
- `DELETE /api/v1/decks/:id/cards/:cardId` - Remove card
- `POST /api/v1/decks/:id/validate` - Validate deck legality
- `POST /api/v1/decks/import/tournament/:resultId` - Import from tournament

#### 4.7 Prices Module
- `GET /api/v1/prices/card/:id` - Get current prices for card
- `GET /api/v1/prices/card/:id/history` - Get price history
- `GET /api/v1/prices/compare/:id` - Compare prices across sources
- `POST /api/v1/prices/scrape` - Trigger price scraper
- `POST /api/v1/prices/alerts` - Set price alert
- `GET /api/v1/prices/alerts` - Get user's price alerts

### Step 5: Write Tests
- Unit tests for services (>70% coverage)
- Integration tests for API endpoints
- Mock Prisma client for tests

---

## 📋 Implementation Checklist

### Database Layer
- [x] Prisma schema created
- [ ] Migrations applied
- [ ] Seed script written
- [ ] Database seeded with test data

### API Layer
- [x] NestJS project initialized
- [x] Module structure created
- [ ] DTOs with validation created
- [ ] Services implemented
- [ ] Controllers implemented
- [ ] Guards & decorators implemented
- [ ] Unit tests written (>70% coverage)
- [ ] Integration tests written

### Frontend (Next Phase)
- [ ] Public GUI - Next.js App Router
- [ ] Private GUI - Next.js with SQLite
- [ ] Admin GUI - Admin dashboard
- [ ] React Query setup
- [ ] Authentication flow
- [ ] E2E tests with Playwright

### Scrapers (Next Phase)
- [ ] Refactor Python scrapers
- [ ] Defensive parsing implemented
- [ ] Error recovery added
- [ ] Integration with API
- [ ] Schedule scraper jobs

---

## 🔧 Development Commands

```bash
# Install all dependencies
pnpm install

# Start all apps in development
pnpm dev

# Start specific app
pnpm dev --filter=api
pnpm dev --filter=public-gui

# Build all apps
pnpm build

# Run tests
pnpm test
pnpm test:watch

# Database commands
cd packages/database
npx prisma generate        # Generate Prisma client
npx prisma migrate dev     # Create & apply migration
npx prisma studio          # Open database GUI
npx prisma db seed         # Seed database

# Code quality
pnpm lint                  # Check linting
pnpm lint:fix              # Fix linting issues
pnpm format                # Format code
pnpm type-check            # Check TypeScript
```

---

## 🎯 Critical Reminders (From Guidelines)

### Database
- ✅ Always use multi-language architecture (primary_cards + cards)
- ✅ Always use expansion mapping (primary_expansions + regional_expansions)
- ✅ Always use upsert, never raw insert
- ✅ Always add indexes to queried fields
- ✅ Always use foreign key constraints with onDelete

### API
- ✅ Always validate input with DTOs
- ✅ Always implement rate limiting
- ✅ Always use pagination (skip/take)
- ✅ Always cache frequently accessed data (Redis)
- ✅ Always implement proper error handling

### Security
- ✅ Always validate and sanitize user input
- ✅ Always check authorization on protected endpoints
- ✅ Always use environment variables for secrets
- ✅ Always implement CSRF protection

### Testing
- ✅ Always write tests before implementation (TDD)
- ✅ Always maintain >70% code coverage
- ✅ Always test error cases, not just happy path
- ✅ Always run tests before committing

---

## 📚 Documentation References

- **Requirements:** `README.md`
- **Coding Guidelines:** `PTCG_WebDraft.md`
- **API Documentation:** `http://localhost:4000/api/docs` (after starting API)

---

## 🚦 Status

**Current Phase:** Phase 1 - Foundation Setup
**Status:** ✅ Project structure initialized, ready for implementation
**Next Action:** Install dependencies and generate Prisma client

```bash
# Run these commands to continue:
pnpm install
cd packages/database
npx prisma generate
```
