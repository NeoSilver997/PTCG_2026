# PTCG 2026 — Deck Format Logic

> Reference document for the deck view system used by `/deck-builder/event/[deckCode]` and any future deck-related pages. Includes all SQL queries executed at each stage.

---

## Table of Contents

1. [Overview](#overview)
2. [Data Model](#data-model)
3. [Section Classification](#section-classification)
4. [Section Ordering & Display](#section-ordering--display)
5. [Card Merging (Art Variants)](#card-merging-art-variants)
6. [DB Cards vs deckData Fallback](#db-cards-vs-deckdata-fallback)
7. [Role Override System](#role-override-system)
8. [Cross-Deck Global Roles](#cross-deck-global-roles)
9. [Archetype Name Derivation](#archetype-name-derivation)
10. [ACE SPEC Detection](#ace-spec-detection)
11. [API Pipeline — Deck Load](#api-pipeline--deck-load)
12. [SQL Reference](#sql-reference)

---

## Overview

Each event deck is identified by an **official deck code** (e.g. `pMMyyp-Bj58oH-M2MpyS`) from `pokemon-card.com`.  
Cards within a deck are classified into **11 sections** based on supertype, subtypes, rarity, HP, quantity, and user-assigned roles. The system supports:

- Heuristic auto-classification on first load
- Manual role overrides (persisted per `deckCode + cardId` in `deck_card_roles`)
- Cross-deck presets (roles from other decks pre-fill unset cards)
- Archetype name auto-derivation (Chinese preferred) written back to `decks.cachedArchetypeName`

---

## Data Model

```
decks
  id, deckCode, name, deckData (JSON fallback), cachedArchetypeName, cachedAceName, ...

deck_cards
  id, deckId, cardId, quantity

cards
  id, webCardId, name, supertype, subtypes[], types[], rarity, hp, attacks (JSON),
  abilities (JSON), evolutionStage, evolvesFrom, evolvesTo,
  primaryCardId, language, variantType, ...

primary_cards
  id, effectTags[], specialEffectTags[]

deck_card_roles
  id, deckCode, canonicalWebCardId, role (DeckPokemonRole enum), updatedAt

card_prices
  id, cardId, source, price, currency, inStock, fetchedAt
```

### DeckPokemonRole enum

| DB Value           | UI Section Key       | Label (ZH)     |
|--------------------|----------------------|----------------|
| `POKEMON_MAIN`     | `pokemon-main`       | 主攻寶可夢     |
| `POKEMON_SECONDARY`| `pokemon-secondary`  | 副攻寶可夢     |
| `POKEMON_SUPPORT`  | `pokemon-support`    | 輔助寶可夢     |
| `POKEMON_EVOLUTION`| `pokemon-evolution`  | 進化鏈寶可夢   |

---

## Section Classification

All 11 section keys and their automatic classification rules:

### `getSectionKey(entry)` heuristic

```
supertype === 'POKEMON'
  → quantity ≥ 3 OR hp ≥ 200        → 'pokemon-main'
  → has any abilities array entry    → 'pokemon-support'
  → else                             → 'pokemon-secondary'

supertype === 'ENERGY'
  → subtypes includes 'BASIC_ENERGY' → 'basic-energy'
  → else                             → 'special-energy'

supertype === 'TRAINER' (default)
  → rarity === 'ACE_SPEC_RARE'       → 'ace'
  → subtypes includes 'SUPPORTER'    → 'supporter'
  → subtypes includes 'ITEM'         → 'item'
  → subtypes includes 'TOOL'         → 'tool'
  → subtypes includes 'STADIUM'      → 'stadium'
  → fallback                         → 'item'
```

The role key used for override lookup is: `primaryCardId ?? canonicalWebCardId ?? webCardId`  
This allows one saved role to apply across all language/art variants of the same card.

---

## Section Ordering & Display

```
SECTION_ORDER = [
  'pokemon-main',       // 主攻寶可夢
  'pokemon-secondary',  // 副攻寶可夢
  'pokemon-support',    // 輔助寶可夢
  'pokemon-evolution',  // 進化鏈寶可夢
  'supporter',          // 支援者
  'item',               // 物品
  'ace',                // ACE SPEC
  'tool',               // 寶可夢道具
  'stadium',            // 競技場
  'basic-energy',       // 基本能量
  'special-energy',     // 特殊能量
]
```

### Sort within a section

1. **Quantity descending** — highest copies first (indicates importance in deck strategy)
2. Pokémon sections only: **HP descending** → **max attack damage descending**
3. Others: **name alphabetical**

---

## Card Merging (Art Variants)

`mergeEntriesByCard(entries)` collapses multiple art variants of the same logical card into one display entry, summing quantities.

**Grouping key:**
- Pokémon: `primaryCardId ?? canonicalWebCardId ?? zhName ?? name ?? webCardId`
- Trainer/Energy: `zhName ?? name ?? webCardId`

**Display representative:** the variant with the highest rarity score wins (shown in card tile):

```
SPECIAL_ILLUSTRATION_RARE = 100
ILLUSTRATION_RARE          = 90
HYPER_RARE                 = 85
ULTRA_RARE                 = 80
ACE_SPEC_RARE              = 75
DOUBLE_RARE                = 70
RARE_HOLO                  = 60
RARE                       = 50
UNCOMMON                   = 20
COMMON                     = 10
```

---

## DB Cards vs deckData Fallback

The API stores decks in two forms:
1. **`deck_cards` table** — fully hydrated with HP, attacks, subtypes (preferred)
2. **`deckData` JSON column** — raw `[{cardId, cardName, quantity, imageUrl}]` (fallback)

**Merge strategy (frontend):**

```
dbCards = data.cards (hydrated from DB)
deckDataFallback = data.deckData
  .filter(not already in dbCards by normalizedId or name)
  .map(infer supertype from imageUrl suffix: _P_=POKEMON, _T_=TRAINER, _E_=ENERGY)
  .map(infer rarity: ACE SPEC if cardCode contains "ACE SPEC" or name in KNOWN_ACE_JP set)

deckEntries = [...dbCards, ...deckDataFallback]
```

**webCardId normalization:** strips language prefix and leading zeros  
`"jp48778"` → `"48778"`, `"hk00014744"` → `"14744"`

---

## Role Override System

Roles are stored in `deck_card_roles` (PostgreSQL) and also cached in `localStorage` for instant rendering.

### Priority (highest to lowest):

| Source                 | Scope     | Notes                                          |
|------------------------|-----------|------------------------------------------------|
| `deck_card_roles` (DB) | Per deck  | Explicit user save — always wins for this deck |
| Global roles lookup    | All decks | Last-used role for this card in ANY deck       |
| `getSectionKey` heuristic | Default | Based on supertype/hp/abilities/subtypes       |

### State sync flow:

```
1. Page load  → read localStorage (instant render with cached roles)
2. API: GET /decks/code/:deckCode/roles → seed dbRoles
3. useEffect  → merge dbRoles → localRoles (DB wins per-card)
4. API: GET /decks/roles/lookup?cards=... → seed globalRoles
5. useEffect  → apply globalRoles for cards NOT in dbRoles
6. User changes role → optimistic localRoles update + PUT /decks/code/:deckCode/roles/:cardId
```

---

## Cross-Deck Global Roles

When a user opens a new deck, cards with no saved override in that specific deck will auto-fill with the most-recently assigned role for that card **across all other decks**.

**Lookup key:** `primaryCardId` (links all language/art variants of the same card)

---

## Archetype Name Derivation

The archetype name is computed client-side from the classified sections and written back to the DB via `PATCH /decks/code/:deckCode/meta`.

### Algorithm:

```
1. Get pokemon-main section cards
2. Filter out lower evolutions if a higher stage is present in the deck:
   - For each card, split its evolvesTo field (comma-separated) and check if any of
     those names are also in pokemon-main AND have a higher evolutionStage value.
   - If yes, exclude this card (a higher evolution is already in the deck).
   - Note: evolvesFrom is always NULL in DB; evolvesTo on lower-stage cards points
     forward to evolution targets (e.g. 小火龍.evolvesTo = "火恐龍,噴火龍ex,...").
   - STAGE_ORDER: BASIC=0, STAGE_1=1, STAGE_2=2
3. Collect up to 2 unique Chinese names (zhName ?? name)
4. From pokemon-support, find engine Pokémon whose PrimaryCard has any of these effectTags:
   - 放置基礎寶可夢  (bench-setup cards, e.g. ノコッチex)
   - 附上搜索能量    (energy-search cards, e.g. 赤松/Akamine)
   (replaces the old hardcoded JP-name list)
   Add up to 1 unique Chinese name
5. archetypeName = [...mainNames, ...supportDrawNames].join(' + ')
```

**Effect tag source:** `primary_cards.effectTags` — populated by `populate-effect-tags.ts`  
(text-pattern classifier) and also back-filled by `tag-basic-pokemon-energy-cards.ts`  
(curated name list). Both write to the same `effectTags` array on `PrimaryCard`.

**ACE SPEC name:** first card in the `ace` section → `zhName ?? name`

Both are cached: `decks.cachedArchetypeName`, `decks.cachedAceName`, `decks.cachedNameAt`

---

## ACE SPEC Detection

ACE SPEC cards are identified by rarity or a hardcoded name set (for deckData fallback):

```typescript
rarity === 'ACE_SPEC_RARE'
// OR cardCode contains "ACE SPEC"
// OR name in KNOWN_ACE_JP:
[
  'マキシマムベルト', 'プライムキャッチャー', 'テラスタルオーブ', 'マスターボール',
  'ライムのコスプレそうち', 'スターバース', 'はかせのロールプレイ', 'ハンディチップ',
  'コストダウン', 'スタークロイス', 'アドレナリンシリンジ', 'アクアキューブ',
  'スーパークロス', 'ドミネートガン', 'VIPパス',
  'アンフェアスタンプ', 'ヒーローマント', 'ネオアッパーエネルギー', 'シークレットボックス',
]
```

---

## API Pipeline — Deck Load

`GET /api/v1/decks/code/:deckCode` executes these steps in order:

```
1. findOneByCode     → lookup deck by deckCode (raw SQL)
2. findOne           → Prisma: load deck + cards + tournamentResults
3. hydrateDeckExtras → add deckCode + deckData columns (raw SQL)
4. resolveCanonicalWebCardIds → find best JA_JP webCardId per primaryCard
5. resolveChineseVariants     → find ZH_TW name/image/abilities/attacks + effectTags
6. addPricingInfo             → price tiers + deck totals (raw SQL with CTE)
7. buildEffectSummary         → in-memory: flatten abilities + attacks from all cards
```

---

## SQL Reference

### 1. Lookup deck by code

```sql
SELECT id FROM decks WHERE "deckCode" = $1 LIMIT 1
```

### 2. Hydrate deckCode + deckData

```sql
SELECT id, "deckCode", "deckData" FROM decks WHERE id = $1
```

### 3. Prisma: Load deck with cards and tournament results

```sql
-- Generated by Prisma (simplified)
SELECT
  d.*,
  -- deck_cards join
  dc.id, dc."cardId", dc.quantity,
  -- cards join
  c."webCardId", c.name, c."imageUrl", c.supertype, c.subtypes, c.types,
  c.rarity, c.hp, c.attacks, c.abilities, c.weaknesses, c.resistances,
  c."evolutionStage", c."evolvesFrom", c."evolvesTo", c."primaryCardId", c.language,
  -- primary_cards join (effectTags drives archetype derivation)
  pc."effectTags", pc."specialEffectTags",
  -- tournament_results join
  tr.*, t.date, t.name, t.location, t.type, t."playerCount", t.region, t."eventId"
FROM decks d
LEFT JOIN deck_cards dc ON dc."deckId" = d.id
LEFT JOIN cards c ON c.id = dc."cardId"
LEFT JOIN primary_cards pc ON pc.id = c."primaryCardId"
LEFT JOIN tournament_results tr ON tr."deckId" = d.id
LEFT JOIN tournaments t ON t.id = tr."tournamentId"
WHERE d.id = $1
ORDER BY c.supertype ASC
```

> **Archetype derivation** uses `pc."effectTags"` to detect engine Pokémon in
> `pokemon-support` — any card whose `effectTags` contains `放置基礎寶可夢` or
> `附上搜索能量` qualifies. This replaces the old hardcoded JP-name list.

### 4. Resolve canonical webCardId (JA_JP preferred)

```sql
SELECT "primaryCardId", "webCardId", language
FROM cards
WHERE "primaryCardId" = ANY($1::text[])
ORDER BY language ASC, "createdAt" ASC
```

Logic: build map `primaryCardId → webCardId`; `JA_JP` entry overwrites any other language.

### 5. Resolve Chinese (ZH_TW) variants

```sql
SELECT id, "primaryCardId", name, "webCardId", "imageUrl", "variantType", abilities, attacks
FROM cards
WHERE "primaryCardId" = ANY($1::text[])
  AND language = 'ZH_TW'
ORDER BY "variantType" ASC
```

Logic: build map `primaryCardId → best ZH_TW card`; `NORMAL` variantType wins over others.

### 6. Pricing — latest price per ZH_TW variant (90-day window)

```sql
WITH latest_prices AS (
  SELECT DISTINCT ON ("cardId")
    "cardId", price, "inStock", currency, "fetchedAt"
  FROM card_prices
  WHERE price > 0
    AND "fetchedAt" >= NOW() - INTERVAL '90 days'
  ORDER BY "cardId", "fetchedAt" DESC
)
SELECT
  jp_c.id                          AS "deckCardId",
  jp_c."primaryCardId"             AS "primaryCardId",
  zh_c.id                          AS "zhCardId",
  zh_c.name                        AS "zhName",
  zh_c."webCardId"                 AS "zhWebCardId",
  zh_c."imageUrl"                  AS "zhImageUrl",
  zh_c."variantType"               AS "variantType",
  zh_c.rarity                      AS "rarity",
  lp.price                         AS "minPrice",
  lp.price                         AS "maxPrice",
  lp.currency                      AS "currency",
  lp."fetchedAt"                   AS "latestFetchedAt",
  lp."inStock"                     AS "inStock"
FROM cards jp_c
JOIN cards zh_c
  ON zh_c."primaryCardId" = jp_c."primaryCardId"
  AND zh_c.language = 'ZH_TW'
JOIN latest_prices lp
  ON lp."cardId" = zh_c.id
WHERE jp_c.id = ANY($1::text[])
ORDER BY lp.price ASC
```

**Price tiers built from result:** rows sorted ASC → `[0]` = cheapest, `[last]` = priciest, `[mid]` = middle.

**Deck totals:**
- `lowestTotal` = sum(lowest ZH variant price × quantity)
- `highestTotal` = sum(highest ZH variant price × quantity)
- `budgetTotal` = sum(cheapest rarity across all ZH prints × quantity, USER price takes precedence)
- `premiumTotal` = sum(priciest rarity across all ZH prints × quantity)

### 7. User-saved prices

```sql
SELECT DISTINCT ON (c."webCardId")
  c."webCardId", cp.price
FROM card_prices cp
JOIN cards c ON c.id = cp."cardId"
WHERE c."webCardId" = ANY($1::text[])
  AND cp.source = 'USER'
ORDER BY c."webCardId", cp."fetchedAt" DESC
```

### 8. Get all role overrides for a deck

```sql
SELECT "canonicalWebCardId", role::text
FROM deck_card_roles
WHERE "deckCode" = $1
```

### 9. Cross-deck role lookup (latest role per card)

```sql
SELECT DISTINCT ON ("canonicalWebCardId") "canonicalWebCardId", role::text
FROM deck_card_roles
WHERE "canonicalWebCardId" = ANY($1::text[])
ORDER BY "canonicalWebCardId", "updatedAt" DESC
```

### 10. Upsert role override

```sql
INSERT INTO deck_card_roles (id, "deckCode", "canonicalWebCardId", role, "createdAt", "updatedAt")
VALUES ($1, $2, $3, $4::"DeckPokemonRole", NOW(), NOW())
ON CONFLICT ("deckCode", "canonicalWebCardId")
DO UPDATE SET role = $4::"DeckPokemonRole", "updatedAt" = NOW()
```

Valid role values: `POKEMON_MAIN`, `POKEMON_SUPPORT`, `POKEMON_EVOLUTION`  
(`POKEMON_SECONDARY` is heuristic-only; reverts automatically when override is cleared)

### 11. Clear role override

```sql
DELETE FROM deck_card_roles
WHERE "deckCode" = $1 AND "canonicalWebCardId" = $2
```

### 12. Cache archetype meta

```sql
UPDATE decks
SET "cachedArchetypeName" = $1,
    "cachedAceName"       = $2,
    "cachedNameAt"        = NOW()
WHERE "deckCode" = $3
```

### 13. Find decks with deckData but no DeckCard rows (admin)

```sql
SELECT
  COUNT(*) FILTER (WHERE "deckData" IS NOT NULL) AS total_with_data,
  COUNT(*) FILTER (
    WHERE "deckData" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM deck_cards dc WHERE dc."deckId" = decks.id)
  ) AS empty_count
FROM decks
```

### 14. Find decks missing archetype name (admin)

```sql
SELECT
  COUNT(DISTINCT d.id) FILTER (
    WHERE EXISTS (SELECT 1 FROM deck_cards dc WHERE dc."deckId" = d.id)
  ) AS total_with_cards,
  COUNT(DISTINCT d.id) FILTER (
    WHERE EXISTS (SELECT 1 FROM deck_cards dc WHERE dc."deckId" = d.id)
      AND d."cachedArchetypeName" IS NULL
  ) AS missing_name
FROM decks d
```

---

## Shared Usage

This logic is implemented in two places — keep them in sync:

| File | Purpose |
|------|---------|
| [apps/web/src/components/deck-view.tsx](../apps/web/src/components/deck-view.tsx) | `getSectionKey`, `SECTION_ORDER`, `SECTION_LABELS`, `mergeEntriesByCard`, `sortSection` |
| [apps/web/src/app/deck-builder/event/[deckCode]/page.tsx](../apps/web/src/app/deck-builder/event/%5BdeckCode%5D/page.tsx) | Section grouping, archetype derivation, role merge, deckData fallback |
| [apps/api/src/decks/decks.service.ts](../apps/api/src/decks/decks.service.ts) | All SQL queries, canonical ID resolution, pricing, role persistence |
| [apps/api/src/decks/decks.controller.ts](../apps/api/src/decks/decks.controller.ts) | REST endpoints |

Pages that can reuse deck-view components by importing from `@/components/deck-view`:
- `/deck-builder?deckId=...&mode=view` (personal deck view)
- `/deck-builder/event/[deckCode]` (tournament deck view)
- Any future archetype comparison or deck-diff page
