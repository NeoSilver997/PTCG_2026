# filter-panel.tsx — Documentation

**Source file:** `apps/web/src/components/filter-panel.tsx`
**Last modified:** `2026-05-19 07:14`
**MD5:** `316DF0FA91B0814E8F56617EA2679A74`
**Summarised by model:** `GPT-5.3-Codex`

This component renders the cards search/filter UI and emits a full filter object back to the parent via `onFilterChange`.

## Props

| Prop | Type | Description |
|---|---|---|
| `filters` | object | Current full filter state from the parent page. |
| `onFilterChange` | function | Callback that receives the next full filter object. |
| `stats` | object \/ null | Optional quick-chip stats (`byLanguage`, `bySupertype`, `total`, `byExpansion`). |

## Current Filter Layout

Main row (always visible):

- Sort key / sort order
- 次類型 (moved to main row)
- 屬性
- 稀有度
- Tier (replaces the old language dropdown)

Top quick chips:

- Language quick chips (toggle `filters.language`)
- Supertype quick chips (toggle `filters.supertype`)

Advanced row (expandable):

- Web card ID, variant type, artist
- Pokemon-only fields: `minHp`, `maxHp`, `minDamage`, `hasAbilities`, `hasAttackText`, `weakness`, `resistance`
- Effect tag and free-text ability/attack search

## Key Logic

1. Single-source updates
- `updateFilter(key, value)` clones `filters` and updates one field.
- Most controls call `updateFilter`; some actions call `onFilterChange` directly when multiple fields are changed together.

2. Non-Pokemon safeguard
- `isNonPokemon` is true when `supertype` is `TRAINER` or `ENERGY`.
- A `useEffect` automatically clears Pokemon-only fields when non-Pokemon supertype is active.

3. Reset behavior
- `resetToDefaults()` restores default regulation marks (`H,I,J`) and clears other filters.
- `clearAllFilters()` clears all filters including regulation mark.

4. Expansion and regulation mark chips
- Supports multi-select quick chips with explicit clear actions.
- Supports missing regulation mark token (`__MISSING__`).

## Recent Changes (May 2026)

- Added `minDamage` UI input under Pokemon-only advanced filters.
- Moved 次類型 from advanced section to main row.
- Removed duplicate 次類型 in advanced section.
- Replaced main-row language dropdown with Tier selector.

## Related Files

- `apps/web/src/app/cards/page.tsx` (stores filter state, persists to localStorage, builds query string)
- `apps/api/src/cards/dto/find-all-cards.dto.ts` (`minDamage` query param DTO)
- `apps/api/src/cards/cards.service.ts` (backend filter execution)
