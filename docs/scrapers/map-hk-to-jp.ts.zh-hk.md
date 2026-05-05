# map-hk-to-jp.ts — 技術文件

**原始檔案：** `scrapers/map-hk-to-jp.ts`

將資料庫中香港版（`ZH_TW`）卡牌對應至日本版（`JA_JP`）的同一張卡，方法是讓雙方共用同一個 `PrimaryCard` 記錄。

---

## 使用方法

```bash
# 試跑模式（預設）— 只顯示報告，不修改資料庫
npx tsx scrapers/map-hk-to-jp.ts

# 套用變更（需要互動確認）
npx tsx scrapers/map-hk-to-jp.ts --apply

# 套用變更（略過確認提示）
npx tsx scrapers/map-hk-to-jp.ts --apply --yes
```

---

## 運作邏輯 — 逐步說明

### 第一步 — 載入 JSON 來源檔案

腳本依以下優先順序載入已爬取的卡牌資料：

| 優先順序 | 資料夾 | 檔案前綴 |
|---------|--------|---------|
| 1（最高） | `data/cards/japan/` | `japanese_cards_40k_*` |
| 2 | `data/cards/japan/` | `japanese_cards_*`（非 40k） |
| 3（備用） | `.`（根目錄） | `japanese_cards_*` |

香港卡牌從 `data/cards/hongkong/` 載入，前綴為 `hk_cards_*`。

載入時套用兩個標準化函式：
- `normalizeExpansion(code)` — 將擴充包代碼轉為大寫（例如 `sv9` → `SV9`）
- `normalizeCollector(coll)` — 移除收藏編號的分母部分（例如 `001/100` → `001`）

### 第二步 — 建立日本版查找表

兩個記憶體內 `Map` 結構以不同鍵值索引所有日本卡牌：

| 查找表 | 鍵值格式 | 用途 |
|-------|---------|------|
| `jpLookup` | `擴充包:收藏編號:變體類型` | 含變體類型的精確比對 |
| `jpLookupAny` | `擴充包:收藏編號` | 不考慮變體類型的備用比對 |

先到先得（40k 檔案優先於非 40k，非 40k 優先於根目錄檔案）。

### 第三步 — 查詢資料庫

使用 `Promise.all` 平行從資料庫取得香港版（`ZH_TW`）和日本版（`JA_JP`）卡牌，選取欄位包括：

- 識別欄位：`id`、`webCardId`、`primaryCardId`、`variantType`
- 可同步欄位：`rarity`、`regulationMark`、`subtypes`、`evolvesFrom`、`artist`、`ruleBox`
- 關聯：`primaryCard → primaryExpansion.code`

### 第四步 — 100% 覆蓋率篩選器

在嘗試任何配對前，腳本先計算每個擴充包的配對率。只有當某擴充包內**全部** HK 卡牌都能在 JP JSON 來源中找到對應時，該擴充包才符合連結資格。此機制防止不完整或錯誤的配對。

以下兩個擴充包被強制排除，不論表面配對率為何：

| 代碼 | 原因 |
|------|------|
| `SVK` | HK 收藏編號為 JP 的子集；直接以編號配對會產生錯誤 |
| `SVHK` | 相同的偏移問題；由專用修復腳本處理 |

### 第五步 — 逐張卡牌配對迴圈

對資料庫中每張香港版卡牌，腳本依序執行：

1. 在 HK JSON 來源中查找該卡（`hkSrcByWebId`）。若找不到 → 記入 `notInJsonHK`。
2. 若該擴充包不在 `fullMatchExpansions` 中則略過 → 計入 `skippedNon100`。
3. 先嘗試**精確**變體比對（`jpLookup`），再退回**任意**變體比對（`jpLookupAny`）。若都找不到 → 計入 `unmatchedHK`。
4. **寶可夢圖鑑交叉驗證**（僅限寶可夢牌）：若兩張卡都有 `pokedexNumber` 且數值不同，記錄 `pokedexMismatch` 警告，但**仍繼續進行配對** — HK 的圖鑑編號資料已知不可靠。
5. 在資料庫中查找已配對的 JP 卡（`jpDbByWebId`）。若找不到 → 計入 `noJPInDB`。
6. 檢查 HK 卡是否已指向正確的 JP `PrimaryCard` → 計入 `alreadyLinked`。

### 第六步 — 計算需同步的欄位

每對配對卡牌計算兩組同步欄位：

#### JP → HK（JP 為權威來源 — 永遠覆寫）
| 欄位 | 規則 |
|------|------|
| `rarity` | JP 值不同時覆寫 |
| `variantType` | JP 值不同時覆寫 |
| `regulationMark` | JP 值不同時覆寫 |

#### JP → HK（補值模式 — 不覆寫現有資料）
| 欄位 | 規則 |
|------|------|
| `artist` | 僅在 HK 值為 null/空白時寫入 |
| `evolvesFrom` | 僅在 HK 值為 null/空白時寫入 |
| `ruleBox` | 僅在 HK 值為 null/空白時寫入 |
| `subtypes` | 僅在 HK 陣列為 null/空白時寫入 |

#### HK → JP（反向同步）
| 欄位 | 規則 |
|------|------|
| `regulationMark` | 僅在 JP 值為 null/空白時寫入 JP |

HK 爬蟲有抓取 `regulationMark`；JP 爬蟲沒有 — 此反向同步用於填補這個缺口。

---

## 試跑報告範例

不加 `--apply` 執行時，輸出格式如下：

```
============================================================
RESULTS
============================================================
HK cards in DB:                4823
HK cards in source JSON:       4756

Matches found:
  ✅ Already correctly linked:  3201
  🔗 To be linked:              1422
     (of which Pokédex ✓):      1398

Skipped / problems:
  ℹ️  Skipped (non-100% expansions):    133
  ⚠️  HK dex data issues (matched anyway): 24
  ⚠️  No JP match in JSON:               12
  ⚠️  JP match in JSON but not DB:        8
  ⚠️  HK card not in source JSON:        67

Fields to sync from JP → HK:
  rarity: 540 cards
  regulationMark: 210 cards

Fields to sync from HK → JP:
  regulationMark: 89 cards
```

---

## 套用模式

加上 `--apply` 執行時：

1. **確認提示** — 顯示資料庫變更總數，需輸入 `yes` 確認（加 `--yes` 可略過）。
2. **批次更新** — HK 卡牌以 200 張為一批，在 `prisma.$transaction` 內更新：
   - `primaryCardId` 設定為 JP 卡的 `PrimaryCard` ID。
   - 計算出的 `syncFields` 同步套用於同一次更新。
3. **反向同步** — 缺少 `regulationMark` 的 JP 卡以 HK 資料更新，同樣以 200 張為一批。
4. **孤立記錄清理** — 重新連結後，任何已成為 HK 專屬（現在沒有任何卡牌指向）的 `PrimaryCard` 記錄將被刪除。

---

## 關鍵設計決策

| 決策 | 理由 |
|------|------|
| 只連結覆蓋率 100% 的擴充包 | 避免部分配對產生錯誤連結 |
| 圖鑑編號不符僅為警告，不阻止配對 | HK 來源資料的圖鑑編號常有錯誤；收藏編號是更可靠的識別依據 |
| JP 為 `rarity` / `variantType` 的權威來源 | JP 為原版發行；HK 為地區性翻印版 |
| 反向同步 `regulationMark`（HK → JP） | JP 爬蟲未抓取此欄位；HK 爬蟲有抓取 |
| 批次大小 200 | 平衡交易大小與記憶體用量 |
| 明確排除 `SVK` / `SVHK` | 這兩個系列 HK 與 JP 的收藏編號存在偏移；由專用修復腳本處理 |

---

## 相關腳本

| 腳本 | 用途 |
|------|------|
| `_fix_svk_hk_mappings.ts` | SVK 擴充包的人工配對（收藏編號有偏移） |
| `_fix_svhk_hk_mappings.ts` | SVHK 擴充包的人工配對（收藏編號有偏移） |
| `_check_sc_linking.ts` | 套用後驗證 HK→JP 連結完整性 |
| `_check_unlinked.ts` | 找出仍未配對到 JP 卡的 HK 卡牌 |
