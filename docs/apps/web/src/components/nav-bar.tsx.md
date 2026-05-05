# nav-bar.tsx — Documentation

**Source file:** `apps/web/src/components/nav-bar.tsx`
**Last modified:** `2026-05-02 22:00`
**MD5:** `8F261167D90BE888FEC90642EB1E57C1`
**Summarised by model:** `Claude Sonnet 4.6`

A reusable React component that renders the main navigation bar for the entire application. It uses Next.js's `usePathname` hook to determine the active link and applies conditional styling accordingly.

---

## Usage

This component should be placed at the root of the layout structure (`<Layout />` or similar) to ensure it is always visible across all pages.

```tsx
import { NavBar } from '@/components/nav-bar';

// ... inside your layout component
<NavBar />
```

### Props

The component is purely presentational and accepts no props.

---

## How It Works — Step by Step

### 1. State and Context

- **`usePathname()`**: Hooks into Next.js routing to get the current URL path (`pathname`).
- **`navLinks` Array**: A hardcoded array of objects defining all available navigation links (`{ href: string, label: string }`).

### 2. Rendering Logic

The component maps over the `navLinks` array to render a series of `Link` components.

- **Active State Detection**: The `active` boolean determines if the current `pathname` matches the link's `href`. It uses a robust check: `pathname === href` OR (`href !== '/'` AND `pathname.startsWith(href)`). This ensures that sub-routes (e.g., `/cards/pokemon`) correctly highlight the parent link (`/cards`).
- **Styling**: Conditional Tailwind CSS classes are applied:
    - **Active**: `bg-blue-600 text-white`
    - **Inactive**: `text-slate-400 hover:bg-slate-700 hover:text-slate-200`

### 3. Structure

The layout is contained within a sticky, fixed-position `<nav>` element, ensuring it remains visible while scrolling.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **`usePathname` Hook** | Provides the most reliable way to determine the current route within a Next.js application. |
| **`Link` Component** | Uses Next.js `Link` for client-side routing, ensuring fast transitions without full page reloads. |
| **Active Path Logic** | The `pathname.startsWith(href)` check is crucial for nested routes (e.g., `/cards/pokemon` should activate the `/cards` link). |
| **Fixed Structure** | The links are hardcoded in an array for simplicity and centralized management, making it easy to add/remove links in one place. |

---

## Related Components

| Component | Purpose |
|-----------|---------|
| `CardList` | The component that consumes the filtered state and displays the results. |
| `FilterPanel` | The component that manages the filter state and communicates changes to the parent. |
| `Layout` | The wrapper component that should render `<NavBar />` to ensure global visibility. |
