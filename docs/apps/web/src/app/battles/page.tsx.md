# page.tsx — Documentation

**Source file:** `apps/web/src/app/battles/page.tsx`
**Last modified:** `2026-02-07 10:59`
**MD5:** `EB60E10B27257542FDFAA49D7F377501`
**Summarised by model:** `Claude Sonnet 4.6`

---

## Purpose

The Battle Replays page (`/battles`). Lists uploaded PTCG battle logs and allows users to upload new ones. Each entry links to an animated step-by-step replay viewer.

---

## Usage

```
Navigate to: /battles
```

---

## Step-by-Step Logic

### 1. Data Fetching

Single React Query: `GET /battles?take=50`.  
Returns a paginated list of `BattleLogDTO` objects.

### 2. Layout

```
Header (purple gradient) — title + total count
  └── Action Bar — Upload button
  └── Battle Grid — 3-column card grid
        └── BattleCard × N
  └── Empty state (if no battles)
Upload Dialog (modal overlay, when uploadOpen = true)
```

### 3. `BattleCard` Component

Each card links to `/battles/{battle.id}` and shows:
- **Player 1** name — highlighted green + 🏆 trophy if winner
- **VS** separator
- **Player 2** name — highlighted green + 🏆 trophy if winner
- Battle metadata: turn count, date played, format
- A play icon / CTA indicating it's watchable

Winner is determined by comparing `battle.winnerName` with `battle.player1Name` / `battle.player2Name`.

### 4. Upload Dialog (`UploadLogDialog`)

Triggered by the "Upload Battle Log" button. Modal component that:
1. Accepts a battle log file (plain text / `.txt` format)
2. POSTs the file contents to `POST /battles`
3. Invalidates the `['battles']` query on success
4. Closes on success or cancel

---

## `BattleLogDTO` Key Fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID |
| `player1Name` | `string` | |
| `player2Name` | `string` | |
| `winnerName` | `string \| null` | |
| `turnCount` | `number \| null` | Total turns played |
| `playedAt` | `string \| null` | ISO date |
| `format` | `string \| null` | e.g. `'Standard'` |

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/battles?take=50` | Fetch recent battle list |
| `POST` | `/battles` | Upload new battle log |

---

## Key Design Decisions

- **`take: 50` fixed** — No pagination on the listing page; the 50 most recent replays are always shown.
- **`BattleLogDTO` from `@ptcg/shared-types`** — Strongly typed shared DTO ensures the frontend and API agree on shape.
- **Winner highlight** — Visual winner cues (`text-green-600` + trophy) are computed purely from name equality with `winnerName`.

---

## Related Files

- `apps/web/src/app/battles/[id]/page.tsx` — Step-by-step animated battle replay
- `packages/shared-types/src/index.ts` — `BattleLogDTO` definition
- `apps/api/src/battles/battles.service.ts` — Battle log parsing and storage
- [docs/battle-log-program-flow.md](../../../../battle-log-program-flow.md) — Full battle log parsing flow documentation
