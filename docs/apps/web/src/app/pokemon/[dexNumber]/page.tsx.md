# page.tsx — Documentation

**Source file:** `apps/web/src/app/pokemon/[dexNumber]/page.tsx`
**Last modified:** `2026-05-12 18:32`
**MD5:** `beaef5b15dc40e0add596e22971d3207`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

Pokemon species detail page (`/pokemon/[dexNumber]`). Shows all card variants for a given Pokédex number, grouped by `primaryCardId`. Supports multi-language deduplicated card display, rarity/regulation filters, sort controls, image size toggle, skill tooltips on hover, and drag-and-drop merging of `PrimaryCard` records.

---

## Usage

```
Navigate to: /pokemon/0025          → Pikachu
Navigate to: /pokemon/0006?form=... → Specific form variant
```

---

## Key Interfaces

```typescript
interface CardItem {
  id: string; webCardId: string; name: string; imageUrl: string | null;
  rarity: string | null; types: string[] | null; hp: number | null;
  language: string; variantType: string; evolutionStage: string | null;
  primaryCardId?: string | null;
  regulationMark?: string | null;
  attacks?: Array<{ name?:string; cost?:string[]; damage?:string; effect?:string; text?:string }> | null;
  abilities?: Array<{ name?:string; text?:string; description?:string }> | null;
  primaryCard?: { id?:string|null; cardNumber?:string|null; skillsSignature?:string|null;
    primaryExpansion?: { code:string; nameEn:string; releaseDate?:string|null } | null; };
  regionalExpansion?: { code:string; name:string; region:string;
    primaryExpansion?: { code:string; nameEn:string; releaseDate?:string|null }; } | null;
}

interface PrimaryCardGroup {
  key: string;              // primaryCardId, or webCardId if no primaryCard
  cards: CardItem[];        // all language/variant cards in this group
  displayName: string;
  hp: number | null;
  types: string[] | null;
  expCode: string | null;
  cardNumber: string | null;
  releaseDate: string | null;
  skillsSignature: string | null;
  regulationMark: string | null;
}
```

---

## Step-by-Step Logic

### 1. Species Resolution
- Queries `/cards/species-summary` (shared React Query cache with the list page).
- Matches by `dexNumber` + optional `form` query param.

### 2. Evolution Chain
- Built from the same `speciesList` via `buildChainFor()` utility.
- Displayed inline in the right half of the header when `evolutionChain.length > 1`.

### 3. Card Fetching
Three parallel `useQuery` calls — ZH name, EN name, JA name — each with:
- `supertype: POKEMON`, `take: 100`, `sortBy: webCardId desc`
- `excludeNames` filter to prevent neighbour-name bleeding (built by `buildSimilarNames` heuristic)

### 4. Deduplication & `allCards`
- `seen` Set dedups by `webCardId`.
- `nameMatches()` validates each card name against canonical names (ZH/EN/JA), handles Mega markers, ex suffixes, etc.
- Final sort: language order (ZH→EN→JA) then `webCardId` desc.

### 5. Filters
State:
- `rarityFilter` — exact `rarity` enum match
- `regulationFilter` — exact `regulationMark` match (options: J–A)

Both applied in `filteredCards` useMemo.

### 6. Grouping (`cardsByPrimaryCard`)
- Groups `filteredCards` by `primaryCardId ?? webCardId`.
- Representative card: first `ZH_TW` card, else first.
- `regulationMark` taken from representative card.

### 7. Sort
State: `sortBy` (`'regulation'` default) + `sortDesc` (true default).
| Value | Sort key |
|-------|---------|
| `release` | `releaseDate` (date parse) |
| `regulation` | `regulationMark` (string, A–J) |
| `hp` | `hp` (number) |

Secondary sort always: `expCode` alphabetical.

### 8. Image Size Toggle
State: `imgSize` (`'S' | 'M' | 'L'`, default `'M'`).
| Size | Width |
|------|-------|
| S | 83 px |
| M | 114 px |
| L | 156 px |

### 9. Header Layout
Single `bg-white` card with flex row:
- **Left**: compact portrait (64×88 px) + dex#, name, multilingual names, card counts.
- **Divider + Right** (only when evolution chain exists): `進化鏈` label + `ChainThumb` row.

### 10. Skill Tooltip
`onMouseMove` on each card thumbnail → sets `{ card, x, y }` state → fixed overlay shows abilities (purple) and attacks (yellow/red).

### 11. Drag-and-Drop Merge
- Drag a group's `⠿` handle → sets `dragSource` (the group's `key`).
- Drop onto another group → `setPendingMerge({ sourceId, targetId })`.
- Confirmation dialog → `POST /cards/primary-cards/merge`.
- On success: `window.location.reload()`.

---

## Key Design Decisions

- **`regulationMark` on `CardItem`**: Added to interface; extracted from API response. The group uses the representative card's mark (ZH_TW preferred).
- **Default sort = regulation descending**: Newest mark (J) appears first, matching the current Standard format priority.
- **Image sizes +30% vs previous session**: S=83, M=114, L=156 (previously 64/88/120).
- **Header compaction**: Portrait shrunk from 96×128 to 64×88. Evolution chain moved from a separate block into the header's right half to save vertical space.
- **No separate evolution chain block**: Removed in favour of inline right-half display.

---

## Related Files

- `apps/web/src/app/pokemon/page.tsx` — species list (shares `species-summary` query cache)
- `apps/api/src/cards/cards.controller.ts` — `POST /cards/primary-cards/merge`
- `apps/api/src/cards/cards.service.ts` — `mergePrimaryCards()`
