# Battle Log Program Flow

> Overview: How a raw PTCG Live battle log moves through the system (parser → API → DB → UI)

---

## 1. Purpose 🎯
Document the end-to-end program flow for parsing, storing, and displaying battle logs and actions. This file is intended to be a developer reference for maintenance and future enhancements.

## 2. High-level components 🏗️
- **Parser** — apps/api/src/battles/battle-log-parser.ts
- **API** — apps/api (controller + service) that exposes endpoints for retrieving/re-parsing logs
- **Database** — Prisma schema in packages/database (persistent BattleLog + Action models)
- **Frontend** — apps/web/src/app/battles/[matchId]/components/BattleBoard.tsx

---

## 3. Backend: parsing flow (detailed) 🧭
1. **Raw log ingestion**
   - Source: scraped or uploaded raw battle log (stored on `BattleLog.raw` in DB).
   - Format: plain-text log from PTCG Live.

2. **Parser entry** (`battle-log-parser.ts`) 
   - `parse(rawText: string)` splits text into lines and iterates them.
   - For each candidate line, the parser:
     - Applies classification regexes to determine `actionType` (e.g., PLAY_POKEMON, ATTACH_ENERGY, PRIZE).
     - Extracts `cardName`, `player`, `details`, and timestamp when available.
     - Calls helper functions:
       - `extractMetadata()` — primary: parse coin toss & explicit metadata; fallback: scan actions for player names.
       - `getPlayerFromActionLine()` — robust regex-based detection of players from action content.
       - `parseTrainerAction()` — enhanced logic to classify TRAINER vs EVOLUTION plays (uses a small trainer list; consider consulting card DB for stronger classification).
     - Normalizes timestamps and sanitizes string fields.
   - Builds an ordered array of `Action` objects: { actionType, player, cardName, details, timestamp, metadata }.

3. **Winner inference & validation**
   - Winner determined by final PRIZE action or last decisive action when available.
   - Validates `player1`/`player2` via coin toss; uses action fallback if coin toss is missing or ambiguous.

4. **Persisting results**
   - Service layer (e.g., `battles.service`) persists parsed `actions` and `metadata` to the database using Prisma.
   - Important: JSONB fields may store `null` as JSON, so queries on JSON fields must account for SQL vs JSON null (see docs in repo about `= 'null'::jsonb`).

5. **Reparse endpoint**
   - POST `/api/v1/battles/:id/reparse` — re-runs the parser on the stored raw log and updates DB records.
   - Use it after parser improvements to reprocess historical logs.

**Important files**:
- Parser: `apps/api/src/battles/battle-log-parser.ts`
- Service: `apps/api/src/battles/battles.service.ts`
- Controller: `apps/api/src/battles/battles.controller.ts`

---

## 4. API endpoints (quick reference) 🔌
- GET `/api/v1/battles/:id`
  - Returns: `{ id, rawLog, metadata, actions: [ {actionType, player, cardName, details, timestamp, metadata}, ... ] }`
  - Used by: `BattleBoard` to populate the actions sidebar and timeline.

- POST `/api/v1/battles/:id/reparse`
  - Triggers parser re-run, updates DB, returns updated actions/metadata.
  - Example: `curl -X POST http://localhost:4000/api/v1/battles/cmlc0njzl00017y0rk2lurc1f/reparse`

---

## 5. Frontend flow (BattleBoard) 🖥️
**File:** `apps/web/src/app/battles/[matchId]/components/BattleBoard.tsx`

1. On mount, `useParams()` reads `matchId`.
2. `fetchActions()` calls GET `/api/v1/battles/:matchId` and populates `actions` state.
3. UI features implemented:
   - **Search** — filters actions by actionType, cardName, and details.
   - **Player filter** — All / Player1 / Player2.
   - **Timeline** — clickable strip of first N meta events (click to focus an action).
   - **Action list** — scrollable list; clicking an item opens inline details.
   - **Action details drawer** — displays metadata JSON and card thumbnail (best-effort URL mapping).
   - **Replay** — POST to `/reparse` to refresh actions after parser changes or to re-run recognition.

**Thumbnail strategy**: `getCardImageUrl(cardName)` forms a best-effort path: `/cards/<safe_name>.png`. This is a pragmatic fallback; recommended next step is a true mapping via the card database.

---

## 6. Data shapes 📐
**BattleAction (example)**
```json
{
  "actionType": "PLAY_POKEMON",
  "player": "Metal713",
  "cardName": "Charizard",
  "details": "Played as active",
  "timestamp": "00:02:10",
  "metadata": { "rawLine": "...", "position": 123 }
}
```

**BattleLog DB record (simplified)**
```json
{
  "id": "cml...",
  "raw": "<full raw log text>",
  "metadata": { "player1": "Metal713", "player2": "NeoNeo123", "winner": "NeoNeo123" },
  "actions": [ ...BattleAction[] ]
}
```

---

## 7. Edge cases & important notes ⚠️
- **Missing coin toss**: Parser uses fallback player extraction from action lines to avoid mis-assignments.
- **Trainer vs Evolution**: Simple whitelist in `parseTrainerAction()` helps accuracy; recommended improvement: consult card DB for deterministic classification.
- **JSON null vs SQL NULL**: When filtering JSONB columns in Postgres, remember: JSON null is `'null'::jsonb` while SQL NULL is `IS NULL`.

---

## 8. Commands & useful developer actions 🛠️
- Reparse a single battle (force re-run):

```bash
curl -X POST http://localhost:4000/api/v1/battles/<matchId>/reparse
```

- Quick fetch for testing (get first 30 actions):

```powershell
Invoke-WebRequest -Uri "http://localhost:4000/api/v1/battles/<matchId>" -UseBasicParsing | ConvertFrom-Json | Select-Object -ExpandProperty actions | Select-Object -First 30
```

---

## 9. Next recommended improvements ✅
1. Resolve `cardName` → canonical image path using the cards DB (preferred) instead of best-effort filename mapping.
2. Add optimistic UI + toast notifications for replay start/success/error.
3. Extract the actions sidebar into a dedicated component and add unit/integration tests.
4. Add a background job to reparse many historical logs when parser improvements land, and track progress in `ScraperJob`.

---

If you'd like, I can implement item **(1)** now — integrate a server-side image resolver endpoint (e.g. `/api/v1/cards/resolve-image?name=...`) and consume it from `BattleBoard`. Which next step should I start? 🔧
