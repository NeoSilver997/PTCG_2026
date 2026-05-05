# filter-panel.tsx — Documentation

**Source file:** `apps/web/src/components/filter-panel.tsx`
**Last modified:** `2026-05-02 22:00`
**MD5:** `8F261167D90BE888FEC90642EB1E57C1`
**Summarised by model:** `Claude Sonnet 4.6`

A reusable React component responsible for rendering the filtering UI for card listings (e.g., on the main card search page). It manages the state of active filters (Type, Rarity, Supertype, etc.) and communicates changes via props or context.

---

## Usage

This component should be placed within a page component that manages the card search state.

```tsx
import FilterPanel from '@/components/filter-panel';

// ... inside your page component
<FilterPanel
  initialFilters={initialFilters}
  onFilterChange={handleFilterChange}
/>
```

### Props

| Prop | Type | Description |
|---|---|---|
| `initialFilters` | `FilterState` | The initial state object containing all active filter values. |
| `onFilterChange` | `(filters: FilterState) => void` | Callback function executed when any filter selection changes. |

---

## How It Works — Step by Step

### 1. State Management

The component manages its internal state using `useState` to hold the current filter values, which are derived from the `initialFilters` prop.

### 2. Filter Grouping

The UI is logically grouped by card attributes:

- **Supertype**: Filters by `POKEMON`, `TRAINER`, `ENERGY`.
- **Type**: Filters by `PokemonType` (e.g., FIRE, WATER).
- **Rarity**: Filters by `Rarity` (e.g., ULTRA_RARE, COMMON).
- **Supertype/Subtype**: Filters specific to Trainer/Energy cards (e.g., `SUPPORTER`, `ITEM`).
- **Evolution Stage**: Filters for Pokémon stages (`BASIC`, `STAGE_1`, `STAGE_2`).

### 3. Filter Interaction

Each filter group uses a combination of `select` (for single-choice filters like Supertype) and `checkbox` (for multi-select filters like Type or Rarity).

- **Change Handler**: The `handleFilterChange` function is the single point of truth for state updates. It receives the new filter state object and calls the `onFilterChange` prop callback, notifying the parent component to re-fetch or re-filter the card list.

### 4. UI/UX Considerations

- **Visual Feedback**: Active filters are displayed prominently at the top, allowing users to see the current filter combination.
- **Clear Filters**: A "Clear All" button is provided to reset the state to default values.
- **Performance**: The component is designed to be lightweight, only managing UI state and callbacks, leaving the heavy lifting of filtering/API calls to the parent component.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Prop-driven State** | By accepting `initialFilters` and using `onFilterChange`, the component is highly reusable and decoupled from the parent's state management. |
| **Grouping** | Grouping filters by card type (Supertype, Type, Rarity) improves user discoverability and reduces cognitive load. |
| **Single Change Handler** | Centralizing state updates in `handleFilterChange` ensures that all filter changes are processed consistently before notifying the parent. |
| **Filter Persistence** | The parent component is responsible for persisting the filter state (e.g., in URL query params or local storage). |

---

## Related Components

| Component | Purpose |
|-----------|---------|
| `CardList` | The component that consumes the filtered state and displays the results. |
| `CardDetailModal` | Used to show full details when a card is clicked. |
| `FilterState` | The TypeScript interface defining the structure of all possible filters. |
