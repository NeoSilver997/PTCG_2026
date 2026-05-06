# populate-effect-tags.ts — Documentation

**Source file:** `scrapers/populate-effect-tags.ts`
**Last modified:** `2026-05-06 21:31`
**MD5:** `4A82C5148E668FC1994818A4D823798F`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

Reads every `PrimaryCard` from the database, locates its best Chinese-language variant (ZH_HK preferred, ZH_TW fallback), extracts attack effects and ability descriptions, classifies them into structured tags, then writes four computed fields back to `PrimaryCard`:

| Field | Type | Description |
|---|---|---|
| `effectTags` | `string[]` | Primary effect classification tags |
| `specialEffectTags` | `string[]` | Secondary / special effect tags |
| `effectScore` | `number` | Aggregate numeric score (0–12) |
| `cardTier` | `string` | Letter tier derived from score (D → S+) |

## Usage

```powershell
# Dry-run (prints stats only, no DB writes)
npx tsx scrapers/populate-effect-tags.ts

# Apply mode — writes effectTags, effectScore, cardTier to DB
npx tsx scrapers/populate-effect-tags.ts --apply
```

---

## Step-by-Step Logic

### 1. Batch-load PrimaryCards
Cards are fetched in batches of 500 with their language variants (`languageVariants`). For each card, the script picks the best text source in priority order: ZH_HK → ZH_TW → any available variant.

### 2. Extract text fields
For each card, all `attacks[].effect` and `abilities[].description` are concatenated and individually classified.

### 3. `classifySingleEffect(text)` — tag detection
Runs the raw text through ~40 rule blocks. Each block checks for keyword presence via the `has(...keywords)` helper and emits a tag into the `primary` or `special` sets. Some blocks gate on multiple conditions (e.g. "has 'HP' AND has '傷害'").

**Key tag blocks (abbreviated):**

| Tag | Pattern |
|---|---|
| `對手切換` | ZH: `對手` + `互換` + `戰鬥寶可夢` / JA: `相手` + `バトル場に呼び出す` or `バトルポケモンとベンチポケモンを入れ替え` |
| `切換效果` | ZH: `切換`, `互換` / JA: bench-to-active swap patterns |
| `牌庫搜索` | ZH: `搜尋牌庫` / JA: `山札から` + 取る |
| `抽卡效果` | ZH: `抽出N張` / JA: `山札からN枚引く` |
| `大量抽卡` (special) | Draw count ≥ 3 |
| `傷害防禦` | ZH: `不會受到傷害` / JA: `ダメージを受けない` |
| `招式封鎖` | ZH: `招式` + `無法使用` / JA: `ワザ` + `使えない` |
| `道具消除` | ZH: `道具消除` / JA: `ポケモンのどうぐをトラッシュ` |
| `狀態異常` | ZH: 中毒/燃燒/麻痺/睡眠/混亂 / JA: equivalent |

### 4. Numeric extractors
- `extractDrawCount(text)` — returns N for "draw N cards" patterns
- `extractMaxDamage(text, base)` — returns the maximum possible damage including multipliers

### 5. `computeEffectScore(primaryTags, specialTags)`
Sums per-tag weights from `PRIMARY_SCORES` and `SPECIAL_SCORES` lookup tables, capped at 12.

### 6. `computeTier(effectScore)` — tier ladder

| Score | Tier |
|---|---|
| ≥ 11 | S+ |
| ≥ 9 | **S** |
| ≥ 7 | A+ |
| ≥ 5 | A |
| ≥ 4 | B+ |
| ≥ 3 | B |
| ≥ 2 | C+ |
| ≥ 1 | C |
| 0 | D |

### 7. Manual overrides (`MANUAL_REMOVE_TAGS`)
A hardcoded map allows false-positive tags to be removed for specific JP card names (e.g. `スペシャルレッドカード` should not get draw-engine tags).

### 8. Write to DB (`--apply` only)
Updates `PrimaryCard` via `prisma.primaryCard.update(...)` with the four computed fields.

---

## Tag Scores Reference (`PRIMARY_SCORES`)

### Positioning / Utility

| Tag | Score | Notes |
|---|---|---|
| `對手切換` | **9** | "Boss's Orders / グズマ" — forced opponent gust. Tier **S** on its own. |
| `位置控制` | 3 | General positioning |
| `切換效果` | 2 | Self-switch / retreat replacement |
| `情報收集` | 2 | Info / hand-peek |

### Other notable scores

| Tag | Score |
|---|---|
| `資源獲取` | 4 |
| `傷害輸出` | 4 |
| `效果免疫` | 4 |
| `干擾效果` | 4 |
| `大量抽卡` (special) | 5 |
| `最大傷害` (special) | 5 |

---

## `對手切換` Tag — Design Decisions

**Why tier S?** Forcing the opponent to switch their active Pokémon (グズマ / Boss's Orders style) is one of the highest-impact effects in competitive PTCG. It lets the player bypass the opponent's defensive setup and knock out a weakened or low-HP benched Pokémon. Cards with this effect are almost always auto-includes in competitive lists.

**Detection patterns (ZH + JA):**

```typescript
// ZH: 選擇1隻對手的備戰寶可夢，與戰鬥寶可夢互換
(has('對手') && has('互換') && has('戰鬥寶可夢'))

// JA: 相手のベンチポケモンをバトル場に呼び出す
(has('相手') && has('バトル場に呼び出す'))

// JA: 相手のバトルポケモンとベンチポケモンを入れ替える
(has('相手') && has('バトルポケモンとベンチポケモンを入れ替え'))
```

**Separation from `切換效果`:** The generic `切換效果` tag (score 2) remains for self-switch / retreat effects. `對手切換` is a distinct, higher-value tag that does NOT replace `切換效果` — a card with both tags will score 9 + 2 = 11 → tier S+.

---

## Related Scripts

| Script | Purpose |
|---|---|
| `scrapers/fix-effect-tags-manual.ts` | Apply manual overrides / corrections to effectTags |
| `scrapers/map-by-skills.ts` | Match cards by skill/ability patterns |
| `docs/scrapers/fix-effect-tags-manual.ts.md` | Doc for manual fix script |
