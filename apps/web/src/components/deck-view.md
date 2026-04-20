# deck-view.tsx — 功能說明 / Component Reference

共用元件，用於 `/deck-builder?deckId=...&mode=view` 和 `/deck-builder/event/:deckCode` 兩個頁面。

---

## 型別 / Types

| 型別 | 說明 |
|------|------|
| `AttackData` | 招式資料（名稱、傷害、費用、效果文字） |
| `AbilityData` | 特性資料（名稱、效果文字、類型）|
| `DeckCardDetail` | 單張卡牌完整資訊，含 `zhName`、`zhImageUrl`、`zhWebCardId` 等中文欄位 |
| `DeckCardEntry` | 卡牌＋數量，含港幣定價 `zhPricing`、`zhTiers`、使用者買價 `userPrice` |
| `SectionKey` | 牌組區塊鍵值（見下表）|
| `PokemonRole` | 寶可夢角色：`pokemon-main / secondary / support / evolution` |

---

## 常數 / Constants

### `SECTION_ORDER`
11 個區塊的顯示順序：
`pokemon-main → pokemon-secondary → pokemon-support → pokemon-evolution → supporter → item → ace → tool → stadium → basic-energy → special-energy`

### `SECTION_LABELS`（中文）
| SectionKey | 標籤 |
|---|---|
| pokemon-main | 主攻寶可夢 |
| pokemon-secondary | 副攻寶可夢 |
| pokemon-support | 輔助寶可夢 |
| pokemon-evolution | 進化鏈寶可夢 |
| supporter | 支援者 |
| item | 物品 |
| ace | ACE SPEC |
| tool | 寶可夢道具 |
| stadium | 競技場 |
| basic-energy | 基本能量 |
| special-energy | 特殊能量 |

### `SECTION_COLORS` / `SECTION_HEX`
每個區塊對應的 Tailwind class (`bg-*`) 和SVG用 hex 色碼。

### `WEAKNESS_TYPE_CONFIG` / `WEAKNESS_HEX`
11 種弱點屬性的 emoji、中文標籤、Tailwind 顏色和 SVG hex 色碼。

---

## SVG 輔助函式 / Chart Helpers

### `polarToCartesian(cx, cy, r, angleDeg)`
將極座標角度轉為 SVG 笛卡兒座標。

### `donutSegmentPath(cx, cy, outerR, innerR, startDeg, endDeg)`
回傳圓環扇形的 SVG `<path> d` 屬性字串（外圓弧 + 內圓弧反向連接）。

---

## 元件 / Components

### `DonutChart`
**純 SVG 環形餅圖，無外部相依。**

| Prop | 說明 | 預設值 |
|------|------|--------|
| `data` | `{ value, color, label }[]` — 各扇形資料 | — |
| `size` | SVG 寬高（px） | `80` |
| `thickness` | 環厚度（px） | `18` |
| `centerLabel` | 圓心文字 | — |

用於 `DeckSummary`（構成）和 `WeaknessSummary`（弱點分佈）。

---

### `maxDamage(attacks)`
計算招式列表中最高數字傷害值（忽略 `+` / `×` 等符號）。

### `isMainPokemon(entry)`
**主攻判斷**：數量 ≥ 3 或 HP ≥ 200 視為主攻。

### `hasSupportAbility(entry)`
內部輔助：有特性（abilities > 0）的非主攻寶可夢視為輔助。

### `getSectionKey(entry) → SectionKey`
從卡牌資料推斷應歸入哪個區塊（可被使用者角色設定覆蓋）：
- POKEMON：主攻 → `pokemon-main`；有特性 → `pokemon-support`；其他 → `pokemon-secondary`
- ENERGY：基本能量 / 特殊能量
- TRAINER：ACE SPEC / 支援者 / 物品 / 道具 / 競技場

### `sortSection(entries, section) → DeckCardEntry[]`
區塊內排序：數量降冪 → （寶可夢）HP 降冪 → 最高傷害降冪 → 名稱字母序。

---

### `DeckSummary`
**牌組頭部摘要，含構成圓餅圖和关键数值。**

Props: `entries`, `pricing`, `priceBreakdownHref`

顯示內容：
1. **構成圓餅圖** — 依 `getSectionKey()` 計算各區塊數量，SVG 環形圖 + 圖例（顏色點 + 標籤 + 張數）
2. **港幣價格** — 預算~高價範圍（有使用者買價時顯示藍色）
3. **最高 HP** — 顯示中文名
4. **最高傷害** — 顯示中文名

> 已移除「主力 / 輔助」統計框。

---

### `EffectsSummary`
顯示牌組中所有寶可夢特性的統計（最多 8 個）。

- 依特性名稱歸組，計算張數
- 顯示：特性名稱、總張數、所屬卡牌（優先顯示 `zhName`）

---

### `WeaknessSummary`
**弱點分佈圓餅圖。**

- 計算每種弱點屬性的寶可夢種類數（非張數）
- 龍屬性 / 無弱點寶可夢歸入「🐉 無弱點（龍）」
- 顯示：SVG 環形圖（圓心 = 總寶可夢種數）+ 圖例（顏色點 + 標籤 + 種數%）

---

### `DeckPriceBreakdown`
港幣定價明細表格，按寶可夢→訓練家→能量排序。

功能：
- 多版本圖片縮圖（最多 3 個價格層級）
- **我的買價**：可輸入自訂價格覆蓋最低價
- `handleSavePrices()`：批次 POST 買價至 `/prices` API（需要 `zhWebCardId`）
- 總計行顯示預算/高價總計

---

### `CardDetailModal`
點擊卡牌後的全螢幕遮罩彈窗。

顯示：
- 卡牌圖片（優先 `zhImageUrl`）
- 中文名稱（優先 `zhName`）、HP、最高傷害、稀有度
- 招式列表（名稱、傷害、效果）
- 進化階段、屬性、數量
- 連結到完整卡牌頁面 `/cards/:webCardId`

---

### `CopyDeckModal`
複製比賽牌組到個人牌組的彈窗。

流程：輸入名稱 → POST `/decks`（含 60 張卡牌）→ 成功後跳轉或關閉。

---

### `CardTile`
**牌組中單張卡牌的縮圖格，包含懸停提示卡。**

顯示：
- 卡牌圖片（優先 `zhImageUrl`）
- 卡牌名稱（優先 `zhName`）
- 數量徽章（區塊色）、HP 徽章、最高傷害徽章
- 角色切換按鈕（主攻/副攻/輔助/進化鏈），僅寶可夢且有 `onRoleChange` 時顯示

**懸停提示（深色主題）**：
- 出現在卡牌右側 (`left-full`)，z-index 100
- 顯示：特性（藍色「特性」標籤 + 效果文字）、招式（名稱/傷害/效果）、弱點/抵抗力
- 無特性/招式/弱點時不顯示提示

---

### `DeckSection`
標準單欄區塊：標籤 + 「X 種 · Y 張」統計 + `CardTile` 網格。

空區塊不渲染（`entries.length === 0` 時 `return null`）。

---

### `PairedPokemonSection`
主攻（A）+ 進化鏈（B）並排雙欄，中間細分隔線。

- 只有 A：全寬 12 欄網格
- A+B 並排：A 較寬（6欄），B 較窄（6欄）

---

### `PairedSection`
訓練家用並排雙欄（支援者+競技場 / 物品+道具等）。

---

## 佈局圖 / Layout (Event Page)

```
┌─ 標題區塊 (bg-slate-700/60) ─────────────────────────────┐
│  牌組名稱 + 原型名稱 + ACE 標籤          比賽日期          │
│  ─────────────────────────────────────────────────────── │
│  [DeckSummary：構成圓餅 + 港幣價格 + 最高HP + 最高傷害]    │
│  ─────────────────────────────────────────────────────── │
│  效果摘要 (EffectsSummary)  │  弱點摘要 (WeaknessSummary) │
└──────────────────────────────────────────────────────────┘
[PairedPokemonSection：主攻 | 進化鏈]
[DeckSection：副攻]
[DeckSection：輔助]
[DeckSection：ACE SPEC]
[PairedSection：支援者 | 競技場]
[PairedSection：物品 | 道具]
[PairedSection：基本能量 | 特殊能量]
```
