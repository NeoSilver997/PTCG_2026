# map-by-skills.ts — Documentation

**Source file:** `scrapers/map-by-skills.ts`
**Last modified:** `2026-05-06 02:47`
**MD5:** `9E111DEB7E1D650845B03CD0F298ECA9`
**Summarised by model:** `Claude Sonnet 4.6`

Maps HK-only `PrimaryCard` records to their Japanese counterparts using two complementary strategies:

1. **Attack fingerprint** — language-neutral hash of attack cost + damage (reliable for Pokémon with attacks stored)
2. **Effect-tag fingerprint** — language-neutral `effectTags + specialEffectTags + supertype + subtype` from `PrimaryCard` (for trainers/energies where attacks are absent); tags written by `populate-effect-tags.ts`

---

## Why This Script Exists

`map-hk-to-jp.ts` matches cards by **expansionCode + collectorNumber**.  
In some expansions (e.g. **M4**, **M1S**, **M1L**, **SVM**) the HK collector numbers differ from the JP numbers, so those cards are skipped entirely by the collector-based script.

This script is a **complementary** tool for cases where collector-number matching fails.

---

## Why Not Use `skillsSignature`?

`PrimaryCard.skillsSignature` is a SHA-256 hash computed **at import time**. At import time many abilities/attacks fields are null, so thousands of cards end up with the same empty-signature hash. This stale value causes massive false positives.

This script computes fresh fingerprints directly from `Card.attacks` JSONB and uses card-number offset as a second-pass fallback.

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

**Recommended workflow:** Always dry-run first, verify the offset-based matches manually, then apply.

---

## How It Works — Step by Step

### Pass 1 — Pokémon matching by attack fingerprint

**Step 1 — Find HK-only PrimaryCards**

A **HK-only PrimaryCard** is a `PrimaryCard` that has:
- At least one `Card` with `language = ZH_TW`
- **Zero** `Card` records with `language = JA_JP`

**Step 2 — Load JP PrimaryCards for the same expansions**

For every `primaryExpansionId` in the HK-only set, fetch all JP `PrimaryCard` records.

**Step 3 — Compute attack fingerprints**

For each `PrimaryCard`, compute a fingerprint using `computeAttackFingerprint()`:

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

Only `cost` and `damage` are used — attack names and effect text are translated and would differ between JP and ZH_TW.

Cards with no attacks (trainers, energies, or Pokémon with attacks not yet scraped) return `null` — they fall through to Pass 2a.

**Step 4 — Match by fingerprint (safe 1:1 only)**

| Candidates | HK siblings with same fp | Action |
|------------|--------------------------|--------|
| Exactly 1 | Exactly 1 | Safe match ✅ |
| Multiple | Any | Ambiguous ⚠️ |
| Any | Multiple | Ambiguous ⚠️ |
| Zero | Any | Unmatched ❌ |
| null fingerprint | — | Held for Pass 2a |

---

### Pass 2a — Effect-tag fingerprint matching

Handles cards with `attackFingerprint = null` (trainers, energies, Pokémon with no attacks stored).

The **effect fingerprint** is computed from `PrimaryCard.effectTags` + `PrimaryCard.specialEffectTags` + the card's `supertype` + `subtype` (both derived from the first `Card` record):

```typescript
function computeEffectFingerprint(
  effectTags: string[], specialEffectTags: string[],
  supertype: string | null, subtype: string | null,
): string | null {
  const allTags = [...effectTags, ...specialEffectTags.map(t => `S:${t}`)].sort();
  if (allTags.length === 0) return null;
  if (allTags.length === 1 && allTags[0] === '其他效果') return null; // too generic
  const typeKey = [supertype ?? 'UNKNOWN', subtype ?? ''].filter(Boolean).join('/');
  return `${typeKey}:${allTags.join('|')}`;
}
```

Since `effectTags` are fixed functional labels (not translated text), the same card's HK and JP `PrimaryCard` will produce identical fingerprints. Including `supertype` **and `subtype`** in the key guarantees that cards of different trainer types (e.g. ITEM vs SUPPORTER) with overlapping effect tags can never collide — きずぐすり (ITEM/回復效果) and コック (SUPPORTER/抽卡效果) always produce distinct fingerprints.

**Safety:** 1:1 match only — if multiple HK or multiple JP cards in the same expansion share the same fingerprint, the match is ambiguous and falls through to Pass 2b.

Cards with no meaningful effect tags (null fingerprint or only `'其他效果'`) are pushed to `stillUnmatched`.

---

## Field Sync Rules (on apply)

| Field | Direction | Rule |
|-------|-----------|------|
| `rarity` | JP → HK | Always overwrite (JP is authoritative) |
| `variantType` | JP → HK | Always overwrite |
| `regulationMark` | JP → HK | Always overwrite if JP has a value |
| `artist` | JP → HK | Fill only when HK is null |
| `evolvesFrom` | JP → HK | Fill only when HK is null |
| `ruleBox` | JP → HK | Fill only when HK is null |
| `subtypes` | JP → HK | Fill only when HK array is empty |
| `regulationMark` | HK → JP | Fill only when JP is null |

---

## Output Format

Each match is displayed as:
```
[EXP/JP#]  HP:xxx  Type:TYPE  [Subtype:SUBTYPE]  Rarity:RARITY  [HK#xxx→JP#xxx]
  ZH: hkXXXXX "Chinese name"
  JP: jpXXXXX "Japanese name"  attacks: AttackName(cost→damage) | ...
```

For offset matches, `HK#xxx→JP#xxx` shows the collector number mapping.

---

## Limitations & Known Gaps

| Issue | Cause | Workaround |
|-------|-------|-----------|
| Trainers/energies with only generic tags (`其他效果`) remain unmatched | Not enough keywords matched by `populate-effect-tags.ts` | Add more keyword patterns to `populate-effect-tags.ts`, re-run it to refresh DB tags, then re-run this script |
| Ambiguous: multiple trainers share same effect fingerprint in an expansion | Different cards with identical functional tags (e.g. two different draw-3 supporters) | Add more specific tags to distinguish them |
| Pokémon without attacks stored treated as trainer-like | `attacks` field null in DB at scrape time | Re-scrape those cards to populate attacks, then rerun |
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
