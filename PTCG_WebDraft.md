<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# remove sample code

I'll create a concise guideline without sample code, focusing on rules and principles.

***

# AI Development Guideline for PTCG CardDB Rewrite

**Document Version:** 1.0
**Last Updated:** January 20, 2026
**Target Audience:** AI Coding Assistants (Cursor, GitHub Copilot, Claude, ChatGPT)
**Project:** PTCG CardDB Complete Rewrite

***

## Table of Contents

1. [Project Context](#1-project-context)
2. [Known Issues from Old System](#2-known-issues-from-old-system)
3. [AI Development Workflow](#3-ai-development-workflow)
4. [Code Generation Guidelines](#4-code-generation-guidelines)
5. [Database Implementation Rules](#5-database-implementation-rules)
6. [API Development Standards](#6-api-development-standards)
7. [Frontend Development Standards](#7-frontend-development-standards)
8. [Testing Requirements](#8-testing-requirements)
9. [Common Pitfalls to Avoid](#9-common-pitfalls-to-avoid)
10. [Quality Checklist](#10-quality-checklist)

***

## 1. Project Context

### 1.1 Project Overview

**What we're building:**

- Complete rewrite of PTCG CardDB (Pokémon Trading Card Game Database)
- Modernize from Python/JavaScript mixed stack to TypeScript-first architecture
- Transform from single-user SQLite to multi-user PostgreSQL system
- Three distinct GUIs: Admin, Private (offline), Public (multi-user)

**Why the rewrite:**

- Old system has scaling bottlenecks (SQLite single-writer limitation)
- No proper API layer (direct database access)
- Mixed tech stack causing maintenance issues
- Limited authentication and user management
- Performance issues with large datasets


### 1.2 Architecture Stack

**Old System:**

- Language: Mixed (Python scrapers, JavaScript GUIs)
- Database: SQLite only
- Backend: No API layer (direct DB access)
- Auth: Basic Google OAuth

**New System:**

- Language: TypeScript (unified), Python (scrapers only)
- Database: PostgreSQL (multi-user) + SQLite (private GUI)
- Backend: NestJS REST API
- Auth: NextAuth.js + JWT

***

## 2. Known Issues from Old System

### 2.1 Database Issues ⚠️

#### Issue \#1: No Multi-Language Card Support

**Problem:** Old schema stored only one language per card in a single record

**Solution Required:**

- Create `primary_cards` table for canonical card identity
- Create `cards` table for language-specific versions
- Link through `primaryCardId` foreign key
- Use language codes: "ja-JP", "zh-HK", "en-US", "zh-TW"

**AI Rules:**

- ✅ Always create primary_cards + cards tables
- ✅ Link cards through primaryCardId foreign key
- ❌ Never store multiple languages in single record
- ✅ Each card language version is separate row


#### Issue \#2: Inconsistent Expansion Codes

**Problem:** Same expansion has different codes per region:

- JP site: "SV8" (未来の一閃)
- HK site: "SV08" (驚濤駭浪 / Surging Sparks)
- EN site: "sv9" (Surging Sparks)

**Solution Required:**

- Create `primary_expansions` for canonical identity
- Create `regional_expansions` for region-specific codes
- Use canonical codes (uppercase, no leading zeros): "SV9"
- Store regional variations separately

**AI Rules:**

- ✅ Create expansion mapping tables
- ✅ Use canonical codes as primary reference
- ✅ Store regional variations with region + code
- ❌ Never assume expansion codes are consistent


#### Issue \#3: Duplicate Card Detection Failed

**Problem:** Scrapers created duplicates if card already existed

**Solution Required:**

- Use unique `webCardId` with language prefix format: "hk00014744", "jp49355"
- Implement composite unique constraint: `[primaryCardId, language, variantType]`
- Always use upsert logic, never raw insert

**AI Rules:**

- ✅ Always use upsert operations
- ✅ Use composite unique constraints
- ✅ Implement deduplication logic
- ❌ Never create duplicates silently
- ✅ webCardId format: `{lang_prefix}{website_id}`


### 2.2 API/Backend Issues ⚠️

#### Issue \#4: No API Layer

**Problem:** GUIs accessed database directly, causing tight coupling and no scalability

**Solution Required:**

- Build centralized NestJS REST API
- All data access through API endpoints
- Use Prisma ORM for type-safe database queries
- Implement proper REST conventions

**AI Rules:**

- ✅ Create complete REST API first
- ✅ All data access through API
- ❌ Never allow direct database access from frontend
- ✅ Use Prisma for all database operations


#### Issue \#5: No Rate Limiting or Caching

**Problem:** No protection against abuse, repeated queries caused database load

**Solution Required:**

- Implement rate limiting: 100 req/min authenticated, 20 req/min unauthenticated
- Use Redis for caching frequently accessed data
- Cache TTL: Cards 5min, Details 15min, Tournaments 1hr
- Implement scraper rate limiting (1-2 sec delay between requests)

**AI Rules:**

- ✅ Implement rate limiting on all endpoints
- ✅ Cache frequently accessed data
- ✅ Use Redis for distributed caching
- ✅ Respect source website rate limits
- ✅ Add X-RateLimit headers to responses


### 2.3 Authentication Issues ⚠️

#### Issue \#6: Weak Authentication

**Problem:** Basic Google OAuth with no role management, no session expiry, no token refresh

**Solution Required:**

- Implement NextAuth.js with proper configuration
- Role-Based Access Control (RBAC): guest, user, admin
- JWT with 1-hour expiry, refresh token 7-day expiry
- Store sessions in database for revocation capability

**AI Rules:**

- ✅ Implement role-based access control
- ✅ Use JWT with proper expiry
- ✅ Implement token refresh mechanism
- ✅ Store sessions in database
- ❌ Never trust client-side role claims
- ✅ Verify permissions on every protected endpoint


### 2.4 Data Scraping Issues ⚠️

#### Issue \#7: Scraper Crashes on Missing Data

**Problem:** Scrapers assumed all HTML elements exist, crashed on missing fields

**Solution Required:**

- Use defensive parsing with try-except blocks
- Provide default values for optional fields
- Log parsing errors, don't crash
- Validate data before database insert

**AI Rules:**

- ✅ Always use try-except for parsing
- ✅ Provide default values for optional fields
- ✅ Log parsing errors with details
- ✅ Continue processing on errors
- ❌ Never assume HTML structure is consistent


#### Issue \#8: No Scraper Error Recovery

**Problem:** Entire scraper run stopped on any single error

**Solution Required:**

- Continue on errors, collect failures in list
- Generate failure reports at end
- Support retry mechanism for failed items
- Log successful and failed counts

**AI Rules:**

- ✅ Implement error recovery in loops
- ✅ Log failed items separately
- ✅ Generate failure reports (failed_cards.txt)
- ✅ Support retry mechanism
- ❌ Never stop entire process on single failure
- ✅ Report statistics at end (success/fail counts)


### 2.5 Frontend Issues ⚠️

#### Issue \#9: Slow Card Grid Rendering

**Problem:** Rendered all 1000+ cards at once causing performance issues

**Solution Required:**

- Implement virtual scrolling for large lists
- Use infinite scroll with React Query
- Paginate API requests (50-100 items per page)
- Lazy load images with loading="lazy"

**AI Rules:**

- ✅ Use infinite scroll with React Query
- ✅ Implement virtual scrolling for 100+ items
- ✅ Lazy load images
- ✅ Paginate API requests
- ❌ Never render 1000+ items without virtualization


#### Issue \#10: No Loading States

**Problem:** Data appeared suddenly with no feedback, poor UX

**Solution Required:**

- Show skeleton UI during loading
- Show error states with retry button
- Use React Query for data fetching
- Implement optimistic updates

**AI Rules:**

- ✅ Always show loading states (skeleton UI)
- ✅ Always show error states with retry
- ✅ Use React Query for data fetching
- ✅ Implement optimistic updates
- ❌ Never show blank screen while loading

***

## 3. AI Development Workflow

### 3.1 Phase-by-Phase Implementation Order

**✅ CORRECT ORDER:**

**Phase 1: Foundation (Week 1-2)**

- Database schema + Prisma setup
- Run migrations
- Seed test data

**Phase 2: Backend API (Week 3-4)**

- NestJS modules
- API endpoints
- Unit tests

**Phase 3: Public GUI (Week 5-6)**

- Next.js setup
- Authentication
- Core features
- E2E tests

**Phase 4: Private GUI (Week 7)**

- SQLite integration
- Offline features

**Phase 5: Admin GUI (Week 8)**

- Admin dashboard
- Management tools

**Phase 6: Scrapers Integration (Week 9)**

- Refactor scrapers
- Schedule jobs

**Phase 7-10: Testing, Deployment, Documentation**

**❌ WRONG ORDER:**

- Don't build all GUIs first
- Don't skip API layer
- Don't debug everything at once


### 3.2 Test-Driven Development (TDD)

**For each feature:**

1. Write test first
2. Implement feature
3. Verify test passes
4. Refactor if needed

**AI Rules:**

- ✅ Write test before implementation
- ✅ Run tests after each change
- ✅ Maintain >70% code coverage
- ❌ Never skip tests for "simple" features


### 3.3 Incremental Development

**✅ Build in small, testable increments:**

- Step 1: Basic CRUD → Test → Commit
- Step 2: Add validation → Test → Commit
- Step 3: Add filtering → Test → Commit

**❌ Don't:**

- Build entire feature (1000+ lines) at once
- Try to test everything together
- Debug for days

***

## 4. Code Generation Guidelines

### 4.1 TypeScript Standards

**✅ DO:**

- Use explicit types for all function parameters and returns
- Use enums for constants
- Use readonly for immutable data
- Use type guards for runtime checks
- Enable TypeScript strict mode

**❌ DON'T:**

- Use 'any' type
- Use magic numbers/strings
- Use @ts-ignore (fix the error instead)
- Ignore TypeScript errors
- Use loose type definitions


### 4.2 NestJS Module Structure

**Required structure per module:**

- `module.ts` - Module definition with imports/exports
- `controller.ts` - API endpoints with decorators
- `service.ts` - Business logic
- `dto/` - Data transfer objects with validation
- `*.spec.ts` - Unit tests

**Controller requirements:**

- Use proper HTTP decorators (@Get, @Post, etc.)
- Use validation pipes for all inputs
- Use guards for authentication/authorization
- Add Swagger decorators (@ApiOperation, @ApiResponse)

**Service requirements:**

- Inject dependencies through constructor
- Implement error handling
- Use transactions for multi-table operations
- Return typed responses


### 4.3 Next.js App Router Patterns

**✅ Use Server Components by default:**

- Server Components for data fetching
- Client Components only when needed (interactivity, hooks)
- Mark Client Components with 'use client'
- Fetch data at component level, not in useEffect

**❌ Don't:**

- Make everything a Client Component
- Fetch data in useEffect when Server Component can do it
- Use old Pages Router patterns


### 4.4 Prisma Query Optimization

**✅ Efficient queries:**

- Use `select` to fetch only needed fields
- Use `include` with `where` for related data
- Always use pagination (skip/take)
- Use transactions for atomic operations
- Create indexes for frequently queried fields

**❌ Inefficient queries:**

- N+1 query problem (separate queries in loops)
- Fetching all data without pagination
- Missing indexes on query fields
- No use of select (fetching all columns)

***

## 5. Database Implementation Rules

### 5.1 Migration Strategy

**✅ Create migrations incrementally:**

- Step 1: Core tables
- Step 2: Add indexes
- Step 3: Add new features
- Each migration should be small and testable

**❌ Don't:**

- Create one giant migration
- Make breaking changes without rollback plan
- Skip testing migrations on staging


### 5.2 Seed Data Rules

**✅ Proper seeding:**

- Check if data exists before seeding
- Seed in order of dependencies (parent → child)
- Use realistic test data
- Make seed script idempotent (can run multiple times)

**❌ Don't:**

- Seed without checking existing data
- Use production data in seed scripts
- Create circular dependencies


### 5.3 Data Validation Rules

**Implement validation at 3 levels:**

1. **Database level:** Constraints, types, checks
2. **DTO level:** class-validator decorators
3. **Service level:** Business logic validation

**Required validations:**

- String max lengths
- Number ranges
- Required vs optional fields
- Unique constraints
- Foreign key constraints
- Enum values

***

## 6. API Development Standards

### 6.1 REST Endpoint Naming

**✅ Correct:**

- `GET /api/v1/cards` - List
- `GET /api/v1/cards/:id` - Get one
- `POST /api/v1/cards` - Create
- `PUT /api/v1/cards/:id` - Update (full)
- `PATCH /api/v1/cards/:id` - Update (partial)
- `DELETE /api/v1/cards/:id` - Delete
- `GET /api/v1/cards/:id/skills` - Nested resource

**❌ Incorrect:**

- `/api/v1/getCards` - Don't use verbs
- `/api/v1/card` - Use plural nouns
- `/api/v1/cards/create` - Redundant
- `/api/v1/getAllCardsFromDB` - Too specific


### 6.2 Error Handling

**Standard error response format:**

- statusCode: number
- message: string
- error: string (error type)
- timestamp: ISO string
- path: request URL

**Status codes:**

- 200: Success
- 201: Created
- 400: Bad Request (validation error)
- 401: Unauthorized (not authenticated)
- 403: Forbidden (not authorized)
- 404: Not Found
- 409: Conflict (duplicate)
- 500: Internal Server Error


### 6.3 Pagination Standard

**Query parameters:**

- `skip` - Number of records to skip (default: 0)
- `take` - Number of records to return (default: 50, max: 100)

**Response format:**

- `data` - Array of items
- `meta.total` - Total count
- `meta.skip` - Current skip value
- `meta.take` - Current take value
- `meta.hasMore` - Boolean if more data exists


### 6.4 Authentication Flow

**Public endpoints:** No authentication required
**Protected endpoints:** Require JWT Bearer token
**Admin endpoints:** Require JWT + admin role

**Headers:**

- Request: `Authorization: Bearer <jwt_token>`
- Response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

***

## 7. Frontend Development Standards

### 7.1 React Query Usage

**Configuration:**

- staleTime: 5 minutes
- cacheTime: 10 minutes
- retry: 3 attempts
- refetchOnWindowFocus: false
- keepPreviousData: true (for pagination)

**Required hooks:**

- useQuery - GET requests
- useMutation - POST/PUT/PATCH/DELETE
- useInfiniteQuery - Infinite scroll
- useQueryClient - Cache invalidation

**Rules:**

- Always handle loading states
- Always handle error states
- Invalidate cache after mutations
- Use queryKey arrays for cache management


### 7.2 Form Handling

**Required stack:**

- React Hook Form - Form management
- Zod - Schema validation
- zodResolver - Connect Zod with React Hook Form

**Required features:**

- Client-side validation
- Server-side validation
- Error message display
- Loading states on submit
- Success feedback (toast/redirect)


### 7.3 Image Optimization

**✅ Use Next.js Image:**

- Set width and height
- Use loading="lazy"
- Use placeholder="blur"
- Define sizes for responsive images
- Optimize with WebP format

**❌ Don't:**

- Use regular `<img>` tags
- Load full-size images
- Skip lazy loading


### 7.4 Responsive Design

**Breakpoints (Tailwind):**

- Mobile: < 640px (sm)
- Tablet: 640px - 1024px (md, lg)
- Desktop: > 1024px (xl, 2xl)

**Required:**

- Test on all breakpoints
- Mobile-first approach
- Touch-friendly UI on mobile
- Hamburger menu on mobile
- Bottom navigation on mobile

***

## 8. Testing Requirements

### 8.1 Unit Testing

**Coverage target:** >70% for all services

**What to test:**

- Service methods (all branches)
- Utility functions
- Data transformations
- Validation logic
- Error handling

**Required:**

- Mock external dependencies (Prisma, Redis)
- Test success cases
- Test error cases
- Test edge cases


### 8.2 Integration Testing

**What to test:**

- API endpoints (all routes)
- Database operations (CRUD)
- Authentication flow
- Authorization (role checking)

**Required:**

- Use test database
- Clean up after tests
- Test request/response format
- Test status codes


### 8.3 E2E Testing

**Framework:** Playwright

**What to test:**

- Critical user flows (login, browse, add to inventory)
- Cross-browser (Chrome, Firefox, Safari)
- Mobile responsive
- Error scenarios

**Required:**

- Use data-testid attributes
- Test with realistic data
- Test error handling
- Test loading states


### 8.4 Performance Testing

**Tools:** k6 or Artillery

**Scenarios:**

- Baseline: 10 users, 1 minute
- Load: 100 users, 5 minutes
- Stress: 500 users, 10 minutes

**Metrics to track:**

- Response time (p95, p99)
- Throughput (requests/second)
- Error rate
- Database query time

***

## 9. Common Pitfalls to Avoid

### 9.1 Performance Pitfalls

**❌ PITFALL \#1: N+1 Query Problem**

- Fetching related data in loops
- **Fix:** Use Prisma `include` or `select` with relations

**❌ PITFALL \#2: No Pagination**

- Fetching all records at once
- **Fix:** Always use skip/take parameters

**❌ PITFALL \#3: Missing Indexes**

- Slow queries on unindexed columns
- **Fix:** Add indexes to frequently queried fields

**❌ PITFALL \#4: Large Image Files**

- Loading full-resolution images
- **Fix:** Use Next.js Image optimization

**❌ PITFALL \#5: No Caching**

- Repeated database queries
- **Fix:** Implement Redis caching


### 9.2 Security Pitfalls

**❌ PITFALL \#6: SQL Injection**

- Using raw queries with user input
- **Fix:** Use Prisma methods, parameterized queries

**❌ PITFALL \#7: Missing Authorization**

- No permission checks on endpoints
- **Fix:** Use Guards and Roles decorators

**❌ PITFALL \#8: Exposed Secrets**

- Hardcoded API keys, passwords
- **Fix:** Use environment variables

**❌ PITFALL \#9: XSS Vulnerabilities**

- Rendering unsanitized user input
- **Fix:** Sanitize all user input

**❌ PITFALL \#10: CSRF Attacks**

- No CSRF protection
- **Fix:** Use CSRF tokens, SameSite cookies


### 9.3 Data Integrity Pitfalls

**❌ PITFALL \#11: Missing Foreign Keys**

- Orphaned data in database
- **Fix:** Always use foreign key constraints with onDelete

**❌ PITFALL \#12: No Data Validation**

- Accepting invalid data
- **Fix:** Validate at database, DTO, and service levels

**❌ PITFALL \#13: Race Conditions**

- Concurrent updates causing conflicts
- **Fix:** Use database transactions

**❌ PITFALL \#14: No Unique Constraints**

- Duplicate data entries
- **Fix:** Add unique constraints on appropriate fields

***

## 10. Quality Checklist

### 10.1 Before Committing Code

```
□ Code compiles without errors
□ All tests pass (npm run test)
□ No TypeScript errors (npm run type-check)
□ No linting errors (npm run lint)
□ Code formatted (npm run format)
□ No console.log statements (use logger)
□ No commented-out code
□ No TODO comments without issue numbers
□ Added tests for new features
□ Updated documentation if needed
```


### 10.2 Before Creating PR

```
□ Feature works locally
□ All existing tests still pass
□ New tests added (>70% coverage)
□ E2E tests updated if needed
□ API documentation updated (Swagger)
□ README updated if needed
□ Database migrations tested
□ No breaking changes (or documented)
□ PR description includes testing steps
□ Screenshots/videos for UI changes
```


### 10.3 Before Deploying

```
□ All tests pass on CI
□ PR reviewed and approved
□ Staging deployment tested
□ Database backup created
□ Migration plan documented
□ Rollback plan prepared
□ Monitoring alerts configured
□ Performance tested (load testing)
□ Security scan passed
□ Documentation updated
```


***

## 11. AI-Specific Instructions

### 11.1 When Generating Code

**✅ Always include:**

1. Type definitions (TypeScript interfaces/types)
2. Error handling (try-catch blocks)
3. Input validation (DTOs, Zod schemas)
4. JSDoc comments (parameters, returns, examples)
5. Unit tests

**Structure:**

- File header comment explaining purpose
- Imports organized (external → internal)
- Type definitions before implementation
- Main implementation with error handling
- Export statements


### 11.2 When Fixing Bugs

**✅ Follow this process:**

1. **Reproduce:** Understand and reproduce the bug
2. **Test:** Write failing test case
3. **Fix:** Implement fix
4. **Verify:** Ensure test passes
5. **Check:** Look for similar bugs elsewhere

**Documentation:**

- Comment explaining what caused the bug
- Comment explaining the fix
- Update relevant documentation


### 11.3 When Refactoring

**✅ Refactoring checklist:**

```
□ Tests pass before refactoring
□ Make small, incremental changes
□ Tests pass after each change
□ Code is more readable
□ Performance is same or better
□ No new bugs introduced
□ Commit after each successful step
□ Update documentation
```

**Safe refactoring steps:**

1. Ensure test coverage exists
2. Refactor one function/class at a time
3. Run tests after each change
4. Commit when tests pass
5. Continue to next refactor

### 11.4 When Writing Tests

**Test structure:**

- **Arrange:** Set up test data and mocks
- **Act:** Execute the code under test
- **Assert:** Verify expected results

**Test naming:**

- Use descriptive names: `should return cards when valid query provided`
- Group related tests in `describe` blocks
- Use `it` for individual test cases

**Test coverage:**

- Happy path (success case)
- Error cases (invalid input, not found, etc.)
- Edge cases (empty arrays, null values, etc.)
- Boundary conditions (min/max values)

***

## 12. Quick Reference

### 12.1 Command Reference

**Development:**

```bash
pnpm install                    # Install dependencies
pnpm run dev                    # Start all apps
pnpm run dev --filter=api      # Start specific app
pnpm run build                 # Build all apps
pnpm run test                  # Run all tests
pnpm run test:watch            # Run tests in watch mode
```

**Database:**

```bash
npx prisma generate            # Generate Prisma client
npx prisma migrate dev         # Create and apply migration
npx prisma migrate deploy      # Apply migrations (prod)
npx prisma studio              # Open database GUI
npx prisma db seed             # Seed database
```

**Code Quality:**

```bash
pnpm run lint                  # Check linting
pnpm run lint:fix              # Fix linting issues
pnpm run format                # Format code
pnpm run type-check            # Check TypeScript
```


### 12.2 Port Reference

| Application | Port | Description |
| :-- | :-- | :-- |
| Admin GUI | 3332 | Admin interface |
| Private GUI | 3333 | Local single-user app |
| Public GUI | 3334 | Multi-user web app |
| NestJS API | 4000 | Backend REST API |
| PostgreSQL | 5432 | Production database |
| Redis | 6379 | Cache and sessions |

### 12.3 Environment Variables

**Required for API:**

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - JWT signing secret
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth client secret

**Required for GUIs:**

- `NEXT_PUBLIC_API_URL` - API base URL
- `NEXTAUTH_URL` - NextAuth callback URL
- `NEXTAUTH_SECRET` - NextAuth signing secret


### 12.4 Web Card ID Prefixes

| Prefix | Region | Source |
| :-- | :-- | :-- |
| `hk` | Hong Kong (ZH) | asia.pokemon-card.com/hk/ |
| `hken` | Hong Kong (EN) | asia.pokemon-card.com/hk-en/ |
| `jp` | Japan | www.pokemon-card.com/ |
| `en` | International | pokemontcg.io API |
| `tw` | Taiwan | asia.pokemon-card.com/tw/ |


***

## 13. Critical Reminders

### 13.1 Database

- ✅ Always use multi-language architecture (primary_cards + cards)
- ✅ Always use expansion mapping (primary_expansions + regional_expansions)
- ✅ Always use upsert, never raw insert
- ✅ Always add indexes to queried fields
- ✅ Always use foreign key constraints with onDelete


### 13.2 API

- ✅ Always validate input with DTOs
- ✅ Always implement rate limiting
- ✅ Always use pagination
- ✅ Always cache frequently accessed data
- ✅ Always implement proper error handling


### 13.3 Frontend

- ✅ Always use React Query for data fetching
- ✅ Always show loading and error states
- ✅ Always use virtual scrolling for large lists
- ✅ Always optimize images with Next.js Image
- ✅ Always implement responsive design


### 13.4 Security

- ✅ Always validate and sanitize user input
- ✅ Always check authorization on protected endpoints
- ✅ Always use environment variables for secrets
- ✅ Always use HTTPS in production
- ✅ Always implement CSRF protection


### 13.5 Testing

- ✅ Always write tests before implementation (TDD)
- ✅ Always maintain >70% code coverage
- ✅ Always test error cases, not just happy path
- ✅ Always run tests before committing
- ✅ Always write E2E tests for critical flows

***

**END OF GUIDELINE**
<span style="display:none">[^1]</span>

<div align="center">⁂</div>

[^1]: provide-FRD-markdown-for-edit.md

