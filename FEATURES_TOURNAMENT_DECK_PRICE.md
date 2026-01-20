# New Features Added - Tournament, Deck & Price Tracking

## ✅ Database Schema Extensions

### 1. Tournament Management
**New Tables:**
- `Tournament` - Pokemon tournament events
  - Event ID, name, type, date, location, region
  - Source URL tracking
  - Age groups (Masters, Seniors, Juniors)
  
- `TournamentResult` - Player standings
  - Player name, placement, deck info
  - Links to deck lists
  - Archetype classification

**Enums:**
- `TournamentType`: CHAMPIONSHIP, REGIONAL, SPECIAL_EVENT, STORE_TOURNAMENT, ONLINE_EVENT
- `DeckArchetype`: AGGRO, CONTROL, COMBO, MIDRANGE, TOOLBOX, OTHER

### 2. Deck Management
**New Tables:**
- `Deck` - Deck lists (user or tournament)
  - Name, description, archetype, format
  - Public/private visibility
  - User ownership (nullable for tournament decks)
  
- `DeckCard` - Cards in decks
  - Quantity tracking
  - Unique constraint per deck-card pair

**Features:**
- 60-card deck validation
- 4-of rule checking
- Import tournament decks to user collection
- Share decks publicly

### 3. Market Price Tracking
**New Tables:**
- `CardPrice` - Current market prices
  - Source (Yuyu-tei, Hareruya, CardMarket, TCGPlayer)
  - Price, currency (JPY default)
  - Stock availability
  - Condition tracking
  
- `PriceHistory` - Historical pricing
  - Daily price snapshots
  - Source-specific tracking
  - Time-series data for charts

**Enums:**
- `PriceSource`: YUYU_TEI, HARERUYA, CARDMARKET, TCGPLAYER, OTHER

---

## 🎯 API Endpoints

### Tournaments Module
```
GET    /api/v1/tournaments                      - List tournaments (filtered)
GET    /api/v1/tournaments/:id                  - Tournament details
GET    /api/v1/tournaments/:id/results          - Tournament standings
POST   /api/v1/tournaments/scrape               - Trigger tournament scraper
GET    /api/v1/tournaments/stats                - Meta-game statistics
GET    /api/v1/tournaments/search/player/:name  - Find player's results
```

**Query Parameters:**
- `type` - Tournament type filter
- `region` - Region filter (HK, JP, EN)
- `dateFrom` / `dateTo` - Date range
- `playerName` - Search by player
- `skip` / `take` - Pagination

### Decks Module
```
GET    /api/v1/decks                           - User's deck lists
POST   /api/v1/decks                           - Create new deck
GET    /api/v1/decks/:id                       - Deck details with cards
PATCH  /api/v1/decks/:id                       - Update deck info
DELETE /api/v1/decks/:id                       - Delete deck
POST   /api/v1/decks/:id/cards                 - Add card to deck
DELETE /api/v1/decks/:id/cards/:cardId         - Remove card
POST   /api/v1/decks/:id/validate              - Validate deck legality
POST   /api/v1/decks/import/tournament/:resultId - Copy tournament deck
```

**Validation Rules:**
- Exactly 60 cards total
- Max 4 copies per card (except Basic Energy)
- Format-specific banlists (Standard/Expanded)

### Prices Module
```
GET    /api/v1/prices/card/:id                 - Current prices from all sources
GET    /api/v1/prices/card/:id/history         - Historical price data
GET    /api/v1/prices/compare/:id              - Price comparison table
POST   /api/v1/prices/scrape                   - Trigger price update job
POST   /api/v1/prices/alerts                   - Set price drop alert
GET    /api/v1/prices/alerts                   - User's active alerts
```

**Response Example:**
```json
{
  "cardId": "abc123",
  "cardName": "Charizard ex",
  "prices": [
    {
      "source": "YUYU_TEI",
      "price": 15000,
      "currency": "JPY",
      "inStock": true,
      "fetchedAt": "2026-01-20T09:00:00Z"
    },
    {
      "source": "HARERUYA",
      "price": 14500,
      "currency": "JPY",
      "inStock": true,
      "fetchedAt": "2026-01-20T09:00:00Z"
    }
  ],
  "lowestPrice": 14500,
  "averagePrice": 14750
}
```

---

## 🔧 Scraper Jobs

### 1. Tournament Scraper
**Source:** https://players.pokemon-card.com/event/result/list

**Strategy:**
- Scrape tournament list page
- Extract event IDs and basic info
- Follow links to detailed results
- Parse player standings and deck info
- Store tournament + results in DB

**Defensive Parsing:**
```python
try:
    tournament_date = parse_date(date_text)
except:
    tournament_date = None  # Continue, log warning
```

### 2. Price Scraper
**Sources:**
- **Yuyu-tei (遊々亭)** - Japanese singles market
- **Hareruya (晴れる屋)** - Japanese singles market
- **CardMarket** - European market
- **TCGPlayer** - US market

**Strategy:**
- Rotate through sources daily
- Rate limit: 1-2 sec delay between requests
- Store both current price and history
- Compare webCardId to match cards
- Handle out-of-stock gracefully

**Scheduling:**
- Daily price updates (cron job)
- On-demand via API endpoint
- Retry failed scrapes after 1 hour

---

## 📊 Meta-Game Statistics

### Deck Archetype Breakdown
```json
{
  "totalDecks": 120,
  "archetypeBreakdown": {
    "AGGRO": 45,
    "CONTROL": 30,
    "COMBO": 25,
    "MIDRANGE": 15,
    "TOOLBOX": 5
  },
  "topCards": [
    {
      "cardId": "xyz789",
      "cardName": "Boss's Orders",
      "usage": 85
    }
  ]
}
```

### Use Cases:
- View most popular decks from recent tournaments
- Track card usage trends over time
- Identify emerging archetypes
- Price cards based on competitive demand

---

## 🚀 Implementation Priority

### Phase 1: Core Features (Current)
- [x] Database schema with new tables
- [x] API module structure
- [x] TypeScript types

### Phase 2: Tournament Features
- [ ] Tournament scraper (Python)
- [ ] Tournament API endpoints
- [ ] Meta-game statistics aggregation
- [ ] Player search functionality

### Phase 3: Deck Builder
- [ ] Deck CRUD operations
- [ ] Deck validation logic
- [ ] Import from tournament results
- [ ] Export deck lists (text format)
- [ ] Public deck sharing

### Phase 4: Price Tracking
- [ ] Price scrapers for each source
- [ ] Price comparison API
- [ ] Historical charts (7d, 30d, 90d)
- [ ] Price alert system (email/push)
- [ ] Price history visualization

---

## 🎨 Frontend Features (Next Phase)

### Tournament Browser
- Filter by date, type, region
- Search by player name
- View tournament results
- Click to view winning decks

### Deck Builder
- Drag-and-drop deck construction
- Real-time card search
- Visual deck validation (color-coded)
- Import tournament decks with one click
- Share deck URL

### Price Tracker
- Price comparison table
- Historical price charts (Chart.js)
- Set price alerts
- "Best price" recommendations
- Stock availability indicators

---

## 📝 Updated Documentation

All documentation has been updated to reflect new features:
- ✅ `README.md` - New FR-7, FR-8, FR-9
- ✅ `schema.prisma` - Tournament, Deck, Price tables
- ✅ `shared-types` - New TypeScript interfaces
- ✅ `IMPLEMENTATION.md` - New API endpoints
- ✅ API modules - Tournaments, Decks, Prices

---

## 🔗 External APIs & Sources

| Source | Type | URL |
|--------|------|-----|
| Pokemon Events | Tournament Results | https://players.pokemon-card.com/event/result/list |
| Yuyu-tei | Market Prices | https://yuyu-tei.jp/ |
| Hareruya | Market Prices | https://www.hareruya2.com/ |
| CardMarket | Market Prices | https://www.cardmarket.com/ |
| TCGPlayer | Market Prices | https://www.tcgplayer.com/ |

---

## ⚠️ Important Notes

1. **Rate Limiting:**
   - Pokemon website: 1-2 sec delay between requests
   - Price sites: 2-3 sec delay, rotate user agents
   - Respect robots.txt

2. **Data Privacy:**
   - Store only public tournament data
   - Player names are public information
   - No scraping of private profiles

3. **Currency Handling:**
   - Store prices in original currency (JPY, EUR, USD)
   - Convert for display in user's preferred currency
   - Update exchange rates daily

4. **Caching:**
   - Tournament results: 1 hour TTL
   - Deck lists: 15 min TTL
   - Prices: 5 min TTL (volatile data)
