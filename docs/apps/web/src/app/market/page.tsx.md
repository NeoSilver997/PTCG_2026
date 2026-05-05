# page.tsx — Documentation

**Source file:** `apps/web/src/app/market/page.tsx`
**Last modified:** `2026-04-17 07:25`
**MD5:** `00BBB31DC5CDC5FB548B068A2D931524`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

The Market page (`/market`). A multi-tab price tracking dashboard that aggregates card prices from multiple sources (Yuyu-tei, Hareruya, Beehive TCG HK, etc.), shows price movers, in-stock items, and lets users look up or add prices for individual cards.

---

## Usage

```
Navigate to: /market
```

---

## Tabs

| Tab Key | Label | Content |
|---------|-------|---------|
| `browse` | Browse | All recent prices across sources, sortable and filterable |
| `movers` | Movers | Cards with the biggest price change over a period |
| `stock` | In Stock | Cards currently marked as in-stock |
| `lookup` | Lookup | Price history for a specific card by webCardId |

Active tab is controlled by `activeTab` state.

---

## Step-by-Step Logic

### 1. Browse Tab

**Filters:**

| State | Type | Notes |
|-------|------|-------|
| `nameFilter` | `string` | Card name substring |
| `stockFilter` | `'all'│'in'│'out'` | In-stock status |
| `minPrice` | `number` | Minimum price (0 = off) |
| `hideBelow10` | `boolean` | Hide prices under 10 |
| `sortField` | `'price'│'fetchedAt'` | Sort column |
| `sortDir` | `'asc'│'desc'` | Sort direction |
| `regulationMarks` | `string[]` | Toggleable mark filter (H/I/J default selected) |
| `browseSkip` | `number` | Pagination offset |

**Page size:** `PAGE_SIZE = 50`.

Calls `GET /prices` with active filters. Each `RecentPriceRow` shows card image, name, source badge, price, stock status, and regulation mark.

### 2. Movers Tab

Shows cards with the largest price change over a configurable period.

| State | Default | Notes |
|-------|---------|-------|
| `moverDays` | `28` | Period: 28 / 90 / 180 days |
| `moverSupertype` | `''` | Pokémon / Trainer / Energy filter |
| `moverPokemonType` | `''` | Type filter (when Pokémon selected) |
| `moverSortBy` | `'price'` | Sort by price or % change |
| `moverSkip` | `0` | Pagination |

**Page size:** `MOVERS_PAGE_SIZE = 50`.

Each `PriceMover` shows: card name, source, first price → last price, % change (colour-coded: red = up, green = down for buyers).

### 3. Stock Tab

Filtered view of `GET /prices?inStock=true`. Same grid as Browse tab.

### 4. Lookup Tab

User enters a `webCardId` into `lookupId`. Triggers `GET /prices/{cardId}` which returns full price history.

Displays:
- Card thumbnail + name
- All current prices grouped by source
- Historical price chart (sparkline or table)

**Custom price entry form** (when in lookup mode):
- Fields: price, currency (`HKD`), condition (`NM`), in-stock toggle, stock quantity
- Calls `POST /prices` (mutation). Shows a 3-second success flash on completion.

---

## Price Sources

| Enum | Display |
|------|---------|
| `YUYU_TEI` | Yuyu-tei |
| `HARERUYA` | Hareruya |
| `CARDMARKET` | Cardmarket |
| `TCGPLAYER` | TCGPlayer |
| `OTHER` | Beehive TCG HK |

---

## Source Colour Badges

| Source | CSS |
|--------|-----|
| `YUYU_TEI` | `bg-red-100 text-red-700` |
| `HARERUYA` | `bg-blue-100 text-blue-700` |
| `CARDMARKET` | `bg-green-100 text-green-700` |
| `TCGPLAYER` | `bg-yellow-100 text-yellow-700` |
| `OTHER` | `bg-amber-100 text-amber-700` |

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/prices` | Browse/movers/stock tabs |
| `GET` | `/prices/{cardId}` | Single card price history |
| `POST` | `/prices` | Add a custom price entry |

---

## Key Design Decisions

- **`regulationMarks` toggle** — Users can narrow the market view to Standard-legal cards (H/I/J) or expand to legacy sets. Default includes H/I/J.
- **Multi-tab layout** — Separates use cases: casual browsing, trend analysis, stock checking, and individual card lookup.
- **Custom price entry** — Enables community-driven pricing (e.g. local store prices not scraped automatically).
- **`hideBelow10` toggle** — Filters out noise from bulk/common cards in browse view.

---

## Related Files

- `apps/api/src/prices/prices.service.ts` — Price query and aggregation
- `scrapers/src/` — Price scraper scripts (Yuyu-tei, etc.)
