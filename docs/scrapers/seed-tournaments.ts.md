# seed-tournaments.ts — Documentation

**Source file:** `scrapers/seed-tournaments.ts`
**Last modified:** `2026-04-01 02:23`
**MD5:** `F1911873E0BC15954851E0CDFE3DC1A6`
**Summarised by model:** `Claude Sonnet 4.6`

Bulk-seeds tournament and deck data from scraped `event_data/` directories into the PTCG_2026 database. Reads local JSON files produced by the event scraper, upserts `Tournament`, `TournamentResult`, and `Deck` / `DeckCard` records.

---

## Usage

```bash
# Import up to 50 new events (default)
npx tsx scrapers/seed-tournaments.ts

# Import all events (no limit)
npx tsx scrapers/seed-tournaments.ts --all

# Import a specific event by ID
npx tsx scrapers/seed-tournaments.ts --event-id=952769

# Re-import already-existing events (overwrite)
npx tsx scrapers/seed-tournaments.ts --all --refresh-existing

# Dry-run: count what would be imported without writing to DB
npx tsx scrapers/seed-tournaments.ts --dry-run

# Use a custom event data root directory
npx tsx scrapers/seed-tournaments.ts --source-root=C:/path/to/event_data

# Verbose output (log missing card mappings per deck)
npx tsx scrapers/seed-tournaments.ts --verbose

# Combine flags
npx tsx scrapers/seed-tournaments.ts --all --refresh-existing --verbose
```

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--all` | off | Process every event directory, ignoring `--limit` |
| `--limit=N` | `50` | Max number of new events to import |
| `--event-id=ID` | — | Process only the directory whose `event_info.json` has this `event_id` |
| `--refresh-existing` | off | Re-process events already in DB (overwrite) |
| `--dry-run` | off | Report what would be imported without DB writes |
| `--source-root=PATH` | auto | Override the event data root directory |
| `--verbose` | off | Log per-deck missing card warnings |

---

## How It Works — Step by Step

### Step 1 — Resolve Event Data Root

Searches a priority-ordered list of candidate paths:

1. `--source-root` value (if supplied)
2. `C:/AI_Server/Coding/PTCG_CardDB/event_data`
3. `C:/AI_Server/Coding/PTCG_CardDB/1_Webscraper/event_data`
4. `../PTCG_CardDB/event_data` (relative to cwd)
5. `../PTCG_CardDB/1_Webscraper/event_data`

Throws if none of the candidates exist.

### Step 2 — Discover Event Directories

Reads all sub-directories starting with `event_` inside the resolved root, sorted alphabetically. When `--event-id` is supplied, filters to only the matching directory by reading each `event_info.json`.

### Step 3 — Per-Event: `seedEvent()`

For each event directory:

1. Reads `event_info.json` (skips if missing or has no `event_id`).
2. Falls back to `event_host` as title if `event_title` is empty.
3. Checks for an existing `Tournament` record with the same `eventId`:
   - **Exists + no `--refresh-existing`** → print `s` (skipped), continue.
   - **Exists + `--refresh-existing`** → update the tournament, delete old results, re-seed.
   - **Missing** → create a new tournament.
4. **Dry-run**: counts expected results and returns without any DB writes (prints `d`).

### Step 4 — Tournament Upsert

Builds the tournament record from `event_info.json` fields:

| DB field | Source |
|----------|--------|
| `eventId` | `event_id` |
| `name` | `event_title` (or `event_host` fallback) |
| `type` | `inferType(title)` — see below |
| `date` | `event_date` |
| `location` | `event_host + event_location + event_address` joined by `, ` |
| `region` | hardcoded `"JP"` |
| `playerCount` | `results.length` |
| `sourceUrl` | `event_url` |

### Tournament Type Inference (`inferType`)

| Keyword in title | Mapped type |
|-----------------|-------------|
| `シティリーグ` | `STORE_TOURNAMENT` |
| `チャンピオンズ` / `Championship` | `CHAMPIONSHIP` |
| `リージョナル` / `Regional` | `REGIONAL` |
| (default) | `STORE_TOURNAMENT` |

### Step 5 — Per-Result: `upsertDeckForResult()`

For each player result:

1. Looks for a deck file: first tries `deck_{deck_id}.json` (exact), then any `deck_*_{deck_id}.json` (fallback).
2. If no deck file found → logs `missingDeckFile`, creates the result without a deck link.
3. Checks DB for an existing `Deck` with `deckCode = deck_id`:
   - Found → reuse existing deck `id`.
   - Not found → `prisma.deck.create`.
4. Updates the deck row via raw SQL (`$executeRaw`) to set `name`, `deckCode`, `deckData` (raw JSON for the front-end fallback), and `updatedAt`.
5. Calls `syncDeckCards()` to replace all `DeckCard` rows.

### Step 6 — Card Resolution (`resolveImportedCardId`)

Resolves a `DeckCard` JSON entry to an internal `Card.id` via a three-priority lookup (cached in-memory):

| Priority | Strategy | Notes |
|----------|----------|-------|
| 1 (best) | `webCardId = "jp{card_id}"` | Exact print match |
| 2 | `imageUrl` exact match | Correct print when webCardId differs |
| 3 (fallback) | `name + language=JA_JP`, oldest webCardId | May match wrong print; used only as last resort |

### Step 7 — Deck Card Sync (`syncDeckCards`)

1. Deletes all existing `DeckCard` rows for the deck.
2. For each card in the deck JSON, resolves its internal `Card.id`.
3. Aggregates quantities by `cardId` (handles duplicate entries from the source data).
4. Bulk-inserts with `createMany`.

Missing card IDs (unresolvable) are collected and reported in the final summary.

---

## Output

Progress is printed inline with single characters:

| Character | Meaning |
|-----------|---------|
| `.` | Event successfully imported |
| `s` | Event skipped (already in DB) |
| `d` | Dry-run counted |
| `E` | Error — printed with stack trace |

Final summary:

```
============================================================
SEED COMPLETE
Imported: 42 | Skipped: 310 | Failed: 0
Results created: 1260 | Decks linked: 1198
Tournaments: 352 | Results: 10540 | Decks: 4821
Missing deck files: 12abc, 34def
Missing card matches: 7
  - 12abc: ピカチュウex (45678)
  ...
============================================================
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Three-priority card resolution | Maximises correct-print matches while falling back gracefully |
| In-memory `cardIdCache` | Avoids redundant DB lookups for the same card across multiple decks |
| Raw SQL for deck update | `$executeRaw` needed to update `deckData` as JSONB and `deckCode` in the same statement; Prisma ORM would require a schema migration |
| Delete + re-insert for `DeckCard` | Simpler than diffing; deck card lists are small and full replacement is safe |
| Progress dots on stdout | Allows monitoring a long run without scrolling through thousands of log lines |
| `--refresh-existing` off by default | Protects manually-edited tournament data from being overwritten on routine re-runs |

---

## Related Scripts

| Script | Purpose |
|--------|---------|
| `scrapers/_check-tournament-dates.ts` | Verify tournament dates were parsed correctly |
| `scrapers/_check-history.ts` | Check a player's tournament history across events |
| `scrapers/import-cards-direct.ts` | Import card catalogue (prerequisite: cards must exist before decks can be seeded) |
