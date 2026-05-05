# page.tsx — Documentation

**Source file:** `apps/web/src/app/pokemon/page.tsx`
**Last modified:** `2026-04-23 08:02`
**MD5:** `D96C8A90722370801FB2EA611887A23F`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

The Pokédex page (`/pokemon`). Displays all known Pokémon species, grouped by evolution chain, with card count badges per language. Clicking a species navigates to a detail view showing all cards for that Pokémon.

---

## Usage

```
Navigate to: /pokemon
```

---

## Key Data Type — `SpeciesSummary`

```typescript
interface SpeciesSummary {
  id: string;
  dexNumber: string;
  form: string;
  nameZhHant: string;   // Traditional Chinese
  nameZhHans: string;   // Simplified Chinese
  nameJa: string;       // Japanese
  nameEn: string;       // English
  latestZhImage: string | null;   // Most recent ZH_TW card image
  latestZhCardId: string | null;
  cardCounts: Record<string, number>; // e.g. { JA_JP: 12, ZH_TW: 5, EN_US: 3 }
  evolvesFrom: string | null;   // Name of pre-evolution (any language)
  evolutionStage: string | null; // BASIC | STAGE_1 | STAGE_2 | …
}
```

---

## Step-by-Step Logic

### 1. Data Fetching

Single React Query: `GET /pokemon/species` → returns `SpeciesSummary[]`.  
Results are cached for the session (default stale time).

### 2. Evolution Chain Building (`buildEvolutionChains`)

1. Build four lookup maps keyed by each name field (`nameJa`, `nameZhHant`, `nameZhHans`, `nameEn`).
2. For each species, walk `evolvesFrom` links upward via `findRoot()` to locate the chain's root, avoiding infinite loops with a `visited` Set.
3. Group all species by their root's `id` into a `Map<string, SpeciesSummary[]>`.
4. Emit chains in `dexNumber` order; members within a chain sorted by `dexNumber` then `form`.

**Why multi-language resolution?** The `evolvesFrom` field is scraped from various sources and may be in any of the four languages — the lookup tries all four in priority order (JA → ZH-Hant → ZH-Hans → EN).

### 3. Filtering (client-side)

Two filter controls:
- **Text search** — matches against `nameZhHant`, `nameJa`, `nameEn` (case-insensitive substring).
- **Stage filter** — filters by `evolutionStage` enum value.

Filtering happens inside a `useMemo` on the full species list before chain grouping.

### 4. Rendering

Each evolution chain renders horizontally, showing member `SpeciesCard` components side-by-side.

**`SpeciesCard`** shows:
- Pokémon image (or placeholder with dex number)
- Name in ZH-Hant
- Evolution stage badge (coloured pill from `STAGE_LABEL` map)
- `LangCounts` — tiny flag+count badges per language

**`LangCounts`** renders 🇯🇵/🇹🇼/🇺🇸 badges when `cardCounts[lang] > 0`.

### 5. Navigation

Clicking a `SpeciesCard` routes to `/pokemon/[id]` (detail page) via `useRouter().push`.

---

## Evolution Stage Labels

| Stage | Display | Colour |
|-------|---------|--------|
| `BASIC` | たね | green |
| `STAGE_1` | 1進化 | blue |
| `STAGE_2` | 2進化 | purple |
| `STAGE_3` | 3進化 | red |
| `BABY` | よちよち | yellow |
| `RESTORED` | 化石 | amber |
| `VSTAR` | VSTAR | pink |
| `VMAX` | VMAX | pink |

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/pokemon/species` | All species summaries with card counts |

---

## Key Design Decisions

- **Client-side chain grouping** — The API returns a flat list; chain assembly is done in the browser to keep the API simple.
- **Multi-language `evolvesFrom` resolution** — Required because scraper data inconsistently stores the pre-evolution name in different languages depending on source.
- **`latestZhImage`** — The most recent ZH_TW card image is used as the species thumbnail (preferring ZH_TW over JP for visual consistency on the HK/TW audience).

---

## Related Files

- `apps/web/src/app/pokemon/[id]/page.tsx` — Species detail with all card variants
- `apps/api/src/pokemon/pokemon.service.ts` — Species aggregation query
