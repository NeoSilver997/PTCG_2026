# PTCG Effect Tag System — Study & Integration Guide

## Overview

This document summarises the **effect tag classification system** developed in `PTCG_CardDB_Tc` (`ptcg_processor.py`) and maps it against the current **PTCG_2026 PostgreSQL/Prisma schema** to identify the gap and a path for integration.

---

## 1. Effect Tag System (PTCG_CardDB_Tc)

### Source
- **File:** `PTCG_CardDB_Tc/ptcg_processor.py` — `classify_single_effect()`, `classify_card_effects()`
- **Input fields analysed:** `AbilityDesc`, `Skill1Effect`, `Skill2Effect` (Traditional Chinese text)
- **Output:** Two comma-separated tag columns appended to each card row

### Two-Tier Tag Model

```
Card Text (raw TW/HK Chinese)
  └─► classify_single_effect()
        ├─► Primary Effect Tags   (主要效果類型)  — WHAT the card does
        └─► Special Effect Tags   (特殊效果類型)  — HOW it does it (modifiers)
```

---

## 2. Primary Effect Tags (主要效果類型)

Grouped into 17 functional categories with their point value in the rating system:

| Category (EN) | Category (ZH) | Tags | Score |
|---|---|---|---|
| **Resource Acquisition** | 資源獲取 | 抽卡效果, 搜索效果 | 3–4 |
| **Resource Management** | 資源管理 | 能量操作, 能量附著, 特殊能量, 牌庫操作, 能量回收, 牌庫重洗 | 2–3 |
| **Damage Output** | 傷害輸出 | 傷害效果, 條件傷害, 昏厥條件, 反噬傷害, 連鎖傷害, 無視弱點/效果 | 3–4 |
| **Status Control** | 狀態控制 | 狀態異常, 傷害指示物, 狀態施加, 簡單灼傷, 弱點改變 | 2–3 |
| **Random Effects** | 隨機效果 | 硬幣判定 | 1–2 |
| **Support Effects** | 支援效果 | 物品效果, 支援者效果, 道具使用規則 | 2–3 |
| **Position Control** | 位置控制 | 切換效果, 撤退干擾, 撤退封鎖 | 2–3 |
| **Recovery** | 恢復效果 | 回復效果, 狀態恢復 | 2 |
| **Defense** | 防禦效果 | 傷害防禦, 效果免疫, 弱點消除, 屬性防禦, 全體防禦, 傷害減免, 特定寶可夢防禦, 高額傷害減免 | 3–4 |
| **Disruption** | 干擾效果 | 道具消除, 招式封鎖, 附著干擾, 道具移除, 物品卡封鎖, 能量需求增加 | 3–4 |
| **Intelligence** | 情報效果 | 情報收集 | 2 |
| **Evolution** | 進化效果 | 進化支援 | 3 |
| **Resource Control** | 資源控制 | 獎賞控制 | 2 |
| **Conditional Effects** | 條件效果 | 條件傷害, 備戰傷害加成, 條件失敗, 連續技, 棄牌區傷害加成, 能量條件 | 2–3 |
| **Restriction** | 限制效果 | 使用限制, 招式鎖定, 支援者限制 | 1 |
| **Amplification** | 增幅效果 | HP提升 | 2 |
| **Field Effects** | 場地效果 | 場地增幅 | 2 |
| **Special Effects** | 特殊效果 | 招式複製, 招式複製對手, 其他效果 | 2 |

**Total registered primary tags:** 58+

---

## 3. Special Effect Tags (特殊效果類型)

Modifiers that co-exist with primary tags, representing high-impact mechanics:

| Tag (ZH) | Category (ZH) | Category (EN) | Score |
|---|---|---|---|
| 大量抽卡 | 大量資源 | Mass Draw (4+ cards) | 5 |
| 丟棄效果 | 資源破壞 | Discard Opponent's Cards | 4 |
| 撤退效果 | 撤退控制 | Retreat Mechanism | 3 |
| 放置效果 | 位置操作 | Place Pokémon on Bench/Active | 3 |
| 進化效果 | 進化支援 | Evolution Mechanic | 3 |
| 競技場效果 | 場地控制 | Stadium Card Effect | 4 |
| 特性效果 | 特性效果 | Ability Effect | 3 |
| 狀態免疫 | 狀態免疫 | Status Immunity | 4 |

---

## 4. Detection Logic Summary

`classify_single_effect(effect: str)` scans the raw Chinese effect text with keyword matching:

| Trigger Keywords | → Tag Applied |
|---|---|
| `抽取/抽出/加入手牌` + `牌庫` | → `抽卡效果` (if <4 cards) or `大量抽卡` |
| `從/選擇` + `牌庫/棄牌區` | → `搜索效果` |
| `附上/附加/移除` + `能量` | → `能量操作` |
| `中毒/燃燒/麻痺/睡眠/混亂` | → `狀態異常` |
| `硬幣` + `擲` | → `硬幣判定` |
| `切換/互換` | → `切換效果` |
| `恢復/回復` + `HP/傷害` | → `回復效果` |
| `不會受到/無法使用` + `傷害` | → `傷害防禦` |
| `道具/物品` + `消除/移除` | → `道具消除` |
| `若/在這個回合` + `增加/點傷害` | → `條件傷害` |
| `備戰寶可夢也受到` + `傷害` | → `連鎖傷害` |
| `傷害不計算/不計算弱點` | → `無視弱點/效果` |
| `下個自己的回合` + `無法使用招式` | → `使用限制` |
| `在上個回合` + `才可使用` | → `連續技` |
| `撤退` + `增加/所需的能量` | → `撤退干擾` |
| `棄牌區` + `張數×` + `傷害` | → `棄牌區傷害加成` |
| `傷害「-80/傷害「-100` | → `高額傷害減免` |
| *(no match)* | → `其他效果` |

---

## 5. PTCG_2026 Database — Current State

### Prisma Card Model (relevant fields)

```prisma
model Card {
  abilities    Json?   // Array of { name, type, text/description }
  attacks      Json?   // Array of { name, cost[], damage, effect/text }
  text         String? // Free-text card rule box
  rules        String[] // Rule strings
  // ...
}
```

### AbilityDto Structure
```typescript
{ name?: string; type?: string; text?: string; description?: string; }
```

### AttackDto Structure
```typescript
{ name?: string; cost?: string[]; damage?: string; effect?: string; text?: string; }
```

### What is Missing

| Feature | PTCG_CardDB_Tc | PTCG_2026 DB |
|---|---|---|
| Raw effect text | ✅ `Skill1Effect`, `AbilityDesc` | ✅ `attacks[].effect`, `abilities[].text` |
| Primary effect tags | ✅ `主要效果類型` column (CSV) | ❌ Not stored |
| Special effect tags | ✅ `特殊效果類型` column (CSV) | ❌ Not stored |
| Rating/tier score | ✅ `Tier`, `Score` columns | ❌ Not stored |
| Effect-based filtering | ✅ Via CSV processing | ❌ No API filter |

---

## 6. How the Rating System Uses Effect Tags

Card score is built from 8 components, capped at different maximums:

```
Score = (base + meta + expansion + function + synergy + effect + damage) × rarity_modifier
```

| Component | Source | Max |
|---|---|---|
| `base_score` | CardType (支援者卡=8, 物品卡=7, …) | — |
| `meta_score` | Hardcoded S/A/B tier card name list | 6 |
| `expansion_score` | Expansion code (SV6–SV11=S_TIER, …) | 3 |
| `function_score` | Keyword scan of raw text | 10 |
| `synergy_score` | Name/text pattern checks | 7 |
| `effect_score` | **Primary + Special tags lookup** | **12** |
| `damage_score` | Skill damage parsing (30–450+ damage) | 8 |
| `rarity_modifier` | Rarity multiplier (0.9–1.3) | × |

**Tier thresholds:**

| Tier | Score |
|---|---|
| S+ | ≥ 26 |
| S | ≥ 23 |
| A+ | ≥ 20 |
| A | ≥ 17 |
| B+ | ≥ 14 |
| B | ≥ 11 |
| C+ | ≥ 9 |
| C | ≥ 7 |
| D | < 7 |

---

## 7. Integration Roadmap (PTCG_2026)

### ✅ Implemented — Effect Tags on `PrimaryCard`

Effect tags belong on `PrimaryCard`, **not** `Card`, because all language variants (JA_JP, ZH_HK, EN_US) of the same card share identical game mechanics.

```prisma
model PrimaryCard {
  // ... existing fields ...
  effectTags         String[]  // Primary effect tags e.g. ["抽卡效果", "搜索效果"]
  specialEffectTags  String[]  // Special effect tags e.g. ["大量抽卡"]
  effectScore        Float?    // Pre-computed effect score (0–12)
  cardTier           String?   // S+/S/A+/A/B+/B/C+/C/D

  @@index([effectTags])        // GIN index for array contains queries
  @@index([cardTier])
}
```

**Migration applied:** `20260413000000_add_effect_tags_to_primary_card`

#### Why PrimaryCard (not Card)

| Concern | Reasoning |
|---|---|
| Same card, 3 languages | JA 「ゲッコウガex」, ZH 「甲賀忍蛙ex」, EN 「Greninja ex」 all have the same attacks |
| `skillsSignature` already lives here | Dedup key is on PrimaryCard — effect tags are the semantic extension of it |
| Avoids 3× data redundancy | One tag update propagates to all language variants automatically |
| API filter stays simple | `WHERE 'effectTags' && '{"搜索效果"}'` on primary_cards — no JOIN fan-out |

---

## 8. Key Files Reference

| File | Role |
|---|---|
| `PTCG_CardDB_Tc/ptcg_processor.py` | Core classifier — `classify_single_effect()`, `classify_card_effects()`, `rate_card()` |
| `PTCG_CardDB_Tc/add_effect_columns.py` | Standalone script that writes `主要效果類型`/`特殊效果類型` to CSV |
| `PTCG_CardDB_Tc/backup_scripts/card_rating_system.py` | Standalone rating system (precursor to `ptcg_processor.py`) |
| `PTCG_CardDB_Tc/CARD_EFFECT_CLASSIFICATION_README.md` | Full Chinese-language documentation of all 58 primary tag rules |
| `PTCG_2026/packages/database/prisma/schema.prisma` | Prisma schema — `Card.abilities Json?`, `Card.attacks Json?` |
| `PTCG_2026/apps/api/src/cards/dto/update-card.dto.ts` | `AbilityDto` / `AttackDto` TypeScript shapes |

---

## 9. Example Mappings (PTCG_CardDB_Tc → PTCG_2026)

| PTCG_CardDB_Tc field | PTCG_2026 equivalent |
|---|---|
| `AbilityDesc` | `card.abilities[n].text` |
| `Skill1Effect` | `card.attacks[0].effect` |
| `Skill2Effect` | `card.attacks[1].effect` |
| `Skill1Damage` | `card.attacks[0].damage` |
| `主要效果類型` | ❌ (not yet stored) |
| `特殊效果類型` | ❌ (not yet stored) |
| `Tier` / `Score` | ❌ (not yet stored) |
