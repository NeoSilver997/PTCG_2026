# PrimaryCard Mapping Logic

## Overview

A `PrimaryCard` is the canonical identity shared across language variants. A single `PrimaryCard` can be linked to multiple `Card` rows — one per language/variant.

```
PrimaryCard (e.g. expansion=SV9, cardNumber=001)
  └── Card: webCardId=jp49355, language=JA_JP, variantType=SAR
  └── Card: webCardId=hk14460, language=ZH_TW, variantType=SAR
```

HK and JP cards are linked by running `scrapers/map-hk-to-jp.ts`.

---

## 100%-Match Rule

HK cards are only linked to JP PrimaryCards when the **entire expansion** has a 100% JP match rate.

- **100% match**: every HK card in that expansion has a corresponding JP card (same `expansionCode` + `collectorNumber`). These HK cards share the JP `PrimaryCard`.
- **Partial match**: some HK cards in that expansion have no JP equivalent. The entire expansion is skipped — all HK cards keep their own independent `PrimaryCard`.

**Why:** A partial match means the expansion boundary differs between regions (e.g. split sets, promos). Linking partial expansions incorrectly merges unrelated cards.

### Current counts (as of April 2026)
- 56 of 72 HK expansions are 100%-matched → HK cards share JP PrimaryCards
- 16 expansions skipped (partial coverage)

---

## Matching Key

```
normalizeExpansion(expansionCode) + ':' + collectorNumber.split('/')[0]
```

- `SV9:001` matches HK and JP cards with expansion `SV9`, collector number `001` (ignoring `001/100` format)
- Variant match is tried first (`SV9:001:SAR`), falls back to base key (`SV9:001`)
- Pokédex number is cross-checked for Pokémon cards — mismatch is logged as a warning but does **not** block linking (HK source data has unreliable dex numbers)

---

## Field Sync Rules

When HK cards are linked to JP PrimaryCards, fields are synced bidirectionally.

### JP → HK (JP is authoritative)

Always overwritten — even if HK already has a value:

| Field | Reason |
|---|---|
| `rarity` | JP scraper is the primary source of correct rarity codes |
| `variantType` | JP correctly distinguishes SAR/AR/HOLO etc; HK often defaults to NORMAL |
| `regulationMark` | When JP has it populated |

Fill only when HK value is null/empty:

| Field | Reason |
|---|---|
| `artist` | JP has artist credits; HK often lacks them |
| `evolvesFrom` | JP has evolution data |
| `ruleBox` | ex/V rule box text |
| `subtypes` | Stage1/Stage2/Item/Supporter etc |

### HK → JP (HK is authoritative)

Fill only when JP value is null:

| Field | Reason |
|---|---|
| `regulationMark` | HK scraper captures 規格標記 (A–I); JP scraper currently does not |

---

## Scripts

### `scrapers/map-hk-to-jp.ts` — Primary mapping & sync

```powershell
# Dry-run (safe, no DB changes)
node_modules\.bin\tsx.cmd scrapers/map-hk-to-jp.ts

# Apply
node_modules\.bin\tsx.cmd scrapers/map-hk-to-jp.ts --apply --yes
```

**What it does:**
1. Loads HK JSON (`data/cards/hongkong/hk_cards_*.json`) and JP JSON
2. Computes per-expansion match rates; builds `fullMatchExpansions` set
3. For each HK DB card in a 100%-match expansion, finds the JP counterpart by key
4. Updates `card.primaryCardId` → JP card's `PrimaryCard.id`
5. Syncs fields JP→HK and HK→JP per rules above
6. Deletes orphaned HK-only `PrimaryCard` rows

**Re-run anytime** — already-linked cards and already-synced fields are no-ops.

---

### `scrapers/revert-non100-links.ts` — Emergency revert

Use when `map-hk-to-jp.ts --apply` was run previously **without** the 100%-filter and incorrectly linked partial-expansion HK cards.

```powershell
# Dry-run
node_modules\.bin\tsx.cmd scrapers/revert-non100-links.ts

# Apply
node_modules\.bin\tsx.cmd scrapers/revert-non100-links.ts --apply
```

**What it does:**
1. Identifies non-100% expansions from JSON
2. Finds HK DB cards in those expansions whose `primaryCard` is shared with a JA_JP card
3. Finds (or creates) a HK-only `PrimaryCard` under the correct `PrimaryExpansion`
4. Moves those HK cards back to the HK-only `PrimaryCard`
5. New `PrimaryCard` is created with `name` + `skillsSignature` (SHA-256 of abilities+attacks) from the card itself

---

## PrimaryCard Creation

When a new `PrimaryCard` must be created (e.g. during revert):

```typescript
// skillsSignature = SHA-256(JSON(abilities) + '|' + JSON(attacks)).substring(0, 16)
prisma.primaryCard.upsert({
  where: { name_skillsSignature: { name, skillsSignature } },
  create: { name, skillsSignature, primaryExpansionId, cardNumber },
  update: { primaryExpansionId, cardNumber },
})
```

The `@@unique([name, skillsSignature])` constraint prevents duplicates for cards with identical name and mechanics.

---

## Common Pitfalls

| Problem | Cause | Fix |
|---|---|---|
| HK card linked to wrong JP card | Script run without 100%-filter | Run `revert-non100-links.ts --apply` |
| HK `variantType` shows NORMAL for SAR card | Sync not run / HK JSON has wrong value | Run `map-hk-to-jp.ts --apply --yes` |
| JP card missing `regulationMark` | HK→JP reverse sync not applied | Run `map-hk-to-jp.ts --apply --yes` |
| HK card missing `rarity` | JP→HK sync not applied | Run `map-hk-to-jp.ts --apply --yes` |
| `PrismaClientValidationError: name is missing` | `prisma.primaryCard.create` missing required fields | Always provide `name` + `skillsSignature` |
