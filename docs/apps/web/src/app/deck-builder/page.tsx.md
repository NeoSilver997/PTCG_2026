# page.tsx — Documentation

**Source file:** `apps/web/src/app/deck-builder/page.tsx`
**Last modified:** `2026-04-20 23:44`
**MD5:** `1654177B1E8635F7025573E72FFA956C`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

The deck builder page (`/deck-builder`). A dual-mode page that supports:
1. **View mode** — Read-only deck display using shared `deck-view` components.
2. **Edit mode** — Full CRUD deck editor with card search, add/remove, and save.

---

## Usage

```
Navigate to: /deck-builder                     # New deck (edit mode)
Navigate to: /deck-builder?deckId=<id>         # Edit existing deck
Navigate to: /deck-builder?deckId=<id>&mode=view  # Read-only view
Navigate to: /deck-builder/archetypes          # Browse deck archetypes
```

---

## Mode Switching

`useSearchParams()` reads `deckId` and `mode` on mount.

| `deckId` | `mode` | Rendered component |
|----------|--------|--------------------|
| absent | any | `DeckBuilderInner` (new deck) |
| present | `'view'` | `DeckViewMode` |
| present | absent/other | `DeckBuilderInner` (edit existing) |

---

## View Mode (`DeckViewMode`)

Uses the shared [deck-view](../../../../components/deck-view) component suite:

| Component | Purpose |
|-----------|---------|
| `DeckSection` | Renders a single categorised section of cards |
| `PairedSection` | Two sections side-by-side (e.g. Supporter + Stadium) |
| `DeckSummary` | Card count breakdown header |
| `CardDetailModal` | Click-to-expand card detail |
| `CopyDeckModal` | Export deck list to clipboard |

**Section layout order:**
1. `pokemon-main` (主攻)
2. `pokemon-secondary` (副攻)
3. `pokemon-support` (輔助)
4. `ace` (ACE SPEC)
5. `supporter` + `stadium` (paired)
6. `item` + `tool` (paired)
7. `basic-energy` + `special-energy` (paired)

Entries are classified into sections via `getSectionKey(entry)` from `@/components/deck-view`.

---

## Edit Mode (`DeckBuilderInner`)

### State

| State | Type | Notes |
|-------|------|-------|
| `deck` | `Deck \| null` | Loaded deck data |
| `cardSearch` | `string` | Card search input |
| `searchSupertype` | `string` | Supertype filter for card search |
| `searchResults` | `Card[]` | API search results |
| `selectedArchetype` | `string` | One of `ARCHETYPES` |
| `deckName` | `string` | Deck name input |
| `deckDescription` | `string` | Optional description |

### Card Search

Searches `GET /cards?name=...&supertype=...&take=20` via debounced React Query. Results show in a scrollable list below the search input; clicking a result calls `addCard(cardId)`.

### Add / Remove / Qty

- `addCard(cardId)` — PATCH `/decks/{id}/cards` (upsert quantity +1)
- `removeCard(cardId)` — DELETE `/decks/{id}/cards/{cardId}`
- `updateQty(cardId, qty)` — PATCH `/decks/{id}/cards` with explicit quantity

### Save / Create

- **New deck** — POST `/decks` with `{ name, archetype, description }`
- **Update** — PATCH `/decks/{id}` with changed fields

### Validation Display

The deck card count is shown as `N/60`. Cards are flagged if the deck would exceed 4 copies (enforced server-side; UI shows count per card).

---

## Archetype Values

`AGGRO | CONTROL | COMBO | MIDRANGE | TOOLBOX | OTHER`

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/decks/{id}` | Load deck with cards |
| `POST` | `/decks` | Create new deck |
| `PATCH` | `/decks/{id}` | Update deck metadata |
| `PATCH` | `/decks/{id}/cards` | Add/update card quantity |
| `DELETE` | `/decks/{id}/cards/{cardId}` | Remove card from deck |
| `GET` | `/cards?name=...` | Card search for add panel |

---

## Key Design Decisions

- **Dual-mode routing** — `?mode=view` enables sharing read-only deck links without a separate route.
- **Shared `deck-view` components** — View mode and the event deck page (`/deck-builder/event/[deckCode]`) reuse the same section/summary components for visual consistency.
- **Archetypes link** — A `← Archetypes` back-link in view mode routes to `/deck-builder/archetypes` for browsing archetype templates.

---

## Related Files

- [deck-builder/event/[deckCode]/page.tsx.md](event/[deckCode]/page.tsx.md) — Tournament event deck view (full role assignment logic)
- `apps/web/src/components/deck-view/` — Shared deck display components
- `apps/web/src/app/deck-builder/archetypes/page.tsx` — Archetype browser
- `apps/api/src/decks/decks.service.ts` — Deck CRUD service
