# PTCG CardDB - Requirements Specification

## Functional Requirements (FR)

### FR-1: Authentication Module
- `loginWithOAuth()` - Authenticate user via Google OAuth
- `refreshAccessToken()` - Rotate JWT tokens without re-login
- `revokeSession()` - Invalidate user session from database
- `validateUserRole()` - Check user role (guest/user/admin)

### FR-2: Card Management Module
- `upsertPrimaryCard()` - Create/update canonical card identity
- `upsertCardLanguageVariant()` - Create/update language-specific card (ja-JP, zh-HK, en-US)
- `getCardListPaginated()` - Retrieve card list with pagination
- `getCardDetailsWithVariants()` - Get full card details including all language variants
- `searchCardsGlobal()` - Search cards across all languages
- `deduplicateCard()` - Detect and prevent duplicate cards using webCardId and composite constraints

### FR-3: Expansion Management Module
- `upsertPrimaryExpansion()` - Create/update canonical expansion (e.g., "SV9")
- `upsertRegionalExpansion()` - Store region-specific expansion codes (e.g., "SV08" for HK)
- `mapRegionalExpansionCode()` - Resolve regional codes to canonical expansion

### FR-4: User Collection Module
- `getUserCollection()` - Retrieve user's owned cards
- `addCardToCollection()` - Add card to user's collection
- `removeCardFromCollection()` - Remove card from user's collection
- `updateCardQuantity()` - Update quantity of specific card in collection
- `getCollectionStats()` - Calculate collection statistics

### FR-5: Scraper Engine
- `fetchSourceHtml()` - Retrieve HTML from external sources (HK, JP, EN)
- `parseCardDetailsSafe()` - Defensively parse card data with error handling
- `validateScrapedData()` - Validate data before database insertion
- `detectDuplicateCard()` - Check for existing cards before insert
- `generateFailureReport()` - Create report of failed scraping attempts
- `retryFailedScrape()` - Re-attempt failed scraping jobs

### FR-6: Admin Module
- `viewSystemDashboard()` - Display system statistics
- `manageUsers()` - Admin user management interface
- `triggerScraperJob()` - Manually start scraping jobs
- `viewScraperLogs()` - Access scraper success/failure reports

### FR-7: Tournament Management Module
- `scrapeTournamentResults()` - Fetch tournament data from Pokemon website
- `getTournamentList()` - Retrieve tournaments with filtering
- `getTournamentDetails()` - Get tournament info with results
- `searchPlayerResults()` - Find tournaments by player name
- `getTournamentStats()` - Get meta-game statistics

### FR-8: Deck Management Module
- `createDeck()` - Create new deck
- `updateDeck()` - Update deck list
- `deleteDeck()` - Remove deck
- `getUserDecks()` - Get user's decks
- `importDeckFromTournament()` - Copy tournament deck to user collection
- `exportDeckList()` - Export deck in standard format
- `validateDeck()` - Check deck legality (60 cards, 4-of rule)

### FR-9: Market Price Tracking Module
- `fetchCardPrices()` - Scrape prices from marketplaces
- `getCardPriceHistory()` - Retrieve historical price data
- `compareCardPrices()` - Compare prices across sources
- `setCardPriceAlert()` - Notify when price drops below threshold
- `updatePriceDaily()` - Scheduled job to update prices

---

## Non-Functional Requirements (NFR)

### NFR-1: Performance
- `implementPagination()` - All list endpoints must support skip/take (default: 50, max: 100)
- `enableQueryOptimization()` - Use Prisma select/include to prevent N+1 queries
- `addDatabaseIndexes()` - Index all frequently queried fields
- `implementVirtualScrolling()` - Frontend must virtualize lists >100 items
- `lazyLoadImages()` - Use Next.js Image with loading="lazy"

### NFR-2: Caching Strategy
- `cacheResponseRedis()` - Cache frequent queries in Redis
- `setCacheTTL()` - Cards: 5min, Details: 15min, Tournaments: 1hr
- `invalidateCacheOnMutation()` - Clear cache after data changes

### NFR-3: Rate Limiting
- `checkRateLimit()` - Enforce limits: 100 req/min (authenticated), 20 req/min (unauthenticated)
- `addRateLimitHeaders()` - Include X-RateLimit-* headers in responses
- `rateLimitScraper()` - 1-2 second delay between external requests

### NFR-4: Security
- `validateInputDTO()` - Validate all inputs at DTO level (class-validator)
- `sanitizeUserInput()` - Prevent XSS attacks
- `enforceCSRFProtection()` - Use CSRF tokens and SameSite cookies
- `useParameterizedQueries()` - Prevent SQL injection via Prisma
- `verifyAuthorizationGuard()` - Check permissions on all protected endpoints
- `useEnvironmentVariables()` - Never hardcode secrets

### NFR-5: Data Integrity
- `enforceUniqueConstraints()` - Composite: [primaryCardId, language, variantType]
- `enforceForeignKeys()` - All relationships with onDelete cascade
- `useTransactions()` - Atomic operations for multi-table changes
- `validateAtThreeLevels()` - Database, DTO, and Service validation

### NFR-6: Monitoring & Logging
- `monitorSystemHealth()` - Health check endpoint
- `logSystemEvent()` - Structured logging for all operations
- `trackScraperMetrics()` - Log success/failure counts per run
- `captureErrorDetails()` - Log parsing errors with context

### NFR-7: Testing Coverage
- `maintainCodeCoverage()` - >70% coverage for all services
- `testErrorPaths()` - Test success, error, and edge cases
- `implementE2ETests()` - Critical flows (login, browse, add to collection)
- `performLoadTesting()` - Baseline (10 users), Load (100 users), Stress (500 users)