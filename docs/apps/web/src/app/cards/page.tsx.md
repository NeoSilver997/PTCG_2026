# page.tsx — Documentation

**Source file:** `apps/web/src/app/cards/page.tsx`
**Last modified:** `2026-05-02 21:59`
**MD5:** `0CFCF1664C8948159FC4040A4C2DD95E`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

The main card search and browsing page (`/cards`). Provides a rich filtering interface backed by React Query, with support for URL-based deep-linking, localStorage filter persistence, client-side duplicate hiding, and Markdown export.

---

## Usage

```
Navigate to: /cards
Navigate to: /cards?effectTag=DrawEngine
Navigate to: /cards?cardTier=S
```

---

## Step-by-Step Logic

### 1. Filter Initialisation (`getInitialFilters`)

On first render, filters are loaded from `localStorage` under the key `"cardFilters"`.
A `__version` field (currently `'7'`) acts as a schema guard — if the version mismatches the saved state is discarded and `DEFAULT_FILTERS` is used instead.

**DEFAULT_FILTERS:**

| Key | Default | Notes |
|-----|---------|-------|
| `name` | `''` | |
| `supertype` | `''` | |
| `types` | `''` | |
| `rarity` | `''` | |
| `language` | `''` | |
| `sortBy` | `'webCardId'` | |
| `sortOrder` | `'desc'` | |
| `webCardId` | `''` | |
| `subtypes` | `''` | |
| `variantType` | `''` | |
| `minHp` | `''` | |
| `maxHp` | `''` | |
| `artist` | `''` | |
| `regulationMark` | `'H,I,J'` | Standard-legal marks pre-selected |
| `expansionCode` | `''` | |
| `hasAbilities` | `''` | |
| `hasAttackText` | `''` | |
| `effectTag` | `''` | |
| `cardTier` | `''` | |
| `abilityText` | `''` | |
| `weakness` | `''` | |

### 2. URL Search Param Override

`useSearchParams()` extracts `effectTag` and `cardTier` on each render.  
A `useEffect` re-applies these values whenever the URL params change (supports client-side navigation), and clears `regulationMark` and `expansionCode` when `effectTag` is set.

### 3. Filter Persistence

`useEffect` writes `{ ...filters, __version: FILTER_VERSION }` to `localStorage` whenever `filters` changes.

### 4. Data Fetching

Two React Query queries run in parallel:

| Query | Key | Endpoint | Stale Time |
|-------|-----|----------|-----------|
| Card stats | `['card-stats']` | `GET /cards/stats` | 10 min |
| Card list | `['cards', filters, skip]` | `GET /cards?...` | (default) |

The card list query serialises all non-empty filter fields as URL query params plus `take=120` and `skip`.

### 5. Duplicate Hiding (client-side)

When `hideDuplicates` is toggled, the raw result array is de-duplicated by `primaryCardId` — keeping the first occurrence per sorted order. Cards without a `primaryCardId` are always shown.

### 6. Pagination

Page size is fixed at `TAKE = 120`. Previous/next buttons appear when `totalPages > 1`. Both header and footer pagination controls are rendered.

### 7. Markdown Export (`generateCardMarkdown`)

Builds a Markdown string with:
- Timestamp + active filter summary
- One `###` section per card with: ID, expansion, language, supertype, HP, types, artist, regulation mark, abilities, attacks, weaknesses/resistances, effect tags, card tier, and image URL
- A `---` separator between cards

The blob is downloaded as `ptcg-cards-<YYYY-MM-DD>.md`.

### 8. Card Detail Overlay

Clicking any card in `CardGrid` sets `selectedCard` and `showOverlay = true`, rendering `<CardDetailOverlay>` on top of the page. Closing it resets both state values.

---

## Key Components Used

| Component | Import | Role |
|-----------|--------|------|
| `FilterPanel` | `@/components/filter-panel` | Renders all filter inputs |
| `CardGrid` | `@/components/card-grid` | Card image grid |
| `CardDetailOverlay` | `@/components/card-detail-overlay` | Slide-in card detail |

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/cards?...` | Paginated filtered card list |
| `GET` | `/cards/stats` | Count breakdown by language/supertype/expansion |

---

## Key Design Decisions

- **`regulationMark: 'H,I,J'` as default** — Users land on Standard-legal cards immediately without configuring filters.
- **URL params win over localStorage** — Deep-linking to `/cards?effectTag=X` always overrides cached state.
- **`FILTER_VERSION`** — Prevents stale filter shapes from previous schema versions from breaking the UI silently.
- **Client-side deduplication** — Avoids an API round-trip; acceptable because the page already loads 120 cards at a time.

---

## Related Files

- [filter-panel.tsx](../../../components/filter-panel.tsx.md) — Filter input UI
- [card-grid.tsx](../../../components/card-grid.tsx) — Grid renderer
- [card-detail-overlay.tsx](../../../components/card-detail-overlay.tsx) — Overlay detail view
- [apps/api/src/cards/cards.service.ts](../../../../../api/src/cards/cards.service.ts) — API query logic
