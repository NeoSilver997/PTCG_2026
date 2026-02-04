# Field Comparison: Japan vs Hong Kong vs English

## Sample Cards (Same Card - Ludicolo)
- **Japan**: jp48347 - ルンパッパ
- **Hong Kong**: hk14471 - 樂天河童
- **English**: en22131 - Ludicolo

## Field-by-Field Comparison

| Field | Japan (JP) | Hong Kong (HK) | English (EN) | Status |
|-------|------------|----------------|--------------|--------|
| **webCardId** | `jp48347` | `hk14471` | `en22131` | ✅ All have unique IDs |
| **name** | `ルンパッパ` | `2階進化樂天河童` | `Stage 2Ludicolo` | ❌ HK/EN include evolution stage in name |
| **language** | `JA_JP` | `ZH_HK` | `EN_US` | ✅ Correct |
| **region** | `JP` | `HK` | `EN` | ✅ Correct |
| **supertype** | `POKEMON` | `POKEMON` | `POKEMON` | ✅ Correct |
| **variantType** | `NORMAL` | `NORMAL` | `NORMAL` | ✅ Correct |
| **rarity** | `UNCOMMON` | `COMMON` | `COMMON` | ⚠️ Different rarities for same card |
| **expansionCode** | `m2` | `M2F` | `me0w` | ❌ Inconsistent format (m2 vs M2F vs me0w) |
| **collectorNumber** | `007/080` | `007/080` | ❌ Missing | ⚠️ EN missing collector number |
| **imageUrl** | `https://www.pokemon-card.com/...` | `https://asia.pokemon-card.com/hk/...` | `https://asia.pokemon-card.com/hk-en/...` | ✅ Different domains per region |
| **sourceUrl** | `https://www.pokemon-card.com/...` | `https://asia.pokemon-card.com/hk/...` | `https://asia.pokemon-card.com/hk-en/...` | ✅ Different domains per region |
| **scrapedAt** | `2026-02-04T07:27:13` | `2026-02-04T07:37:29` | `2026-02-04T07:29:36` | ✅ Timestamp present |
| **hp** | `160` | `160` | `160` | ✅ Correct |
| **pokemonTypes** | `["GRASS"]` | ❌ Missing | ❌ Missing | ❌ HK/EN don't extract types |
| **evolutionStage** | `STAGE_2` | `BASIC` | `BASIC` | ❌ HK/EN detect wrong stage |
| **evolvesTo** | `ルンパッパ, ハスブレロ, ハスボー` | ❌ Missing | ❌ Missing | JP only |
| **pokedexNumber** | `272` | ❌ Missing | ❌ Missing | JP only |
| **flavorText** | `高さ：1.5 m 重さ：55.0 kg` | ❌ Missing | ❌ Missing | JP only |
| **weakness** | `{"type":"FIRE","value":"×2"}` | `{"type":"FIRE","value":"×2"}` | `{"type":"FIRE","value":"×2"}` | ✅ Correct |
| **retreatCost** | `2` | `2` | `2` | ✅ Correct |
| **abilities** | `[{"name":"エキサイトヒール","description":"..."}]` | `[{"name":"激動治癒","description":"..."}]` | `[{"name":"Excited Heal","description":"..."}]` | ⚠️ Same ability, different languages |
| **attacks** | `[{"name":"つきたおし","cost":"草無","damage":"120"}]` | `[{"name":"[特性] 激動治癒",...},{"name":"撞倒","cost":"GrassGrassColorlessColorless","damage":"120"}]` | `[{"name":"[Ability] Excited Heal",...},{"name":"Lunge Out","cost":"GrassGrassColorlessColorless","damage":"120"}]` | ❌ HK/EN mix abilities with attacks |

## Critical Issues to Fix

### 🔴 High Priority
1. **Missing `pokemonTypes` in HK/EN**
   - JP extracts: `["GRASS"]`
   - HK/EN: Not extracted at all

2. **Wrong `evolutionStage` in HK/EN**
   - JP: `STAGE_2` ✅
   - HK/EN: `BASIC` ❌ (reads from wrong part of page)

3. **Card name pollution in HK/EN**
   - JP: `ルンパッパ` ✅
   - HK: `2階進化樂天河童` ❌ (includes "2階進化" = Stage 2)
   - EN: `Stage 2Ludicolo` ❌ (includes "Stage 2")

4. **Abilities mixed with attacks in HK/EN**
   - HK/EN put abilities in attacks array with `[特性]`/`[Ability]` prefix
   - Should be filtered into separate `abilities` array only

### 🟡 Medium Priority
5. **Attack cost format inconsistency**
   - JP: `"草無"` (Japanese symbols)
   - HK/EN: `"GrassGrassColorlessColorless"` (English words, duplicated)

6. **Expansion code inconsistency**
   - JP: `m2` (lowercase)
   - HK: `M2F` (has F suffix)
   - EN: `me0w` (incorrect - should be ME01 or ME02)

7. **Missing collector number in EN**
   - JP/HK: Have it
   - EN: Missing

### 🟢 Low Priority (JP-only fields)
8. **evolvesTo** - JP only
9. **pokedexNumber** - JP only
10. **flavorText** - JP only

## Recommended Actions

1. Fix HK/EN scrapers to extract `pokemonTypes` from type icons
2. Fix evolution stage parsing (remove from name, detect from correct HTML element)
3. Clean card names (strip evolution stage prefix)
4. Separate abilities from attacks properly
5. Standardize expansion code extraction
6. Fix collector number extraction for EN
7. Consider standardizing attack cost to Japanese symbols or database enum
