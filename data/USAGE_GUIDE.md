# Storage Implementation - Quick Start Guide

This guide shows how to use the newly implemented storage system for managing card images, event data, and deck lists.

## Python Scripts (Scrapers)

### Download Card Images

```bash
cd scrapers
python src/download_images.py
```

**Example Code:**
```python
from src.download_images import ImageDownloader

downloader = ImageDownloader()

# Download single card
result = downloader.download_card_image(
    web_card_id='hk00017762',
    image_url='https://asia.pokemon-card.com/hk/card-img/hk00017762.png',
    region='hk',
    expansion_code='SV08'
)

# Download batch
cards = [
    {
        'web_card_id': 'hk00017762',
        'image_url': 'https://...',
        'region': 'hk',
        'expansion_code': 'SV08'
    },
    # ... more cards
]
results = downloader.download_batch(cards, delay=1.0)
```

### Save Event/Deck Data

```bash
python src/save_event_data.py
```

**Example Code:**
```python
from src.save_event_data import EventDataManager

manager = EventDataManager()

# Save event data
event_data = {
    'eventId': '2026-01-15_hong-kong-championship',
    'name': '香港錦標賽 2026',
    'date': '2026-01-15',
    'location': '香港會議展覽中心',
    'type': 'CHAMPIONSHIP',
    'participants': 128,
    'topDecks': [...]
}
manager.save_event_data(event_data, processed=True)

# Save deck data
deck_data = {
    'deckId': '2026-01-15_1st_champion',
    'name': '莉佳的草系套牌',
    'type': 'CONTROL',
    'format': 'STANDARD',
    'cards': [...],
    'metadata': {...}
}
manager.save_deck_data(deck_data, category='tournament')
```

## NestJS API (Backend)

### Using StorageService

```typescript
import { StorageService } from './common/services/storage.service';
import { StorageRegion, ImageType } from '@ptcg/shared-types';

@Injectable()
export class MyService {
  constructor(private storageService: StorageService) {}

  async downloadImage() {
    const result = await this.storageService.downloadCardImage(
      'https://asia.pokemon-card.com/hk/card-img/hk00017762.png',
      {
        webCardId: 'hk00017762',
        region: StorageRegion.HK,
        expansionCode: 'SV08',
        type: ImageType.FULL
      }
    );
    // Automatically generates thumbnail
  }

  async getImage() {
    const path = await this.storageService.getCardImagePath(
      'hk00017762',
      StorageRegion.HK,
      ImageType.FULL
    );
  }

  async saveEvent() {
    await this.storageService.storeEventData({
      eventId: '2026-01-15_hong-kong-championship',
      name: '香港錦標賽 2026',
      // ... other fields
    }, true);
  }
}
```

### API Endpoints

**Get Card Image:**
```
GET /api/v1/storage/cards/hk00017762/image?region=hk&type=full
GET /api/v1/storage/cards/hk00017762/thumbnail?region=hk
```

**Get Event Data:**
```
GET /api/v1/storage/events/2026-01-15_hong-kong-championship?processed=true
```

**Get Deck Data:**
```
GET /api/v1/storage/decks/2026-01-15_1st_champion?category=tournament
```

**Get Storage Stats:**
```
GET /api/v1/storage/stats
```

Returns:
```json
{
  "totalImages": 150,
  "totalThumbnails": 150,
  "totalHTMLFiles": 75,
  "totalEvents": 12,
  "totalDecks": 48,
  "totalStorageSize": 8589934592,
  "lastUpdated": "2026-01-21T..."
}
```

## Installation

### Backend (API)
```bash
cd apps/api
pnpm install
# Installs sharp for image processing, axios for downloads
```

### Scrapers
```bash
cd scrapers
pip install -r requirements.txt
# Installs requests, beautifulsoup4, Pillow, etc.
```

## Maintenance Tasks

### Clean Old HTML Archives
```typescript
// In your service
const deletedCount = await this.storageService.cleanupOldHTMLArchives();
// Deletes HTML files older than 30 days
```

### Archive Old Events (Python)
```python
from src.save_event_data import EventDataManager

manager = EventDataManager()
count = manager.archive_old_events(2025)
# Moves 2025 events to archives/2025/
```

## File Structure

Images are stored as:
```
data/images/cards/hk/SV08/hk00017762.png  (full size)
data/images/thumbnails/hk/hk00017762.png  (200x280)
```

Events are stored as:
```
data/events/processed/2026-01-15_hong-kong-championship.json
```

Decks are stored as:
```
data/decks/tournament/2026-01-15_1st_champion.json
data/decks/user/{userId}/my-grass-deck.json
```

## Next Steps

1. Install dependencies: `pnpm install` in API, `pip install -r requirements.txt` in scrapers
2. Test image download: Run `python scrapers/src/download_images.py`
3. Test event saving: Run `python scrapers/src/save_event_data.py`
4. Start API: `pnpm dev` in apps/api
5. Test endpoints: `curl http://localhost:4000/api/v1/storage/stats`
