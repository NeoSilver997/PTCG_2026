# page.tsx — Documentation

**Source file:** `apps/web/src/app/inventory/page.tsx`
**Last modified:** `2026-03-20 07:38`
**MD5:** `30F6D798095969C7D997454653F74BF4`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

The Inventory page (`/inventory`). A personal card collection manager that lets users track which physical cards they own, in what quantity, and in what condition. Supports adding, removing, and exporting collection data.

---

## Usage

```
Navigate to: /inventory
```

---

## Step-by-Step Logic

### 1. Data Fetching

React Query: `GET /inventory?skip=N&take=50`.  
Page size is 50. Pagination controlled by `page` state.

### 2. Collection Items

Each `CollectionItem` contains:
```typescript
interface CollectionItem {
  id: string;
  cardId: string;
  quantity: number;
  condition?: string;   // 'NM' | 'LP' | 'MP' | 'HP' | 'DAMAGED'
  notes?: string;
  card: {
    webCardId: string; name: string; imageUrl?: string;
    supertype?: string; types?: string[]; rarity?: string;
  };
}
```

### 3. Add Card Flow

1. "Add Card" button toggles `showAddForm`.
2. Form fields: `addCardId` (webCardId), `addQty` (number), `addCondition` (from `CONDITIONS` enum).
3. Submit calls `upsertMutation` → `POST /inventory` with `{ cardId, quantity, condition }`.
4. On success: clears form, hides it, invalidates `['inventory']` query.

**`CONDITIONS`:** `['NM', 'LP', 'MP', 'HP', 'DAMAGED']`

### 4. Remove Card

Delete button on each row calls `removeMutation` → `DELETE /inventory/{cardId}`.  
On success: invalidates `['inventory']` query.

### 5. CSV Export (`handleExportCSV`)

Generates a CSV with columns: `Card ID, Name, Supertype, Rarity, Quantity, Condition, Notes`.  
Values are double-quote escaped. Downloaded as `inventory.csv`.

### 6. Pagination

Previous/next buttons rendered when `totalPages > 1`. Page resets when filters change.

### 7. Rarity Colour Map

Text colour classes per rarity:

| Rarity | CSS |
|--------|-----|
| `COMMON` | `text-gray-500` |
| `UNCOMMON` | `text-green-600` |
| `RARE` | `text-blue-600` |
| `DOUBLE_RARE` | `text-purple-600` |
| `ILLUSTRATION_RARE` | `text-pink-600` |
| `SPECIAL_ILLUSTRATION_RARE` | `text-red-600` |
| `ULTRA_RARE` | `text-yellow-600` |
| `HYPER_RARE` | `text-orange-600` |

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/inventory?skip=N&take=50` | Paginated collection list |
| `POST` | `/inventory` | Add/upsert card (by cardId + quantity) |
| `DELETE` | `/inventory/{cardId}` | Remove card from collection |

---

## Key Design Decisions

- **Upsert on add** — `POST /inventory` uses upsert semantics; adding a card that already exists increments its quantity rather than creating a duplicate entry.
- **No search filter** — The inventory page shows only the user's own collection; search/filter complexity is deferred.
- **CSV export** — Provides a portable format for external tools (spreadsheets, trading platforms) without requiring an API export endpoint.

---

## Related Files

- `apps/api/src/inventory/inventory.service.ts` — Collection upsert and list logic
- `apps/web/src/app/cards/page.tsx.md` — Card search (for finding `webCardId` to add to inventory)
