# page.tsx — Documentation

**Source file:** `apps/web/src/app/deck-builder/event/[deckCode]/page.tsx`
**Last modified:** `2026-04-23 08:18`
**MD5:** `F8167D4E906673E09DC2779EBF1480C7`
**Summarised by model:** `Claude Sonnet 4.6`

Next.js client component that displays a single tournament deck. Fetches the deck from the API, merges DB card data with raw `deckData` fallback entries, groups cards into labelled sections, supports per-card role overrides, and persists the computed archetype name.

---

## Usage

Route: `/deck-builder/event/[deckCode]`

The `deckCode` URL segment is the raw deck ID scraped from the tournament source (e.g. `NZ5QCR`). The component is a `'use client'` React component exported as default from this file, wrapped in `<Suspense>` by the outer `DeckViewPage` shell.

---

## How It Works — Step by Step

### Step 1 — Data Fetching (three queries in parallel)

| Query key | Endpoint | Purpose |
|-----------|----------|---------|
| `deck-by-code` | `GET /decks/code/{deckCode}` | Full deck: cards, deckData, pricing, tournament results |
| `deck-roles` | `GET /decks/code/{deckCode}/roles` | Deck-specific Pokémon role overrides |
| `global-roles` | `GET /decks/roles/lookup?cards=id1,id2,...` | Cross-deck presets (fills unset cards) |

**Deck fetch fallback:** If the API call fails, falls back to `/deck-code-map.json` (a static JSON file) to look up the deck's internal `id`, then fetches by `GET /decks/{id}`.

### Step 2 — Role Priority Chain

Each Pokémon card is assigned a `PokemonRole` that determines which section it appears in. The chain is:

```
deck-specific DB role  (highest)
        ↓
cross-deck global role
        ↓
auto-derived from getSectionKey(entry)  (fallback)
```

Roles are stored in three places:
1. **DB** (`/decks/code/{deckCode}/roles`) — persisted, shared across browsers
2. **`localStorage`** (key: `ptcg:pokemon-roles:{deckCode}`) — instant rendering on page load before DB response arrives
3. **React state** (`localRoles: Map<string, PokemonRole>`) — in-memory during the session

**Role key** — always `primaryCardId ?? canonicalWebCardId ?? webCardId` (never bare `webCardId`).

**DB ↔ UI role mapping:**

| DB enum | UI role |
|---------|---------|
| `POKEMON_MAIN` | `pokemon-main` |
| `POKEMON_SECONDARY` | `pokemon-secondary` |
| `POKEMON_SUPPORT` | `pokemon-support` |
| `POKEMON_EVOLUTION` | `pokemon-evolution` |

### Step 3 — Role Sync Effects

Two `useEffect` hooks keep `localRoles` in sync:

1. **Deck-specific sync** (runs when `dbRoles` arrives): merges DB roles into local state — DB wins per card.
2. **Global preset sync** (runs when `globalRoles` arrives): applies cross-deck defaults only for cards that have **no** deck-specific DB role.

`handleRemapRoles()` — called by the "Remap" button — clears `localRoles` and re-seeds from scratch using DB then global roles, also updating `localStorage`.

### Step 4 — DB Cards + deckData Merge

The deck response may contain:
- `data.cards` — full `DeckCardEntry` objects joined from the DB (have HP, attacks, subtypes, etc.)
- `data.deckData` — raw scraper import entries with only `{ cardId, cardName, quantity, imageUrl }`

**Merge rule:** use DB cards as the primary list; append `deckData` entries only when they are not already represented — checked by both **normalised webCardId** and **card name**:

```
normalizeId("jp48778")    → "48778"
normalizeId("hk00014744") → "14744"   (strips leading letters + zeros)
```

A `deckData` entry is included only when neither its normalised ID nor its trimmed lowercase name matches any DB card.

**Supertype inference** (deckData entries only, from `imageUrl` suffix):

| URL substring | Supertype |
|--------------|-----------|
| `_P_` | `POKEMON` |
| `_E_` | `ENERGY` |
| `_T_` | `TRAINER` |

**ACE SPEC inference** (deckData entries only):  
A card is flagged `ACE_SPEC_RARE` if `cardCode` contains `"ACE SPEC"` or `cardName` matches a hard-coded set of known ACE SPEC JP names.

### Step 5 — Section Grouping

Cards are grouped into `SectionKey` buckets using `getSectionKey(entry)` as the auto-derived key, overridden by `localRoles` when set:

```
pokemon-main | pokemon-secondary | pokemon-support | pokemon-evolution
ace | supporter | stadium | item | tool | basic-energy | special-energy
```

Display order is defined by `SECTION_ORDER` (imported from `@/components/deck-view`).

### Step 6 — Archetype Name Derivation

Computed entirely client-side from the `pokemon-main` and `pokemon-support` sections:

1. Start with `pokemon-main` entries.
2. **Filter out lower evolution stages** — walk the `evolvesTo` chain; exclude any Pokémon whose evolution is also in the main section.
3. Map each remaining entry to `card.zhName ?? card.name` (prefer Chinese display name).
4. Deduplicate and take the first 2 names.
5. Append up to 1 draw-engine support Pokémon (name contains one of the known JP draw-engine strings).
6. Join with ` + `.

**Known draw-engine Pokémon (excluded from main archetype name):**
`リーリエのピッピex`, `ノコッチex`, `ゲノセクトex`, `フーディン`

**ACE SPEC name:** taken from the first entry in the `ace` section (`card.zhName ?? card.name`).

### Step 7 — Persist Archetype to DB

A `useEffect` (with `useRef` guard to fire only once per page load) calls:

```
PATCH /decks/code/{deckCode}/meta
{ archetypeName: "...", aceName: "..." }
```

This is fire-and-forget — errors are silently swallowed as it is non-critical display metadata.

---

## Component Map

| Component | Source | Purpose |
|-----------|--------|---------|
| `DeckSection` | `@/components/deck-view` | Renders a single labelled card section |
| `PairedSection` | `@/components/deck-view` | Paired trainer/energy layout |
| `PairedPokemonSection` | `@/components/deck-view` | Paired Pokémon section layout |
| `DeckSummary` | `@/components/deck-view` | Header: archetype name, price, tournament info |
| `CardDetailModal` | `@/components/deck-view` | Full card detail overlay |
| `CopyDeckModal` | `@/components/deck-view` | Export deck code modal |
| `EffectsSummary` | `@/components/deck-view` | Effects tag summary panel |
| `WeaknessSummary` | `@/components/deck-view` | Weakness chart panel |
| `EffectTagSummary` | `@/components/deck-view` | Tag-based effect breakdown |

---

## API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/decks/code/{deckCode}` | Fetch deck with cards + pricing |
| `GET` | `/decks/code/{deckCode}/roles` | Deck-specific Pokémon role overrides |
| `PUT` | `/decks/code/{deckCode}/roles/{cardId}` | Upsert a single card's role |
| `GET` | `/decks/roles/lookup?cards=id1,id2,...` | Cross-deck role lookup by `primaryCardId` |
| `PATCH` | `/decks/code/{deckCode}/meta` | Persist computed archetype + ACE name |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `localStorage` seeded on init | Prevents flash of unsorted cards while DB query is in-flight |
| DB role wins over global preset | Deck-specific manual override must not be clobbered by cross-deck defaults |
| `primaryCardId` as role key (not `webCardId`) | The same Pokémon can appear under multiple `webCardId`s (HK/JP variants); the primary key is stable across variants |
| `normalizeId` for deckData dedup | Avoids double-rendering cards that exist in DB under `jp12345` but appear in deckData as `"12345"` |
| Evolution-aware archetype filter | Prevents e.g. "Charmander + Charizard ex" when only "Charizard ex" should appear in the name |
| `cachedWritten` ref guard | Ensures the `PATCH /meta` call fires exactly once, not on every re-render triggered by role sync |

---

## Related Files

| File | Purpose |
|------|---------|
| `apps/web/src/components/deck-view/` | All sub-components rendered by this page |
| `apps/web/src/app/deck-builder/event/[deckCode]/prices/page.tsx` | Price breakdown sub-route |
| `apps/api/src/decks/decks.service.ts` | API service backing all deck endpoints |
| `docs/archetype-naming-logic.md` | Deeper explanation of archetype name derivation rules |
