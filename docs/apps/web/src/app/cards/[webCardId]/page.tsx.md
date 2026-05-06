# page.tsx — Documentation

**Source file:** `apps/web/src/app/cards/[webCardId]/page.tsx`
**Last modified:** `2026-05-06 21:07`
**MD5:** `4486E1C5F495DFBE09569943E8D3294C`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

Card detail page (`/cards/[webCardId]`). Displays full information for a single card identified by its `webCardId` (e.g., `jp45279`). Supports multi-variant browsing (arrow navigation through language/variant siblings), evolution chains, related decks, pricing, and effect-tag metadata.

---

## Usage

```
Navigate to: /cards/jp45279
Navigate to: /cards/hk18409
```

---

## Data Flow

### API Endpoint
`GET /api/v1/cards/web/:webCardId`

Returns a `CardDetail` object containing:

| Field | Source | Notes |
|-------|--------|-------|
| `webCardId`, `name`, `supertype`, etc. | `Card` model | Core card fields |
| `collectorNumber` | `Card.collectorNumber` | Full per-print number, e.g. `"062/071"` |
| `primaryCard` | `PrimaryCard` include | Contains `cardNumber` (number only), `primaryExpansion`, `pokemonSpecies`, effect tags |
| `regionalExpansion` | `RegionalExpansion` include | The regional expansion for this specific print |
| `languageVariants` | Sibling `Card` rows | Same `primaryCardId`, different language/variantType. Fields: `id, webCardId, name, language, variantType, rarity, collectorNumber, imageUrl, regionalExpansion` |
| `sameSpeciesCards` | Other `PrimaryCard`s for same `PokemonSpecies` | Other sets of the same Pokémon |
| `relatedCards` | `CardRelation` | Bidirectional synergy/combo links |

### Key Design: `collectorNumber` vs `cardNumber`

| Field | Location | Example | Purpose |
|-------|----------|---------|---------|
| `Card.collectorNumber` | `Card` (per-print) | `"062/071"` | Per-set collector number including total, displayed as 卡片編號 |
| `PrimaryCard.cardNumber` | `PrimaryCard` (canonical) | `"020"` | Number-only used as canonical key; fallback when `collectorNumber` is null |

A reprint card (e.g., プライムキャッチャー appearing in sv5M as 062/071 and in SVN as 020/...) has the correct number on `Card.collectorNumber`, not on `PrimaryCard.cardNumber`.

---

## Variant Navigation System

### `allVariants` Array
```typescript
const allVariants = card ? [card, ...(card.languageVariants || [])] : [];
```
Index 0 = the loaded card; indices 1–N = sibling variants from the API.

### Navigation State
- `currentVariantIndex: number` — tracks which variant is displayed
- `currentVariant` = `allVariants[currentVariantIndex]`
- Arrow buttons (◀ ▶) cycle through `allVariants` wrapping at boundaries

### Variant-Aware Fields
When `currentVariantIndex > 0`, `currentVariant` is a `languageVariants` entry (limited fields). UI elements that depend on variant context use the pattern:

```tsx
currentVariant?.collectorNumber || card.collectorNumber || card.primaryCard.cardNumber
```

The same precedence pattern applies to expansion display:
```tsx
currentVariant?.regionalExpansion?.primaryExpansion?.code
  || currentVariant?.regionalExpansion?.code
  || preferredProduct?.productName
  || card.regionalExpansion?.primaryExpansion?.code
  || ...
```

---

## UI Sections

### Image Panel (left column)
| Element | Description |
|---------|-------------|
| Card image | `currentVariant.imageUrl` or placeholder |
| ◀ / ▶ buttons | Appear when `allVariants.length > 1`. Cycle variant index |
| Bottom overlay label | `{expansionCode} #{collectorNumber} {idx+1}/{total}` — uses `currentVariant.collectorNumber` |
| Edit / Tournament links | Static action buttons below image |

### Basic Info (right column top)
- Card name from `currentVariant.name`
- Supertype, ruleBox, type, rarity badges
- `卡號` (webCardId with source link)
- `擴展包` with link to products page — uses `currentVariant.regionalExpansion`
- HP, language, variant type, artist
- Evolution stage fields

### 招式 / 特性 (Attacks / Abilities)
Rendered from `card.attacks` and `card.abilities` JSON fields. Always reads from the loaded `card` (not `currentVariant`) since siblings only carry `imageUrl`.

### 其他版本 (Language Variants Grid)
Grid of `card.languageVariants`. Each card shows:
- Thumbnail image
- Expansion code (`primaryExpansion.code || code`)
- Language label
- `webCardId`
- `variantType`

### 資料 (Metadata section)
| Label | Value source |
|-------|-------------|
| 擴展包 | `currentVariant.regionalExpansion?.primaryExpansion?.code` → fallback chain |
| 卡片編號 | `currentVariant.collectorNumber \|\| card.collectorNumber \|\| card.primaryCard.cardNumber` |
| 發行日期 | `card.primaryCard.primaryExpansion.releaseDate \|\| preferredProduct.releaseDate` |
| 地區 | `card.region` |
| 建立時間 | `card.createdAt` |

### Evolution Chain
- `evolvesFromCards` and `evolvesToCards` fetched by name search
- Rendered as card thumbnails with navigation links

### 相關賽事牌組 (Related Decks)
Top-N decks using this card from `GET /cards/web/:webCardId/related-decks`.

### 同名卡 / 其他版本 (Same-Name Cards)
Cards with identical name but different attacks (Pokémon) or different effect text (Trainers) are excluded as likely duplicates.

### 同物種其他卡 (Same-Species Cards)
Cards linked via `PokemonSpecies` FK. Falls back to a fuzzy name match if species is unset.

---

## Preferred Product Resolution

```typescript
const preferredProduct = relatedProducts.find(p =>
  COUNTRY_PREF[cardLanguage].some(k => p.country.toLowerCase().includes(k))
) || relatedProducts.find(p => p.releaseDate) || relatedProducts[0];
```

Used for: 擴展包 display name fallback, release date, and product link.

---

## Related Files

| File | Purpose |
|------|---------|
| `apps/api/src/cards/cards.service.ts` — `getCardByWebCardId()` | API query that assembles the full `CardDetail` response |
| `apps/web/src/app/cards/[webCardId]/edit/page.tsx` | Edit form for card metadata |
| `packages/database/prisma/schema.prisma` | `Card.collectorNumber`, `PrimaryCard.cardNumber` definitions |
| `scrapers/populate-collector-numbers.ts` | One-time backfill script for `Card.collectorNumber` from JSON files |
