# page.tsx — Documentation

**Source file:** `apps/web/src/app/admin/scraper-jobs/page.tsx`
**Last modified:** `2026-04-23 01:08`
**MD5:** `9B6017C26C2660AEB20BB9C06B8B0105`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

The Scraper Admin page (`/admin/scraper-jobs`). A comprehensive admin dashboard for triggering, monitoring, and managing all background scraper and data-processing jobs. Provides tabbed access to event scraping, card scraping, card importing, and maintenance tasks.

---

## Usage

```
Navigate to: /admin/scraper-jobs
```

---

## Tabs

| Tab Key | Label | Content |
|---------|-------|---------|
| `events` | Events | Trigger JP/HK/EN event scrapers |
| `cards` | Cards | Trigger JP/HK/EN card scrapers, file verification |
| `import` | Import | Trigger card import jobs (from scraped JSON to DB) |
| `maintenance` | Maintenance | Utility tasks: remap decks, remove duplicates, effect tags, etc. |

Active tab controlled by `activeTab` state (default: `'events'`).

---

## Job Types (`JOB_TYPE_LABELS`)

| Job Source | Display |
|------------|---------|
| `JP` | 🇯🇵 Japan Events |
| `HK` | 🇭🇰 HK Events |
| `EN` | 🇺🇸 EN Events |
| `JP_CARDS` | 🇯🇵 JP Cards |
| `HK_CARDS` | 🇭🇰 HK Cards |
| `EN_CARDS` | 🇺🇸 EN Cards |
| `CARD_IMPORT` | 📦 Card Import |
| `MARKET_PRICES` | 💰 Market Prices |
| `SEED_TOURNAMENTS` | 🌱 Seed Tournaments |
| `RESYNC_DECKS` | 🔄 Resync Decks |
| `REMAP_DECKS` | 🗺️ Remap Decks |
| `REMOVE_DUPLICATES` | 🧹 Remove Dupes |
| `PROMO_RARITY` | 🎫 Promo Rarity |
| `POPULATE_EFFECTS` | 🏷️ Effect Tags |
| `POKEMON_SPECIES` | 🔢 Pokédex Import |
| `MAP_HK_TO_JP` | 🔗 Map HK→JP |

---

## Job Status Colours

| Status | CSS |
|--------|-----|
| `PENDING` | `bg-yellow-100 text-yellow-700` |
| `RUNNING` | `bg-blue-100 text-blue-700 animate-pulse` |
| `SUCCESS` | `bg-green-100 text-green-700` |
| `FAILED` | `bg-red-100 text-red-700` |

---

## Step-by-Step Logic

### 1. Job List Fetching

React Query polls `GET /scraper-jobs?take=50` to show recently created/running jobs.  
Uses `refetchInterval` when any job has status `RUNNING` (auto-polls every few seconds).

### 2. Triggering a Job

Each trigger button calls `POST /scraper-jobs` with `{ source: JOB_TYPE }`.  
On success, invalidates `['scraper-jobs']` query to show the new job immediately.

### 3. Log Streaming (`LogEntry[]`)

Clicking a job row expands its log panel.  
Calls `GET /scraper-jobs/{id}/logs` (or the `logs` field if embedded in job response).  
Each `LogEntry` has `{ ts: string; line: string }` — rendered as a timestamped terminal-style log.

### 4. Cards Tab — File Verification

After a card scrape completes, a **Verify** action checks that expected output JSON files exist in the correct data directory.

- Calls `POST /scraper-jobs/verify-files` with file info → returns `FileVerifyResult[]`
- Each result shows: filename, existence, card count, file size
- If verified, a **Move** action copies files to the permanent `data/cards/{region}/` directory

`FollowUpState` tracks the verification/move in-progress and result states per job.

### 5. Missing Effects Panel (`MissingEffectsPanel`)

Embedded in the `events` tab (collapsible). Queries `GET /cards/admin/missing-effects` (stale 60 s) and shows:
- Total primary cards
- How many have effect tags
- Count missing (badge with warning icon)
- Per-tier breakdown using `TIER_COLORS`

Has a "Run Job" button that triggers the `POPULATE_EFFECTS` job.

---

## `ScraperJob` Interface

```typescript
interface ScraperJob {
  id: string;
  source: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt?: string;
  completedAt?: string;
  successCount: number;
  failureCount: number;
  createdAt: string;
  logs?: Array<{ ts: string; line: string }>;
}
```

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/scraper-jobs?take=50` | Recent job list |
| `POST` | `/scraper-jobs` | Trigger new job |
| `GET` | `/scraper-jobs/{id}/logs` | Fetch job log entries |
| `POST` | `/scraper-jobs/verify-files` | Verify scraper output files |
| `POST` | `/scraper-jobs/move-files` | Move verified files to data dir |
| `GET` | `/cards/admin/missing-effects` | Stats on cards missing effect tags |

---

## Tier Colour Map (Effect Tag Review)

| Tier | CSS |
|------|-----|
| `S+` | `bg-yellow-400 text-yellow-900` |
| `S` | `bg-yellow-300 text-yellow-900` |
| `A+` | `bg-green-500 text-white` |
| `A` | `bg-green-400 text-white` |
| `B+` | `bg-blue-500 text-white` |
| `B` | `bg-blue-400 text-white` |
| `C+` | `bg-gray-400 text-white` |
| `C` | `bg-gray-300 text-gray-700` |
| `D` | `bg-gray-200 text-gray-500` |

---

## Key Design Decisions

- **Auto-poll on RUNNING** — Prevents manual refreshing; the page updates automatically while any job is active.
- **`BASE_URL` env var** — Uses `NEXT_PUBLIC_API_URL` with fallback to `/api/v1` for streaming/SSE log endpoints that bypass `apiClient`.
- **File verify → move flow** — Two-step safety: verify files exist and have expected card counts before moving them to the permanent data directory.
- **Collapsible Missing Effects Panel** — Surfaced prominently in the events tab to prompt admins to run the effect tag population job after importing new cards.

---

## Related Files

- `apps/api/src/scraper-jobs/scraper-jobs.service.ts` — Job creation and status tracking
- `docs/scrapers/import-cards-direct.ts.md` — Direct card import logic
- `docs/scrapers/map-hk-to-jp.ts.md` — HK→JP mapping job
- `docs/scrapers/fix-effect-tags-manual.ts.md` — Effect tag maintenance
