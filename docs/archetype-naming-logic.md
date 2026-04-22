# Deck Archetype Naming Logic

This document describes how tournament deck archetype names are computed and displayed in the PTCG tournament pages.

> **Last verified:** April 23, 2026 against シティリーグ2026 シーズン4 オープンリーグ (`cmo9k79fw01f68idrhz3vdapo`)

---

## Overview

Each tournament deck result gets an archetype label (e.g. `多龍巴魯托ex`, `火箭隊`, `呆呆王`).  
The label is used in:
- The **強勢分佈** (archetype distribution) pie/bar chart
- The per-deck badge in **成績排名**
- The Markdown export (`📋 複製為Markdown`)

---

## Priority Chain

Archetype resolution runs in priority order. The **first match wins**.

### Priority 0 — DB Cached Name (`cachedArchetypeName`)

The most accurate source. Written to the `decks` table when a user visits the deck-builder event page (`/deck-builder/event/[deckCode]`).

- **Field**: `decks.cachedArchetypeName` (also `decks.cachedAceName`, `decks.cachedNameAt`)
- **Written by**: `useEffect` in `apps/web/src/app/deck-builder/event/[deckCode]/page.tsx`
- **API endpoint**: `PATCH /api/v1/decks/code/:deckCode/meta`
- **Fire-and-forget**: one write per deck code lifetime (`useRef(false)` guard)

When cached, this name is used directly — no further inference happens.

### Priority 1 — DB `zhName` on Top-Quantity Pokémon ex

For decks not yet cached, resolve the archetype from the **highest-quantity non-support ex Pokémon** card in the deck.

**Conditions for a card to qualify**:
- `card.supertype === 'POKEMON'`
- `card.name` contains `'ex'`
- Has a `card.zhName` (linked ZH_TW card via `primaryCardId`)
- NOT in the support-card exclusion list (see below)

**How `zhName` is populated:**  
`hydrateDeckExtras()` in `tournaments.service.ts` batch-fetches ZH_TW names using each card's `primaryCardId`. The Prisma `card` select must include `primaryCardId: true` — this was added in fix `2026-04-23`.

**Support-card exclusion list** (`NOT_SUPPORT` inside `inferArchetype`):
```
キチキギスex, ラティアスex, ニャースex, リーリエのピッピex, ノコッチex, ゲノセクトex
```

If matched, `card.zhName` becomes the archetype label (e.g. `竹蘭的烈咬陸鯊ex`, `多龍巴魯托ex`, `呆呆王`).

### Priority 3 — JP Name Fallback

If no ZH name is found (card not yet linked in DB), use the JP name of the top-quantity ex Pokémon as a fallback.

**Known example from live page (before fixes):** `Nのゾロアークex`, `ブリジュラスex` — these showed JP names because `primaryCardId` was missing from the Prisma select. After the `2026-04-23` fix both cards have ZH links (`N的索羅亞克ex`, `鋁鋼橋龍ex`) and should resolve via Priority 1.

**When JP name persists despite ZH links existing:** If `cachedArchetypeName` was written (Priority 0) before the ZH link was scraped, the JP name stays cached forever. Clear it with:
```sql
UPDATE decks SET "cachedArchetypeName" = NULL, "cachedNameAt" = NULL WHERE "deckCode" = '<code>';
```

### Priority 4 — `其他`

If no Pokémon ex card exists with sufficient quantity, the deck falls back to `其他` (other).

---

## Composite Label (inferArchetypeParts)

In addition to the main archetype, the badge optionally shows:
- **Support**: A secondary Pokémon used as draw engine (e.g. `莉莉艾的皮皮ex`, `野野好友ex`)
- **ACE SPEC**: The ACE SPEC trainer card name

### ACE SPEC Resolution

1. **Priority 0**: `deck.cachedAceName` (from DB, written same time as `cachedArchetypeName`)
2. **Priority 1**: `card.rarity === 'ACE_SPEC_RARE'` in deck.cards — uses `card.zhName` if available (requires `primaryCardId` in Prisma select — fixed `2026-04-23`)
3. **Priority 2**: JP fragment → ZH fallback map (`ACE_SPEC_JP_MAP` in page.tsx)

**Stale `cachedAceName` issue:** If `cachedAceName` was written with a JP name (e.g. `ヒーローマント`) before ZH links existed, Priority 0 will always return JP. The only fix is clearing the DB cache manually.

### ACE_SPEC_JP_MAP (hardcoded fallback)

These entries cover the case where `card.zhName` is null (unlinked card) or `cachedAceName` is null:

| JP Fragment | ZH Display | HK Name Source |
|---|---|---|
| マキシマムベルト | 極限腰帶 | hk DB |
| プライムキャッチャー | 頂尖捕捉器 | hk DB |
| テラスタルオーブ | 太晶球 | hk DB |
| マスターボール | 大師球 | hk DB |
| アンフェアスタンプ | 不公印章 | hk DB |
| スターバース | 星誕生 | hk DB |
| はかせのロールプレイ | 博士的角色扮演 | hk DB |
| ハンディチップ | 手持晶片 | hk DB |
| VIPパス | VIP通行證 | hk DB |
| ライムのコスプレそうち | 萊姆的戲服裝置 | hk DB |
| ヒーローマント | 英雄斗篷 | hk10932 |
| ネオアッパーエネルギー | 新衝天能量 | hk10868 |
| シークレットボックス | 秘密箱 | hk11376 |

---

## Caching Pipeline

```
User visits /deck-builder/event/[deckCode]
  → page loads deck data from API
  → useEffect fires once (guarded by useRef)
    → computes archetypeName + aceName from deck.cards
    → PATCH /api/v1/decks/code/[deckCode]/meta { archetypeName, aceName }
      → decks table: cachedArchetypeName, cachedAceName, cachedNameAt = NOW()

Next tournament page load:
  → hydrateDeckExtras() fetches cachedArchetypeName + cachedAceName
  → Priority 0 wins — no further inference needed
```

**Stale cache risk**: The `useRef(false)` guard means the cache is written only **once per session** and never re-written. If a deck page was visited before:
1. The HK card was scraped (ZH name didn't exist yet)
2. The `primaryCardId` fix was deployed (2026-04-23)

…then `cachedArchetypeName` / `cachedAceName` may contain JP names permanently. Clear manually per deck code:
```sql
UPDATE decks SET "cachedArchetypeName" = NULL, "cachedAceName" = NULL, "cachedNameAt" = NULL
WHERE "deckCode" = '<deckCode>';
```

---

## DB Schema

```prisma
model Deck {
  cachedArchetypeName String?   // Main archetype label (ZH)
  cachedAceName       String?   // ACE SPEC label (ZH)
  cachedNameAt        DateTime? // Timestamp of last write
}
```

Migration: `20260422140906_add_cached_archetype_name`

---

## Why No Hardcoded JP→ZH Map

Previous versions used `ARCHETYPE_INFER_MAP` (JP fragment → ZH label) as a Priority 2 fallback. This was removed because:

1. **DB linking is the source of truth** — ZH_TW card names come from the HK card database. Any card released in HK has a ZH name in the DB linked via `primaryCardId`.
2. **Maintenance burden** — the map needed constant updates with new expansion releases.
3. **Cache covers uncached decks** — once any user visits a deck page, the name is permanently cached.
4. **Graceful degradation** — for JP-only 2026 cards (not yet released in HK), the JP name is shown, which is still meaningful.

**Critical fix (2026-04-23):** `primaryCardId` was missing from the Prisma `card` select in `tournaments.service.ts`. This silently broke Priority 1 for ALL tournaments — `zhMap` was always empty because `uniquePrimaryIds` was always `[]`. After adding `primaryCardId: true` to both `findById` and `findByEventId`, ZH names resolve correctly.

**Verified ZH links that were affected:**
| JP Name | ZH Name | HK webCardId |
|---|---|---|
| Nのゾロアークex | N的索羅亞克ex | hk13055, hk14693 |
| ブリジュラスex | 鋁鋼橋龍ex | hk11963 |
| ヒーローマント | 英雄斗篷 | hk10932 |
| ネオアッパーエネルギー | 新衝天能量 | hk10868 |
| シークレットボックス | 秘密箱 | hk11376 |

---

## Type Classification (Archetype Color Badge)

The archetype badge background color is determined by `getMainAttackerType()`:
- Finds the highest-quantity Pokémon with a `types` array (excludes support cards)
- Returns the first type entry (e.g. `PSYCHIC`, `DARK`)
- Maps to `TYPE_ARCHETYPE_BG` gradient classes

---

## Related Files

| File | Role |
|------|------|
| `apps/web/src/app/tournaments/[tournamentId]/page.tsx` | Main tournament page — inference logic, WeaknessSummary, 熱門用牌 |
| `apps/web/src/app/deck-builder/event/[deckCode]/page.tsx` | Deck page — cache write-back effect |
| `apps/api/src/decks/decks.service.ts` | `cacheArchetypeMeta()` DB write |
| `apps/api/src/decks/decks.controller.ts` | `PATCH /decks/code/:deckCode/meta` endpoint |
| `apps/api/src/tournaments/tournaments.service.ts` | `hydrateDeckExtras()` — loads `cachedArchetypeName` + `zhName`; requires `primaryCardId: true` in card select |
| `packages/database/prisma/schema.prisma` | `Deck` model with cached fields |

## Known Live Page Issues (as of 2026-04-23)

| Archetype Shown | Expected | Root Cause | Status |
|---|---|---|---|
| `Nのゾロアークex` | `N的索羅亞克ex` | `primaryCardId` missing from Prisma select + stale Priority 0 cache | Fixed in code; needs API restart |
| `ブリジュラスex` | `鋁鋼橋龍ex` | Same `primaryCardId` fix | Fixed in code; needs API restart |
| `ACE·ヒーローマント` | `ACE·英雄斗篷` | Same fix + added to `ACE_SPEC_JP_MAP` | Fixed |
| `ACE·ネオアッパーエネルギー` | `ACE·新衝天能量` | Same fix + added to `ACE_SPEC_JP_MAP` | Fixed |
| `ACE·シークレットボックス` | `ACE·秘密箱` | Same fix + added to `ACE_SPEC_JP_MAP` | Fixed |
| `火箭隊` | `火箭隊的超夢ex` | Stale `cachedArchetypeName` from old ARCHETYPE_INFER_MAP era | Priority 0 cache; acceptable |
