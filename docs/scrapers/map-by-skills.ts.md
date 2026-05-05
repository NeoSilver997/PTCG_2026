# map-by-skills.ts — Documentation

**Source file:** `scrapers/map-by-skills.ts`
**Last modified:** `2026-05-06 01:52`
**MD5:** `F03B35AC648F2288784EAFC36AC1B203`
**Summarised by model:** `Claude Sonnet 4.6`

Maps HK-only `PrimaryCard` records to their Japanese counterparts by matching on a freshly-computed **attack fingerprint** — a language-neutral hash of each card's attack cost and damage values from the live `Card.attacks` JSON field.

---

## Why This Script Exists

`map-hk-to-jp.ts` matches cards by **expansionCode + collectorNumber**.  
In some expansions (e.g. **M4**, **M1S**, **M1L**) the HK collector numbers differ from the JP numbers, so those cards are skipped entirely by the collector-based script.

This script uses an **attack fingerprint** as the matching key instead, making it a **complementary** tool for cases where collector-number matching fails.

**Key insight:** Two Pokémon cards with the same attack costs and damage values in the same expansion are the same card printed under different collector numbers.

---

## Why Not Use `skillsSignature`?

`PrimaryCard.skillsSignature` is a SHA-256 hash of `{abilities, attacks}` computed **at import time**. At import time many abilities fields are null, so thousands of cards end up with the same empty-signature hash (`42ba610a86d15094`). Using this stale stored value would cause massive false-positive matches between unrelated cards.

Instead, this script **recomputes** the fingerprint live from `Card.attacks` using only the language-neutral fields (`cost` and `damage`). Trainer and Energy cards have no attacks and return `null` — they are skipped entirely.

---

## Usage

```bash
# Dry-run (default) — report only, no DB changes
npx tsx scrapers/map-by-skills.ts

# Apply changes (interactive confirmation)
npx tsx scrapers/map-by-skills.ts --apply

# Apply without confirmation prompt
npx tsx scrapers/map-by-skills.ts --apply --yes

# Limit to a single expansion
npx tsx scrapers/map-by-skills.ts --expansion M4
npx tsx scrapers/map-by-skills.ts --apply --expansion M4 --yes
```

---

## How It Works — Step by Step

### Step 1 — Find HK-only PrimaryCards

A **HK-only PrimaryCard** is a `PrimaryCard` that has:
- At least one `Card` with `language = ZH_TW`
- **Zero** `Card` records with `language = JA_JP`

These are cards the collector-based mapper left unlinked. The query runs entirely in DB (no JSON files needed).

### Step 2 — Load JP PrimaryCards for the Same Expansions

For every `primaryExpansionId` appearing in the HK-only set, fetch all JP `PrimaryCard` records (those that have at least one `JA_JP` card). Only expansions that already have JP data are queried.

### Step 3 — Compute Attack Fingerprints

For each `PrimaryCard` (both HK and JP), fetch the `attacks` JSON from one representative `Card` and compute a fingerprint using `computeAttackFingerprint()`:

```typescript
function computeAttackFingerprint(attacks: any): string | null {
  if (!attacks || !Array.isArray(attacks) || attacks.length === 0) return null;
  const normalized = attacks.map((a: any) => ({
    cost: [...(a.cost ?? [])].sort().join(','),
    damage: String(a.damage ?? ''),
  }));
  return JSON.stringify(normalized);
}
```

- Only `cost` and `damage` are used — **attack names and effect text are translated, so they differ between JP and ZH_TW and would cause mismatches**.
- Cards with no attacks (trainers, energies) return `null` and are excluded from matching.

### Step 4 — Build Per-Expansion Lookup

For each expansion: `Map<attackFingerprint, JP PrimaryCard[]>`

### Step 5 — Match

For each HK-only `PrimaryCard` with a non-null fingerprint, look up JP candidates by fingerprint within the same expansion:

| Candidates found | HK siblings with same fingerprint | Action |
|-----------------|----------------------------------|--------|
| **Exactly 1** | **Exactly 1** | Safe match → add to update queue |
| **Multiple** | Any | Ambiguous → skip, report |
| **Any** | **Multiple** | Ambiguous → skip, report |
| **Zero** | Any | Unmatched → skip, report |
| (HK has no attacks) | — | Skip (trainer/energy) |

### Step 6 — Report

Prints per-expansion breakdown showing match / ambiguous / unmatched counts, unmatched breakdown by reason, and a sample of matched pairs.

### Step 7 — Apply (if `--apply`)

For each safe match:
1. Re-point all `ZH_TW` cards' `primaryCardId` → JP `PrimaryCard.id`
2. Sync fields JP → HK (see table below)
3. Reverse-sync HK → JP for `regulationMark`
4. Delete orphaned HK-only `PrimaryCard` (if no cards remain pointing to it)

Updates are batched in chunks of 200 inside `prisma.$transaction`.

---

## Field Sync Rules

| Field | Direction | Rule |
|-------|-----------|------|
| `rarity` | JP → HK | Always overwrite (JP is authoritative) |
| `variantType` | JP → HK | Always overwrite |
| `regulationMark` | JP → HK | Always overwrite if JP has a value |
| `artist` | JP → HK | Fill only when HK is null |
| `evolvesFrom` | JP → HK | Fill only when HK is null |
| `ruleBox` | JP → HK | Fill only when HK is null |
| `subtypes` | JP → HK | Fill only when HK array is empty |
| `regulationMark` | HK → JP | Fill only when JP is null and HK has a value |

---

## Matching Safety: Ambiguous Cases

When multiple JP cards share the same attack fingerprint in an expansion the script **skips** them — it never guesses.

Common causes of ambiguous matches:
- **Same-cost evolution lines**: e.g. two Pokémon with `[COLORLESS]` / `10` damage
- **Multiple prints of the same base card** in the same expansion with identical attacks

Trainer and Energy cards are excluded entirely (null fingerprint) so they can never cause false positives.

---

## Limitations & Known Gaps

| Issue | Cause | Workaround |
|-------|-------|-----------|
| Trainer / Energy cards are never matched | No attacks stored — fingerprint is null | Use `map-hk-to-jp.ts` or manual fix |
| 856 Pokémon still unmatched after running | No JP cards for those expansions yet | Import JP cards for those expansions first |
| AC2D / SC2* / SV* expansions show 0 matches | No JP cards imported for those expansions | Import JP data first |


---

## Relationship to Other Scripts

| Script | Matching key | Use when |
|--------|-------------|----------|
| `map-hk-to-jp.ts` | expansionCode + collectorNumber (JSON) | HK/JP share same collector numbering |
| `map-by-skills.ts` | skillsSignature (DB only) | Collector numbers differ between HK and JP |
| `_fix_svk_hk_mappings.ts` | Manual offset table | SVK expansion with fixed offset |
| `_fix_svhk_hk_mappings.ts` | Manual offset table | SVHK expansion with fixed offset |

**Recommended order:**
1. Run `map-hk-to-jp.ts --apply --yes` first (covers most expansions)
2. Run `map-by-skills.ts --apply --yes` to catch remaining safe 1:1 matches
3. Handle ambiguous/unmatched cases with dedicated fix scripts or manually

---

## Related Files

- [scrapers/map-hk-to-jp.ts](../scrapers/map-hk-to-jp.ts) — collector-number based mapper
- [packages/database/prisma/schema.prisma](../packages/database/prisma/schema.prisma) — `PrimaryCard.skillsSignature` field definition
- [apps/api/src/cards/cards.service.ts](../apps/api/src/cards/cards.service.ts) — `generateSkillsSignature()` function (SHA-256 of `{ abilities, attacks }`)
