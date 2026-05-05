# page.tsx — Documentation

**Source file:** `apps/web/src/app/tournaments/page.tsx`
**Last modified:** `2026-03-23 14:36`
**MD5:** `B349B79034142B66526625A4D93EFB93`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

The tournament listing page (`/tournaments`). Displays all scraped tournament events with filtering, sorting, pagination, a top-card usage trend panel, and a link to the player leaderboard.

---

## Usage

```
Navigate to: /tournaments
```

---

## Step-by-Step Logic

### 1. Filter State

| State | Type | Default | Notes |
|-------|------|---------|-------|
| `region` | `''│'HK'│'JP'│'EN'` | `''` | Region selector |
| `type` | `TOURNAMENT_TYPE │ ''` | `''` | Tournament type selector |
| `searchInput` | `string` | `''` | Controlled text input (debounced) |
| `search` | `string` | `''` | Debounced search value sent to API |
| `dateFrom` / `dateTo` | `string` | `''` | Date range inputs |
| `sortBy` | `string` | `'date'` | |
| `sortOrder` | `string` | `'desc'` | |
| `page` | `number` | `0` | Pagination offset |

**Debounce:** `searchInput` → `search` transition uses a 300 ms `setTimeout` ref-based debounce.

### 2. Data Fetching

Two React Query queries:

| Query | Endpoint | Purpose |
|-------|----------|---------|
| `['tournaments', ...]` | `GET /tournaments` | Paginated event list |
| `['tournaments-top-cards-by-category', region]` | Client-computed | Card usage trend data |

The tournament list query passes all active filters as `params` to `apiClient.get`.  
Page size (`take`) is 30. `skip` = `page * take`.

### 3. Top Cards by Category (`buildTopCardsByCategory`)

Built client-side from tournament deck data:
1. Fetches recent tournament details + their decks.
2. Aggregates card usage counts split into categories: `pokemon`, `trainer`, `item`, `stadium`, `tools`.
3. Splits results into `current` (last N weeks) vs `previous` period for trend comparison.
4. Rendered by `<CardUsageTrendSection>` component.

### 4. Tournament List Rendering

Each `Tournament` item shows:
- Region badge (coloured by `REGION_COLORS`)
- Type icon + label (from `TYPE_ICONS` / `TYPE_LABELS`)
- Date, location, player count
- Result count badge (`_count.results`)
- Clickable link to `/tournaments/[eventId]`

### 5. Pagination

Previous/next buttons rendered when `totalPages > 1`. Page resets to 0 whenever a filter changes.

### 6. Filter Reset

`clearAll()` resets all filter state back to defaults.

---

## Tournament Types

| Enum | Label |
|------|-------|
| `CHAMPIONSHIP` | Championship |
| `REGIONAL` | Regional |
| `SPECIAL_EVENT` | Special Event |
| `STORE_TOURNAMENT` | Store Tournament |
| `ONLINE_EVENT` | Online Event |

---

## Region Colours

| Region | CSS |
|--------|-----|
| `HK` | `bg-red-100 text-red-700` |
| `JP` | `bg-blue-100 text-blue-700` |
| `EN` | `bg-green-100 text-green-700` |

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/tournaments` | Paginated tournament list with filters |

---

## Key Design Decisions

- **Debounced search** — 300 ms delay prevents API calls on every keystroke.
- **Client-side top-card computation** — Card usage trends are derived from raw tournament/deck data rather than a dedicated API endpoint, keeping backend complexity low.
- **Region-scoped top cards** — The top card panel refetches when the `region` filter changes, scoping usage stats to the selected region.

---

## Related Files

- `apps/web/src/app/tournaments/[eventId]/page.tsx` — Tournament detail view
- `apps/web/src/app/tournaments/leaderboard/page.tsx` — Player leaderboard
- `apps/api/src/tournaments/tournaments.service.ts` — Tournament query logic
