# map-hk-to-jp.ts — Documentation

**Source file:** `scrapers/map-hk-to-jp.ts`
**Last modified:** `2026-05-12 18:32`
**MD5:** `4501AD233949D515DCE23A313D078437`
**Summarised by model:** `Claude Sonnet 4.6`

Maps Hong Kong (`ZH_TW`) cards in the database to their Japanese (`JA_JP`) counterparts by linking them to the same `PrimaryCard` record.

---

## Usage

```bash
# Dry-run (default) — report only, no DB changes
npx tsx scrapers/map-hk-to-jp.ts

# Apply changes (interactive confirmation)
npx tsx scrapers/map-hk-to-jp.ts --apply

# Apply without confirmation prompt
npx tsx scrapers/map-hk-to-jp.ts --apply --yes

# Apply only one partial-coverage expansion (e.g. M4)
npx tsx scrapers/map-hk-to-jp.ts --apply m4
```

---

## How It Works — Step by Step

### Step 1 — Load JSON Source Files

The script loads scraped card data from three locations, in priority order:

| Priority | Location | Prefix |
|----------|----------|--------|
| 1 (highest) | `data/cards/japan/` | `japanese_cards_40k_*` |
| 2 | `data/cards/japan/` | `japanese_cards_*` (non-40k) |
| 3 (fallback) | `.` (root) | `japanese_cards_*` |

HK cards are loaded from `data/cards/hongkong/` with prefix `hk_cards_*`.

Two normalisation helpers are applied at load time:
- `normalizeExpansion(code)` — uppercases all expansion codes (e.g. `sv9` → `SV9`)
- `normalizeCollector(coll)` — strips the denominator from collector numbers (e.g. `001/100` → `001`)

### Step 2 — Build JP Lookup Maps

Two in-memory `Map` structures index every JP card by:

| Map | Key format | Purpose |
|-----|-----------|---------|
| `jpLookup` | `EXPANSION:COLLECTOR:VARIANT` | Exact match including variant type |
| `jpLookupAny` | `EXPANSION:COLLECTOR` | Fallback match ignoring variant |

The first entry wins (40k files take priority over non-40k, non-40k over root).

### Step 3 — Query the Database

Both HK (`ZH_TW`) and JP (`JA_JP`) cards are fetched from the database in parallel using `Promise.all`. The selected fields cover:

- Identity fields: `id`, `webCardId`, `primaryCardId`, `variantType`
- Syncable fields: `rarity`, `regulationMark`, `subtypes`, `evolvesFrom`, `artist`, `ruleBox`
- Relation: `primaryCard → primaryExpansion.code`

### Step 4 — 100% Coverage Filter

Before attempting any match, the script calculates per-expansion match rates. An expansion is only eligible for linking if **every** HK card in that expansion has a corresponding JP card in the JSON sources. This prevents partial or incorrect mappings.

Two expansions are hard-coded as excluded regardless of apparent match rate:

| Code | Reason |
|------|--------|
| `SVK` | HK collector numbers are a subset of JP; would map incorrectly |
| `SVHK` | Same offset issue; handled by dedicated fix scripts |

### Step 5 — Per-Card Matching Loop

For each HK card in the database the script:

1. Looks up the card in the HK JSON source (`hkSrcByWebId`). If not found → `notInJsonHK`.
2. **Routes by expansion coverage:**
   - If the expansion is in `OFFSET_EXPANSIONS` (`SVK`, `SVHK`) → skip entirely (`skippedNon100`). Handled by dedicated fix scripts.
   - If the expansion is **not** in `fullMatchExpansions` (partial coverage) → different strategy depending on card type:
     - **Pokémon cards**: collector-number match + supertype guard; results stored in `partialExpUpdates` (requires per-expansion confirmation)
     - **Trainer/Energy cards**: **name-based matching** via `ZH_TO_JP_PARTIAL` translation table (collector numbers are offset because HK mini-deck sets include exclusive cards absent from JP). Matched results are also stored in `partialExpUpdates`; unknown names (HK-exclusive cards) are skipped (`skippedNon100`)
   - If the expansion is in `fullMatchExpansions` (100% coverage) → results go into the normal `updates` queue.
3. Attempts an **exact** variant match (`jpLookup`), then falls back to **any** variant (`jpLookupAny`). If neither matches → `unmatchedHK` (or `skippedNon100` for partial expansions).
4. **Pokédex cross-check** (Pokémon cards only): if both cards have a `pokedexNumber` and they differ, logs a `pokedexMismatch` warning but **still proceeds** — HK dex data is known to be unreliable.
5. Looks up the matched JP card in the database (`jpDbByWebId`). If not found → `noJPInDB`.
6. Checks if the HK card is already pointing at the correct JP `PrimaryCard` → `alreadyLinked`.

### Step 6 — Compute Sync Fields

Two sets of sync fields are computed per matched pair:

#### JP → HK (JP is authoritative — always overwrite)
| Field | Rule |
|-------|------|
| `rarity` | Overwrite if JP value differs |
| `variantType` | Overwrite if JP value differs |
| `regulationMark` | Overwrite if JP value differs |

#### JP → HK (fill-only — do not overwrite existing data)
| Field | Rule |
|-------|------|
| `artist` | Write only when HK value is null/empty |
| `evolvesFrom` | Write only when HK value is null/empty |
| `ruleBox` | Write only when HK value is null/empty |
| `subtypes` | Write only when HK array is null/empty |

#### HK → JP (reverse sync)
| Field | Rule |
|-------|------|
| `regulationMark` | Write to JP only when JP value is null/empty |

The HK scraper captures `regulationMark`; the JP scraper does not — this reverse sync fills the gap.

---

## Dry-Run Report

Running without `--apply` prints a summary like:

```
============================================================
RESULTS
============================================================
HK cards in DB:                4823
HK cards in source JSON:       4756

Matches found:
  ✅ Already correctly linked:  3201
  🔗 To be linked:              1422
     (of which Pokédex ✓):      1398

Skipped / problems:
  ℹ️  Skipped (non-100% expansions):    133
  ⚠️  HK dex data issues (matched anyway): 24
  ⚠️  No JP match in JSON:               12
  ⚠️  JP match in JSON but not DB:        8
  ⚠️  HK card not in source JSON:        67

Fields to sync from JP → HK:
  rarity: 540 cards
  regulationMark: 210 cards

Fields to sync from HK → JP:
  regulationMark: 89 cards
```

---

## Apply Mode

When `--apply` is passed:

1. **Confirmation prompt** — shows total number of DB changes; requires typing `yes` (skipped with `--yes` or when targeting a specific expansion).
2. **Batch updates (full-match expansions)** — HK cards from 100%-coverage expansions are updated in chunks of 200 inside `prisma.$transaction` calls:
   - `primaryCardId` is set to the JP card's `PrimaryCard` ID.
   - Any computed `syncFields` are applied in the same update.
3. **Partial-expansion interactive flow** — For each partial-coverage expansion a per-expansion prompt is shown:
   ```
   Expansion M4: 84 HK cards matched to JP  (84/120 JP cards = 70% matched)
     Apply 84 links for M4? (yes/no):
   ```
   - Answer `yes` to link that expansion, `no` to skip it.
   - Skipped with `--yes` or when using `--apply <expansion>` to target one expansion directly.
4. **Reverse sync** — JP cards with missing `regulationMark` are updated from HK data, also in chunks of 200. (Skipped when targeting a specific expansion.)
5. **Orphan cleanup** — after relinking, any `PrimaryCard` record that was HK-only (now has no cards pointing to it) is deleted.

### Targeting a Single Partial Expansion

```bash
npx tsx scrapers/map-hk-to-jp.ts --apply m4
```

- Only the `M4` expansion updates are applied (case-insensitive).
- Per-expansion confirmation is skipped automatically.
- Reverse sync and global confirmation are also skipped.
- If the named expansion does not exist in `partialExpUpdates`, the script reports available partial expansions and exits.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Only link expansions with 100% JP coverage | Avoids partial mappings that would create incorrect links |
| Pokédex mismatch = warning only, not a blocker | HK source data often has wrong dex numbers; collector number is the stronger identifier |
| JP is authoritative for `rarity` / `variantType` | JP is the original release; HK is a regional reprint |
| Reverse sync `regulationMark` HK → JP | JP scraper does not capture this field; HK scraper does |
| Batch size 200 | Balances transaction size vs. memory usage |
| `SVK` / `SVHK` explicitly excluded | These sets have collector-number offsets between HK and JP; dedicated fix scripts handle them |

---

## Related Scripts

| Script | Purpose |
|--------|---------|
| `_fix_svk_hk_mappings.ts` | Manual mapping for SVK expansion (offset collector numbers) |
| `_fix_svhk_hk_mappings.ts` | Manual mapping for SVHK expansion (offset collector numbers) |
| `_check_sc_linking.ts` | Verify HK→JP link integrity after applying |
| `_check_unlinked.ts` | Find HK cards still without a JP counterpart |
