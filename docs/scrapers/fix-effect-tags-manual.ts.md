# fix-effect-tags-manual.ts — Documentation

**Source file:** `scrapers/fix-effect-tags-manual.ts`
**Last modified:** `2026-04-21 07:55`
**MD5:** `230F029B466D75F052E982FEAE13CEF5`
**Summarised by model:** `Claude Sonnet 4.6`

One-time correction script for misclassified `effectTags` on specific `PrimaryCard` records. Removes tags that were incorrectly assigned and cleans up a deleted rule-tag (`特殊能量`) from all cards globally.

---

## Usage

```bash
npx tsx scrapers/fix-effect-tags-manual.ts
```

No flags. Runs immediately and applies all fixes.

---

## How It Works — Step by Step

### Fix 1 — 特殊紅牌 (`hk18898`)

Looks up the card by `webCardId: 'hk18898'`, resolves its `PrimaryCard`, then removes `抽卡效果` and `搜索效果` from its `effectTags` array.

**Why:** 特殊紅牌 does not draw cards or search the deck — these tags were incorrectly applied during the bulk tagging run.

### Fix 2 — Named Card Patches

A static list of `[jpName, tagsToRemove]` pairs is applied in sequence:

| Card (JP name) | Tags removed |
|----------------|-------------|
| `メガピクシーex` | `棄牌區傷害加成` |
| `変化の書` | `棄牌區傷害加成` |

Each card is found with `prisma.primaryCard.findFirst({ where: { name } })`. If not found, a warning is logged but execution continues.

**Why:** These cards do not deal bonus damage from the discard pile — that mechanic belongs to other cards that were the source of the tag.

### Fix 3 — Global Removal of `特殊能量`

Finds all `PrimaryCard` records where `effectTags` contains `'特殊能量'` using Prisma's `{ has: '特殊能量' }` filter, then removes the tag in a single `$transaction`.

**Why:** `特殊能量` was an effect-tag category that has been deleted from the tagging ruleset. All residual instances must be purged.

---

## Output

```
✔ 特殊紅牌: removed 抽卡效果/搜索效果 → [防禦效果]
✔ メガピクシーex: removed [棄牌區傷害加成] → [高攻擊力]
✔ 変化の書: removed [棄牌區傷害加成] → [工具效果]
✔ Removed 特殊能量 tag from 12 cards: ダブルターボエネルギー, ...

Done.
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| One-time script, no flags | Fixes are surgical and idempotent — safe to re-run; already-fixed cards produce the same result |
| `findFirst` by JP name | `PrimaryCard.name` stores the JP canonical name; searching by JP name is the most reliable key |
| `$transaction` for bulk fix | Ensures all `特殊能量` removals are atomic |
| Continues on missing cards | Logs a warning rather than throwing, so a card not yet imported doesn't block the other fixes |

---

## Related Scripts

| Script | Purpose |
|--------|---------|
| `scrapers/seed-effect-tags.ts` | Bulk-assign `effectTags` to all `PrimaryCard` records |
| `scrapers/check-null.ts` | Verify which cards have null/empty effectTags after seeding |
