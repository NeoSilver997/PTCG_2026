# page.tsx — Documentation

**Source file:** `apps/web/src/app/browse/page.tsx`
**Last modified:** `2026-04-12 20:40`
**MD5:** `E6ADC362D16FC9BB8F904D22E16FC46C`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

The visual card browser page (`/browse`). An immersive card gallery experience with an auto-hiding filter sidebar, multiple grid size modes, and card-only view toggle. Focuses on visual card browsing rather than detailed search.

---

## Usage

```
Navigate to: /browse
```

---

## Step-by-Step Logic

### 1. View Configuration State

| State | Type | Default | Notes |
|-------|------|---------|-------|
| `viewSize` | `'small'│'medium'│'large'` | `'small'` | Card grid density |
| `cardOnlyView` | `boolean` | `false` | Hide card metadata, show images only |
| `filtersVisible` | `boolean` | `true` | Auto-hide after 5 s of inactivity |
| `page` | `number` | `0` | Current page index |
| `allCards` | `BrowseCard[]` | `[]` | Accumulated cards (append-mode) |
| `filters` | `BrowseFilters` | `INITIAL_FILTERS` | Active filter values |

### 2. Auto-Hiding Filter Sidebar

A `useCallback` function `resetHideTimer` manages a 5-second `setTimeout`:
- Called on any user interaction (mouse movement, filter change)
- Sets `filtersVisible = true` and resets the 5 s countdown
- On timeout: `filtersVisible = false` (sidebar slides out)

This creates an immersive fullscreen browsing experience.

### 3. Filter State (`BrowseFilters`)

```typescript
interface BrowseFilters {
  name: string;
  supertype: string;
  types: string;
  rarity: string;
  language: string;
  expansionCode: string;
  regulationMark: string;
}
```

Unlike the `/cards` page, `/browse` starts with **no default `regulationMark`** — shows all cards across all formats.

### 4. Data Fetching

React Query: `GET /cards?...&skip=page*PAGE_SIZE&take=PAGE_SIZE` where `PAGE_SIZE = 60`.

**Append mode:** Results are appended to `allCards` rather than replaced, enabling an infinite-scroll-like experience when paging forward. Navigating to page 0 clears the accumulated list.

### 5. Grid Layout

Two layout modes × three size options = six grid configurations:

| Mode | Size | Grid columns |
|------|------|-------------|
| Normal | small | 2→3→4→5→6 (responsive) |
| Normal | medium | 1→2→3→4→5 |
| Normal | large | 1→2→2→3→3 |
| Card-Only | small | 3→4→6→8→10 |
| Card-Only | medium | 2→3→5→6→8 |
| Card-Only | large | 2→3→4→5→6 |

`cardOnlyView` hides name/rarity/type metadata and shows tighter grids, maximising card image density.

### 6. Rarity & Type Colour Maps

**Rarity badge colours** (`RARITY_COLORS`): each rarity has a background colour class (e.g. `HYPER_RARE → bg-red-500`).  
**Rarity short codes** (`RARITY_SHORT`): abbreviated labels (e.g. `SPECIAL_ILLUSTRATION_RARE → 'SAR'`).  
**Type badge colours** (`TYPE_COLORS`): per Pokémon type with appropriate contrast (e.g. `LIGHTNING → bg-yellow-400 text-gray-900`).

### 7. Navigation

Clicking a card navigates to `/cards/{webCardId}` via `useRouter().push`.

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/cards?...&skip=N&take=60` | Paginated card browse |

---

## Key Design Decisions

- **Auto-hiding sidebar (5 s)** — Gives maximum screen space to card images after a brief interaction pause.
- **Append-mode pagination** — Supports forward scrolling through large result sets without losing previously loaded cards.
- **No `regulationMark` default** — `/browse` is for exploration across all eras; `/cards` is the filtered search for competitive use.
- **`cardOnlyView`** — Maximises card density for collectors wanting to see many cards at once.

---

## Related Files

- `apps/web/src/app/cards/page.tsx.md` — Feature-rich search (compare: `/cards` vs `/browse`)
- `apps/api/src/cards/cards.service.ts` — Shared card query logic
