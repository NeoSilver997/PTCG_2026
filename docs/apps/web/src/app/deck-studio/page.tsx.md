# page.tsx — Documentation

**Source file:** `apps/web/src/app/deck-studio/page.tsx`
**Last modified:** `2026-03-21 00:56`
**MD5:** `5B0B43590F49D0023141963F00265F53`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

The Deck Studio page (`/deck-studio`). A personal deck library manager that lists all saved decks with search and archetype filtering, summary statistics, and direct links to edit or view each deck.

---

## Usage

```
Navigate to: /deck-studio
```

---

## Step-by-Step Logic

### 1. Data Fetching

Single React Query: `GET /decks?search=...&archetype=...&take=100`.  
All matching decks are fetched in one call (max 100). Filtering is server-side.

### 2. Stats Panel

Four stat tiles are computed from the fetched `decks` array:

| Tile | Value |
|------|-------|
| Total Decks | `meta.total` from API response |
| 60-Card Decks | Decks where `totalCards === 60` |
| In Progress | `total − validDecks` |
| + New Deck | Button linking to `/deck-builder` |

`totalCards` is compared against 60 to determine deck completeness (valid = tournament-ready).

### 3. Filters

| Control | State | Notes |
|---------|-------|-------|
| Text search | `search` | Live — re-queries on change |
| Archetype select | `selectedArchetype` | Options: `AGGRO CONTROL COMBO MIDRANGE TOOLBOX OTHER` |

Both trigger a React Query key invalidation which re-fetches from the API.

### 4. Deck Card Rendering

Each `Deck` renders a card showing:
- Name + archetype badge (coloured pill from `ARCHETYPE_COLORS`)
- Optional description (clamped to 2 lines)
- Card count `N/60` — **green** if exactly 60, **orange** otherwise
- Format and visibility (`Public` badge)
- Last updated date
- Action row: **View** → `/deck-builder?deckId={id}&mode=view`, **Edit** → `/deck-builder?deckId={id}`, **Delete**

### 5. Delete

`useMutation` calls `DELETE /decks/{id}`. On success, invalidates `['decks']` query to refresh the list.

---

## Archetype Colour Map

| Archetype | CSS |
|-----------|-----|
| `AGGRO` | `bg-red-100 text-red-700` |
| `CONTROL` | `bg-blue-100 text-blue-700` |
| `COMBO` | `bg-purple-100 text-purple-700` |
| `MIDRANGE` | `bg-yellow-100 text-yellow-700` |
| `TOOLBOX` | `bg-green-100 text-green-700` |
| `OTHER` | `bg-gray-100 text-gray-600` |

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/decks` | Fetch all decks (filtered) |
| `DELETE` | `/decks/{id}` | Delete a deck |

---

## Key Design Decisions

- **`take: 100` single page** — Deck Studio assumes a manageable personal collection; no pagination is implemented.
- **`totalCards` vs `_count.cards`** — The `_count` field counts `DeckCard` rows; `totalCards` is a computed sum of quantities. The UI prefers `totalCards` with fallback to `_count.cards`.
- **60-card threshold** — Directly reflects the tournament deck building rule; makes it immediately obvious which decks are competition-ready.

---

## Related Files

- `apps/web/src/app/deck-builder/page.tsx.md` — Deck editor (linked from all deck cards)
- `apps/api/src/decks/decks.service.ts` — Deck list query with optional filters
