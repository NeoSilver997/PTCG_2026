# page.tsx — Documentation

**Source file:** `apps/web/src/app/products/page.tsx`
**Last modified:** `2026-04-12 23:11`
**MD5:** `AA1575F4608D7F31FB3D39C8ED6A9EE0`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

The Products page (`/products`). A browsable catalog of PTCG physical products (booster packs, boxes, decks, promos) scraped from retailer sites. Supports country, product type, name search, and expansion code filtering. Includes an admin-triggered import button.

---

## Usage

```
Navigate to: /products
```

---

## Step-by-Step Logic

### 1. Filters

| State | Type | Default | Notes |
|-------|------|---------|-------|
| `country` | `string` | `''` | JP / HK / EN / TW / etc. |
| `productTypeGroup` | `string` | `'expansion_series'` | Category group |
| `search` | `string` | `''` | Product name search |
| `codeSearch` | `string` | `''` | Expansion code search |
| `skip` | `number` | `0` | Pagination offset |

Page size (`take`) is fixed at 120.

### 2. Data Fetching

Uses `useEffect` (not React Query) directly calling `apiClient.get<ProductsResponse>`.

**Module-level cache (`_productsCache`):**  
A `Map<string, { data, ts }>` stores results keyed by serialised query params.  
Cache TTL: **5 minutes**. If a matching cache entry exists and is fresh, it is used without making an API call.

This is distinct from React Query's cache — it persists across re-mounts within the same browser session (module scope).

### 3. Product Grid Rendering

Each `Product` card shows:
- Product image (with fallback placeholder)
- Product name
- Price (if available)
- Release date (if available)
- Country badge
- Product type label (`productType.nameZh ?? nameEn`)
- Expansion code chip
- External link button (opens `product.link` in new tab)

### 4. Import Trigger

An "Import" button (admin area, top-right) calls `POST /products/import`.  
Displays inline result: `imported: N, skipped: N, errors: N`.  
Re-fetches the product list after a successful import.

### 5. Pagination

Previous/next buttons rendered at bottom when `totalPages > 1`. Filter changes reset `skip` to 0.

### 6. Filter Reset

`handleReset()` restores all filter state to defaults (country=`''`, productTypeGroup=`'expansion_series'`, etc.).

---

## `Product` Interface

```typescript
interface Product {
  id: string;
  country: string;
  productName: string;
  price: string | null;
  releaseDate: string | null;
  code: string | null;
  imageUrl: string | null;
  link: string | null;
  productType: {
    id: string; code: string;
    nameJa: string; nameZh: string; nameEn: string;
  } | null;
}
```

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/products?country=...&productTypeGroup=...&search=...&expansionCode=...&skip=N&take=120` | Filtered product list |
| `POST` | `/products/import` | Trigger product re-scrape/import |

---

## Key Design Decisions

- **Default `productTypeGroup: 'expansion_series'`** — Lands users on booster packs/expansion boxes by default, the most queried product type.
- **Module-level cache** — Unlike React Query, this cache survives React tree unmounts (e.g. navigating away and back). Avoids redundant requests for the same filters within the same browser session.
- **`useEffect` + manual fetch** — Predates the project's move to React Query; older pattern that could be migrated.
- **Import button on page** — Provides a convenient admin trigger without requiring a separate admin panel visit.

---

## Related Files

- `apps/api/src/products/products.service.ts` — Product query and import logic
- `data/chinese_products.json` — Seed data for Chinese-region products
