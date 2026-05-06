# populate-effect-tags.ts — Documentation

**Source file:** `scrapers/populate-effect-tags.ts`
**Last modified:** `2026-05-06 22:04`
**MD5:** `87058B1D61CED63CFDB8B50B49309656`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

Reads every `PrimaryCard` from the database, locates its best language variant (ZH_HK preferred → ZH_TW → JA_JP → EN_US fallback), extracts attack effects and ability descriptions, classifies them into structured tags, then writes four computed fields back to `PrimaryCard`:

| Field | Type | Description |
|---|---|---|
| `effectTags` | `string[]` | Primary effect classification tags |
| `specialEffectTags` | `string[]` | Secondary / special effect tags |
| `effectScore` | `number` | Aggregate numeric score (0–12) |
| `cardTier` | `string` | Letter tier derived from score (D → S+) |

**Multi-language coverage:** Every classification block now includes EN_US keyword patterns alongside ZH and JA patterns. This ensures English-only cards (EN_US with no ZH/JA variant) are correctly tagged.

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

| Tag | ZH Pattern | JA Pattern | EN Pattern |
|---|---|---|---|
| `對手切換` | `對手` + `互換` + `戰鬥寶可夢` | `相手` + `バトル場に呼び出す` | `"your opponent's Benched"` + Active Spot / `"Switch out your opponent's Active Pokémon"` |
| `切換效果` | `切換`, `互換` | bench-to-active swap | `'Switch this Pokémon with'`, `'switch it with your Active Pokémon'` |
| `牌庫搜索` | `搜尋牌庫` | `山札から` + 取る | `'Search your deck for'` (guarded) |
| `棄牌搜索` | `棄牌區` + hand | `トラッシュから` + 手に | `'from your discard pile'` + hand (no energy/attach) |
| `抽卡效果` | `抽出N張` | `山札からN枚引く` | `'draw N cards'`, `'draw a card'` |
| `大量抽卡` (special) | draw count ≥ 3 | draw count ≥ 3 | draw count ≥ 3 |
| `放置基礎寶可夢` | `基礎寶可夢` + bench/hand | `たねポケモン` + bench/hand | `'Basic Pokémon'` or `'Basic {'` + deck + bench/hand |
| `能量操作` | energy move/discard | energy move/discard | `'Move an Energy'`, `'Discard Energy from this Pokémon'` |
| `附上搜索能量` | deck/discard + attach | deck/discard + attach | `'attach' + 'Energy' + 'from your discard pile'/'from your deck'` |
| `搜索指定能量` | `「基本【X】能量」` + deck | typed Basic + `基本エネルギー` | `/Basic {X} Energy/i` + search/attach context |
| `狀態異常` | 中毒/燃燒/麻痺/睡眠/混亂 | equivalent JA | `'is now Poisoned/Burned/Paralyzed/Asleep/Confused'` |
| `硬幣判定` | `投擲硬幣` | `コインを投げ` | `'Flip a coin'`, `'Flip N coins'` |
| `回復效果` | HP recovery | HP recovery | `/[Hh]eal \d+ damage\|[Hh]eal from this\|[Hh]eal all damage/` |
| `傷害防禦` | `不會受到傷害` | `ダメージを受けない` | `'prevent all damage done to this Pokémon'` |
| `條件傷害` | damage if/when | damage if/when | `'more damage for each'`, `'more damage'` + `'if'` |
| `狀態恢復` | status removal | status removal | `'recover from a Special Condition'`, `'remove all Special Conditions'` |
| `傷害指示物` | damage counter placement | damage counter | `'put' + 'damage counters on' + 'Pokémon'` |
| `道具消除` | tool discard (single) | `ポケモンのどうぐをトラッシュ` | `'discard' + 'Pokémon Tool'` (single) |
| `情報收集` | hand peek | hand peek | `'look at' + "opponent's hand"/'top'` |
| `昏厥條件` | KO condition | KO condition | `'Knocked Out' + ('if'/'when') + 'this Pokémon'` |
| `進化支援` | evolve support | evolve support | `'evolve'` + search/speed context |
| `撤退干擾` | retreat cost increase | retreat cost increase | `'Retreat Cost' + ' more'/'increased'` |
| `獎賞控制` | prize control | prize control | `'Prize card'`, `'take 1/2 more Prize'` |
| `反噬傷害` | recoil | recoil | `'damage to itself'`, `'also does'`, `'to this Pokémon as well'` |
| `連鎖傷害` | bench damage chain | bench damage chain | `"opponent's Benched Pokémon" + 'damage' + 'also does'` |
| `無視弱點/效果` | ignore weakness/effects | ignore weakness/effects | `"isn't affected by any effects on your opponent's"` |
| `使用限制` | use limit | use limit | `'During your next turn' + "this Pokémon can't use/attack"` |
| `條件失敗` | attack fails | attack fails | `'this attack does nothing'`, `'this attack fails'` |
| `能量附著` | from hand attach | from hand attach | `'attach Energy card from your hand'` (not discard/deck) |
| `備戰傷害加成` | bench count × damage | bench count × damage | `'for each Benched Pokémon' + 'damage'` |
| `棄牌區傷害加成` | discard pile count × damage | `トラッシュ + 枚数× + ダメージ` | `'for each card in your discard pile' + 'damage'` |
| `連續技` | chain move | chain move | `'this Pokémon used' + 'last turn'` |
| `招式封鎖` | move lock | `ワザ + 使えない` | `"can't attack" + "opponent's next turn"` |
| `HP提升` | `最大HP` + N | `最大HP` + N | `/get \+\d+ HP/`, `'maximum HP' + /\+\d+/` |
| `效果免疫` | `不會受到效果` | `効果を受けない` | `'Prevent all effects of attacks'` |
| `道具移除` (mass) | mass tool discard | mass tool discard | `'discard all Pokémon Tools'` |
| `招式複製` | copy move | copy move | `'use it as this attack'` |
| `弱點消除` | `弱點消除` | `弱点を` + remove | `'has no Weakness'` |
| `全體防禦` | all your Pokémon + damage reduction | `自分のポケモン全員` + reduce | `'each/all of your Pokémon' + 'less damage'` |
| `撤退封鎖` | `無法撤退` | `逃げることができない` | `"can't retreat"`, `"cannot retreat"` |
| `高額傷害減免` | `-80`/`-100` damage | 80/100 less | `'takes 80/100 less damage'` |
| `傷害減免` | `-10...-60` damage | 10-60 less | `/takes? (10\|20\|...) less damage/i` |
| `支援者限制` | supporter restriction | `サポートは使えない` | `"can't use any Supporter cards"` |
| `KO回收` | KO'd → hand/bench | KO'd → hand/bench | `'Knocked Out' + 'into your hand'/'onto your Bench'` |
| `重新抽牌` | shuffle + redraw | shuffle + redraw | `'shuffle your hand' + 'draw' + 'deck'` |
| `搜索進化寶可夢` | evolved Pokémon search | evolved Pokémon search | `'search your deck' + 'Evolution card'/'evolves from'` |
| `搜索訓練師卡` | Item/Tool search | グッズ search | `'Search your deck' + 'Item card'/'Tool card'` |
| `搜索支援者` | Supporter search | サポート search | `'Search your deck' + 'Supporter card'` |
| `查看牌庫頂` | `牌庫頂` + 查看 | `山札の上` + 見る | `'look at the top N cards of your deck'` |
| `回收訓練師` | Item/Supporter from discard | グッズ/サポート from trash | `'from your discard pile' + 'Item card'` + `'into your hand'` |
| `手牌丟棄` | `手牌` + `丟棄` | `手札` + `トラッシュ` | `'Discard' + 'from your hand'` |
| `手牌回收` | field bounce | `手札に戻す` + `ポケモン` | `'return' + 'to your hand' + 'Pokémon'` |
| `物品卡封鎖` | item lock (ZH inferred) | `グッズを使えない` | `"can't play any Item cards from their hand"` |
| `能量需求增加` | `使用招式所需的能量` | retreat/attack cost increase | `'Retreat Cost' + 'more' + 'for each'` |
| `能量回收` | discard → hand (Energy) | `トラッシュから` + `エネルギー` + `手札` | `'from your discard pile' + 'Energy card' + 'into your hand'` |

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

**Detection patterns (ZH + JA + EN):**

```typescript
// ZH: 選擇1隻對手的備戰寶可夢，與戰鬥寶可夢互換
(has('對手') && has('互換') && has('戰鬥寶可夢'))

// JA: 相手のベンチポケモンをバトル場に呼び出す
(has('相手') && has('バトル場に呼び出す'))

// JA: 相手のバトルポケモンとベンチポケモンを入れ替える
(has('相手') && has('バトルポケモンとベンチポケモンを入れ替え'))

// EN: Boss's Orders / Gust of Wind style
(has("your opponent's Benched") && has('Active Spot', 'Active Pokémon') && !has('damage'))
has("Switch out your opponent's Active Pokémon")
(has('switch in') && has("opponent's Benched") && has('Active Spot'))
```

**Separation from `切換效果`:** The generic `切換效果` tag (score 2) remains for self-switch / retreat effects. `對手切換` is a distinct, higher-value tag that does NOT replace `切換效果` — a card with both tags will score 9 + 2 = 11 → tier S+.

---

## Related Scripts

| Script | Purpose |
|---|---|
| `scrapers/fix-effect-tags-manual.ts` | Apply manual overrides / corrections to effectTags |
| `scrapers/map-by-skills.ts` | Match cards by skill/ability patterns |
| `docs/scrapers/fix-effect-tags-manual.ts.md` | Doc for manual fix script |
