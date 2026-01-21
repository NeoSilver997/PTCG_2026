"""
Event Data Manager
Saves tournament and event data to organized JSON files
"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class EventDataManager:
    """Manage tournament and event data storage"""
    
    def __init__(self, data_root: str = None):
        """
        Initialize event data manager
        
        Args:
            data_root: Root directory for data storage
        """
        if data_root is None:
            script_dir = Path(__file__).parent.parent.parent
            data_root = script_dir / 'data'
        
        self.data_root = Path(data_root)
        self.events_dir = self.data_root / 'events'
        self.decks_dir = self.data_root / 'decks'
    
    def save_event_data(
        self,
        event_data: Dict,
        processed: bool = False
    ) -> str:
        """
        Save event data to JSON file
        
        Args:
            event_data: Event data dictionary
            processed: Whether this is processed (validated) data
            
        Returns:
            Path to saved file
        """
        subdir = 'processed' if processed else 'raw'
        target_dir = self.events_dir / subdir
        target_dir.mkdir(parents=True, exist_ok=True)
        
        event_id = event_data.get('eventId')
        if not event_id:
            raise ValueError("Event data must have 'eventId' field")
        
        file_path = target_dir / f"{event_id}.json"
        
        # Add metadata
        if 'scrapedAt' not in event_data:
            event_data['scrapedAt'] = datetime.now().isoformat()
        
        # Save to file
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(event_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Saved event data to {file_path}")
        return str(file_path)
    
    def save_deck_data(
        self,
        deck_data: Dict,
        category: str = 'tournament',
        user_id: Optional[str] = None
    ) -> str:
        """
        Save deck data to JSON file
        
        Args:
            deck_data: Deck data dictionary
            category: Category (tournament/user/meta)
            user_id: User ID for user decks
            
        Returns:
            Path to saved file
        """
        if category == 'user' and user_id:
            target_dir = self.decks_dir / 'user' / user_id
        else:
            target_dir = self.decks_dir / category
        
        target_dir.mkdir(parents=True, exist_ok=True)
        
        deck_id = deck_data.get('deckId')
        if not deck_id:
            raise ValueError("Deck data must have 'deckId' field")
        
        file_path = target_dir / f"{deck_id}.json"
        
        # Add metadata
        if 'metadata' not in deck_data:
            deck_data['metadata'] = {}
        
        if 'createdAt' not in deck_data['metadata']:
            deck_data['metadata']['createdAt'] = datetime.now().isoformat()
        
        deck_data['metadata']['updatedAt'] = datetime.now().isoformat()
        
        # Save to file
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(deck_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Saved deck data to {file_path}")
        return str(file_path)
    
    def get_event_data(
        self,
        event_id: str,
        processed: bool = True
    ) -> Optional[Dict]:
        """
        Load event data from file
        
        Args:
            event_id: Event identifier
            processed: Load from processed or raw data
            
        Returns:
            Event data dict or None
        """
        subdir = 'processed' if processed else 'raw'
        file_path = self.events_dir / subdir / f"{event_id}.json"
        
        if not file_path.exists():
            logger.warning(f"Event data not found: {event_id}")
            return None
        
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def archive_old_events(self, year: int) -> int:
        """
        Archive events from a specific year
        
        Args:
            year: Year to archive
            
        Returns:
            Number of events archived
        """
        archive_dir = self.events_dir / 'archives' / str(year)
        archive_dir.mkdir(parents=True, exist_ok=True)
        
        archived_count = 0
        
        # Archive from processed folder
        processed_dir = self.events_dir / 'processed'
        if processed_dir.exists():
            for file_path in processed_dir.glob('*.json'):
                # Check if file is from the specified year
                if file_path.stem.startswith(f"{year}-"):
                    target_path = archive_dir / file_path.name
                    file_path.rename(target_path)
                    archived_count += 1
                    logger.info(f"Archived {file_path.name}")
        
        logger.info(f"Archived {archived_count} events from {year}")
        return archived_count


def main():
    """Example usage"""
    manager = EventDataManager()
    
    # Example event data
    event_data = {
        'eventId': '2026-01-15_hong-kong-championship',
        'name': '香港錦標賽 2026',
        'date': '2026-01-15',
        'location': '香港會議展覽中心',
        'type': 'CHAMPIONSHIP',
        'participants': 128,
        'topDecks': [
            {
                'placement': 1,
                'playerName': '陳大明',
                'deckType': '莉佳的草系組合技'
            }
        ]
    }
    
    # Save event data
    manager.save_event_data(event_data, processed=True)
    
    # Example deck data
    deck_data = {
        'deckId': '2026-01-15_1st_champion',
        'name': '莉佳的草系套牌',
        'type': 'CONTROL',
        'format': 'STANDARD',
        'cards': [
            {
                'cardId': 'hk00014744',
                'cardName': '莉佳的霸王花ex',
                'quantity': 2,
                'category': 'POKEMON'
            }
        ],
        'metadata': {
            'totalCards': 60,
            'pokemonCount': 18,
            'trainerCount': 30,
            'energyCount': 12
        },
        'source': {
            'type': 'tournament',
            'eventId': '2026-01-15_hong-kong-championship',
            'placement': 1
        }
    }
    
    # Save deck data
    manager.save_deck_data(deck_data, category='tournament')
    
    print("\nData saved successfully!")


if __name__ == '__main__':
    main()
