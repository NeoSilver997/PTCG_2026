# Deck Meta-Summary Feature

This document describes the new deck meta-summary feature that provides comprehensive analysis of Pokemon TCG deck archetypes, popular cards, and meta statistics.

## Overview

The deck meta-summary feature analyzes tournament data to show:
- **Top Cards**: Most frequently used cards across all tournament decks
- **Pokemon Type Meta**: Win rates and performance metrics by Pokemon type
- **Deck Archetypes**: Primary Pokemon types used in winning decks
- **Deck Composition Statistics**: Average card distribution across all tournament decks
- **Regional Filtering**: View data for specific regions (JP, HK, EN) or all regions

## Architecture

### Backend Service
**File**: `apps/api/src/tournaments/tournaments.service.ts`
**Method**: `getDeckMetaSummary(regionRaw?: string, limitRaw?: string)`

Performs SQL analysis using PostgreSQL window functions to:
1. Calculate top cards by total frequency and deck count
2. Analyze Pokemon type distribution with win rates
3. Compute average deck composition statistics
4. Identify primary archetypes by Pokemon type

### API Endpoint
**File**: `apps/api/src/tournaments/tournaments.controller.ts`
**Route**: `GET /api/v1/tournaments/meta/deck-summary`
**Query Parameters**:
- `region` (optional): Filter by region ('JP', 'HK', 'EN')
- `limit` (optional): Max cards to return (default: 25, max: 100)

### Frontend Page
**File**: `apps/web/src/app/deck-builder/meta-summary/page.tsx`
**Route**: `/deck-builder/meta-summary`
**Port**: `http://localhost:3001`

Provides:
- Region filter dropdown
- Dashboard with deck statistics cards
- Responsive tables and charts showing meta analysis
- Card frequency rankings with deck percentages
- Type distribution with win rate visualization

## Usage

### 1. Start the Services

```bash
# Terminal 1: Start API server (port 4000)
cd C:\AI_Server\Coding\PTCG_2026
pnpm --filter @ptcg/api dev

# Terminal 2: Start Web app (port 3001)
pnpm --filter web dev
```

### 2. Access the Meta Summary

Open your browser to:
```
http://localhost:3001/deck-builder/meta-summary
```

### 3. Query the API Directly

```bash
# Get meta summary for all regions
curl http://localhost:4000/api/v1/tournaments/meta/deck-summary

# Get meta summary for Japan only
curl "http://localhost:4000/api/v1/tournaments/meta/deck-summary?region=JP"

# Get meta summary with 50 top cards
curl "http://localhost:4000/api/v1/tournaments/meta/deck-summary?limit=50"

# Combine filters
curl "http://localhost:4000/api/v1/tournaments/meta/deck-summary?region=HK&limit=30"
```

## Data Structure

### Response Format

```json
{
  "region": "ALL",
  "topCards": [
    {
      "cardId": "hk00014744",
      "name": "Pikachu ex",
      "imageUrl": "...",
      "supertype": "POKEMON",
      "subtypes": ["BASIC"],
      "frequency": 1234,
      "deckCount": 856
    }
  ],
  "typeDistribution": [
    {
      "pokemonType": "ELECTRIC",
      "deckCount": 342,
      "avgPlacement": 4.5,
      "winRatePercent": 24.3
    }
  ],
  "deckStats": {
    "totalDecks": 15876,
    "avgPokemon": 12.4,
    "avgTrainer": 28.2,
    "avgEnergy": 14.8,
    "avgCardsTotal": 60.1
  },
  "archetypes": [
    {
      "primaryType": "ELECTRIC",
      "archetypeName": "ELECTRIC",
      "deckCount": 3421,
      "avgPlacement": 5.2
    }
  ]
}
```

## Performance Metrics

- **Top Cards Query**: O(n) scan with aggregation - typically < 500ms for 400k+ deck cards
- **Type Distribution**: Window function aggregation - typically < 300ms
- **Archetype Analysis**: Requires unnest operations - typically < 800ms
- **Total Response**: Usually completes in 1-2 seconds

## Features

### Dashboard Statistics
- **Total Decks**: Count of all tournament-competing decks in database
- **Avg Pokemon**: Average number of Pokemon cards per deck
- **Avg Trainer**: Average number of Trainer cards per deck
- **Avg Energy**: Average number of Energy cards per deck
- **Total Cards/Deck**: Average total cards per deck (should be ~60)

### Pokemon Type Meta Table
- Shows all Pokemon types with 5+ deck appearances
- **Win Rate %**: Percentage of top 8 placements using that type
- **Avg Placement**: Average tournament placement (lower is better)
- **Deck Count**: How many decks use this Pokemon type

### Top Cards Table
- Ranked by total card frequency (sum of quantities)
- Shows deck percentage: how many decks include this card
- Sortable by frequency, deck count, or supertype
- Images provided via imageUrl (loaded via Next.js Image component)

### Archetype Analysis
- Primary Pokemon type of decks (first type in type array)
- Archetype popularity and performance
- Average placement metric for meta performance

## Debugging

### API Not Responding
```bash
# Check if API server is running
curl http://localhost:4000/health
```

### No Data Showing
1. Verify tournament data has been seeded:
   ```bash
   npm run events:import:new
   # or
   npm run events:import:repair-all
   ```

2. Check database connectivity via:
   ```bash
   cd packages/database
   pnpm db:studio
   ```

### Stale Data
Clear browser cache or use network tab to force-reload:
```
Ctrl + Shift + R (Windows/Linux)
Cmd + Shift + R (Mac)
```

## Future Enhancements

- [ ] Chart visualizations for type meta over time
- [ ] Card combo statistics (frequently paired cards)
- [ ] Deck list export for top archetypes
- [ ] Comparative analysis between regions
- [ ] Recent meta shifts (week-over-week changes)
- [ ] Streaming data updates for live tournaments

## Note about Port Configuration

The original URL request mentioned `http://localhost:3333`, but PTCG_2026 actually uses:
- **Web App**: `http://localhost:3001` (Next.js frontend)
- **API Server**: `http://localhost:4000` (NestJS backend)

The meta-summary page at `/deck-builder/meta-summary` runs on the web app port (3001) and fetches data from the API server (4000).

If you need the web app to run on port 3333, update `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

And change the Next.js port in `package.json`:
```json
"dev": "next dev -p 3333"
```
