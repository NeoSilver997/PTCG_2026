#!/usr/bin/env python3
"""
Enhanced PTCG Event Deck List Scraper
- Scrape events by date range
- Extract event date and location
- Scrape decks by deck_id
- Organize output in folders
"""

import csv
import logging
import json
import os
from datetime import datetime
from typing import List, Dict, Optional
import time
import re

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from bs4 import BeautifulSoup

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class EventDeckScraper:
    """Enhanced scraper for Pokemon TCG Japan event results and deck lists"""
    
    def __init__(self, output_dir: str = "event_data"):
        self.base_url = "https://players.pokemon-card.com"
        self.deck_base_url = "https://www.pokemon-card.com"
        self.output_dir = output_dir
        
        # Create output directory
        os.makedirs(output_dir, exist_ok=True)
        logger.info(f"Output directory: {output_dir}")
    
    def _get_driver(self):
        """Create and return a Chrome WebDriver"""
        chrome_options = Options()
        chrome_options.add_argument('--headless')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        return webdriver.Chrome(options=chrome_options)
    
    def scrape_event(self, event_url: str, capacity: str = "") -> Dict:
        """
        Scrape event results with date and location
        Example: https://players.pokemon-card.com/event/detail/848638/result
        """
        logger.info(f"Scraping event: {event_url}")
        
        driver = self._get_driver()
        event_data = {
            'event_url': event_url,
            'event_id': '',
            'event_title': '',
            'event_date': '',
            'event_host': '',
            'event_address': '',
            'event_location': '',
            'event_capacity': capacity,
            'results': []
        }
        
        try:
            # Extract event ID from URL
            event_id_match = re.search(r'/event/detail/(\d+)', event_url)
            if event_id_match:
                event_data['event_id'] = event_id_match.group(1)
            
            driver.get(event_url)
            time.sleep(2)  # Reduced from 5 to 2 seconds
            
            html = driver.page_source
            soup = BeautifulSoup(html, 'html.parser')
            
            # Extract event title
            title = soup.find(class_='c-title-event')
            if not title:
                title = soup.find('h1', class_=lambda x: x and 'eventName' in str(x))
            if not title:
                title = soup.find(['h1', 'h2'])
            if title:
                event_data['event_title'] = title.get_text(strip=True)
            
            # Extract event details (date and location)
            # Look for date in the date-day div
            date_div = soup.find('div', class_='date-day')
            if date_div:
                date_text = date_div.get_text(strip=True)
                # Extract date (format: 2025年11月11日(火))
                date_match = re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日', date_text)
                if date_match:
                    year, month, day = date_match.groups()
                    event_data['event_date'] = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            
            # Extract event host (主催者：)
            all_text = soup.get_text()
            host_match = re.search(r'主催者：([^\n〒]+)', all_text)
            if host_match:
                event_data['event_host'] = host_match.group(1).strip()
            
            # Extract capacity (定員)
            capacity_match = re.search(r'定員\s+(\d+)人', all_text)
            if capacity_match:
                event_data['event_capacity'] = capacity_match.group(1)

            # Extract address (〒) - only the address line
            address_match = re.search(r'(〒\d{3}-\d{4}\s+[^\n]+)', all_text)
            if address_match:
                # Clean up the address - stop at certain keywords
                address = address_match.group(1).strip()
                # Remove extra content after store/venue name
                address = re.sub(r'(イベント|結果|順位|ユーザー).*$', '', address).strip()
                event_data['event_address'] = address
            
            # Look for location/store name in various possible places
            # Try to find store name or venue in the page
            location_patterns = [
                ('div', {'class': lambda x: x and 'store' in str(x).lower()}),
                ('div', {'class': lambda x: x and 'shop' in str(x).lower()}),
                ('div', {'class': lambda x: x and 'venue' in str(x).lower()}),
                ('span', {'class': lambda x: x and 'location' in str(x).lower()}),
            ]
            
            for tag, attrs in location_patterns:
                location_elem = soup.find(tag, attrs)
                if location_elem:
                    event_data['event_location'] = location_elem.get_text(strip=True)
                    break
            
            # If no location found yet, try to extract from title or other text
            if not event_data['event_location']:
                # Sometimes location is in the page text
                # Look for common store chains
                store_match = re.search(r'(カードラボ[^\s]+|ポケモンセンター[^\s]+|トレカ[^\s]+店)', all_text)
                if store_match:
                    event_data['event_location'] = store_match.group(1)
            
            # Extract results table (handle pagination)
            page = 1
            while True:
                logger.info(f"Processing page {page}...")
                
                # Get current page HTML
                html = driver.page_source
                soup = BeautifulSoup(html, 'html.parser')
                
                table = soup.find('table')
                if not table:
                    break
                    
                rows = table.find_all('tr')[1:]  # Skip header
                page_results = 0
                
                for row in rows:
                    cells = row.find_all('td')
                    if len(cells) < 5:
                        continue
                    
                    # Parse username (format: "nameプレイヤーID：idエリア：area")
                    username_text = cells[2].get_text(strip=True)
                    player_name = ''
                    player_id = ''
                    player_area = ''
                    
                    # Split by "プレイヤーID：" and "エリア："
                    name_match = re.match(r'^([^プ]+)', username_text)
                    if name_match:
                        player_name = name_match.group(1).strip()
                    
                    id_match = re.search(r'プレイヤーID：(\d+)', username_text)
                    if id_match:
                        player_id = id_match.group(1)
                    
                    area_match = re.search(r'エリア：(.+)', username_text)
                    if area_match:
                        player_area = area_match.group(1).strip()
                    
                    result = {
                        'rank': cells[0].get_text(strip=True),
                        'points': cells[1].get_text(strip=True),
                        'player_name': player_name,
                        'player_id': player_id,
                        'player_area': player_area,
                        'deck_url': '',
                        'deck_id': ''
                    }
                    
                    # Extract deck link
                    deck_link = cells[4].find('a', href=lambda x: x and 'deckID' in str(x))
                    if deck_link:
                        result['deck_url'] = deck_link.get('href')
                        # Extract deck ID
                        deck_id_match = re.search(r'deckID/([^/]+)', result['deck_url'])
                        if deck_id_match:
                            result['deck_id'] = deck_id_match.group(1)
                    
                    event_data['results'].append(result)
                    page_results += 1
                
                logger.info(f"Found {page_results} results on page {page} (total: {len(event_data['results'])})")
                
                # Check for next page button (must not be disabled)
                next_button = soup.find('button', class_='next')
                if not next_button:
                    logger.info("No next button found, ending pagination")
                    break
                    
                if next_button.get('disabled') is not None:
                    logger.info("Next button is disabled, reached last page")
                    break
                
                # Click next page button
                try:
                    next_btn_elem = driver.find_element(By.CSS_SELECTOR, 'button.next')
                    if not next_btn_elem.is_enabled():
                        logger.info("Next button is not enabled, reached last page")
                        break
                    next_btn_elem.click()
                    time.sleep(1.5)  # Reduced from 3 to 1.5 seconds
                    page += 1
                except Exception as e:
                    logger.warning(f"Could not navigate to next page: {e}")
                    break
            
        except Exception as e:
            logger.error(f"Error scraping event: {e}")
            import traceback
            traceback.print_exc()
        finally:
            driver.quit()
        
        return event_data
    
    def scrape_deck_by_id(self, deck_id: str) -> Dict:
        """
        Scrape deck by deck ID
        Example: pMMyyp-Bj58oH-M2MpyS
        """
        deck_url = f"{self.deck_base_url}/deck/confirm.html/deckID/{deck_id}"
        return self.scrape_deck(deck_url, deck_id)
    
    def scrape_deck(self, deck_url: str, deck_id: str = None) -> Dict:
        """
        Scrape deck details from a deck page
        """
        if not deck_id:
            # Extract deck ID from URL
            deck_id_match = re.search(r'deckID/([^/]+)', deck_url)
            if deck_id_match:
                deck_id = deck_id_match.group(1)
        
        logger.info(f"Scraping deck: {deck_id}")
        
        driver = self._get_driver()
        deck_data = {
            'deck_url': deck_url,
            'deck_id': deck_id,
            'deck_code': '',
            'cards': []
        }
        
        try:
            driver.get(deck_url)
            time.sleep(1.5)  # Reduced from 3 to 1.5 seconds
            
            html = driver.page_source
            soup = BeautifulSoup(html, 'html.parser')
            
            # Extract deck code from page
            deck_code_elem = soup.find(string=lambda x: x and 'デッキコード' in str(x))
            if deck_code_elem:
                code_text = deck_code_elem.parent.get_text(strip=True)
                # Extract the actual code (format: 【デッキコード】CODE)
                code_match = re.search(r'】(.+)', code_text)
                if code_match:
                    deck_data['deck_code'] = code_match.group(1)
            
            # Find script with card data
            scripts = soup.find_all('script')
            card_names = {}
            card_images = {}
            
            for script in scripts:
                if script.string and 'PCGDECK' in script.string:
                    # Extract card names
                    for match in re.finditer(r"PCGDECK\.searchItemName\[(\d+)\]='([^']+)'", script.string):
                        card_id = match.group(1)
                        card_name = match.group(2)
                        card_names[card_id] = card_name
                    
                    # Extract card images
                    for match in re.finditer(r"PCGDECK\.searchItemCardPict\[(\d+)\]='([^']+)'", script.string):
                        card_id = match.group(1)
                        image_path = match.group(2)
                        card_images[card_id] = self.deck_base_url + image_path
            
            # Find deck list in hidden form inputs
            # Format: <input id="deck_pke" value="cardID_quantity_1-cardID_quantity_1-..."/>
            deck_inputs = soup.find_all('input', id=lambda x: x and x.startswith('deck_'))
            
            for deck_input in deck_inputs:
                deck_value = deck_input.get('value', '')
                if not deck_value:
                    continue
                
                # Parse deck list (format: 47259_2_1-47258_2_1-...)
                for card_entry in deck_value.split('-'):
                    parts = card_entry.split('_')
                    if len(parts) >= 2:
                        card_id = parts[0]
                        quantity = int(parts[1])
                        
                        if card_id in card_names:
                            full_name = card_names[card_id]
                            
                            # Split card name and code (format: "name(code)")
                            card_name = full_name
                            card_code = ''
                            code_match = re.match(r'^(.+)\(([^)]+)\)$', full_name)
                            if code_match:
                                card_name = code_match.group(1).strip()
                                card_code = code_match.group(2).strip()
                            
                            card_data = {
                                'card_id': card_id,
                                'card_name': card_name,
                                'card_code': card_code,
                                'quantity': quantity,
                                'image_url': card_images.get(card_id, '')
                            }
                            deck_data['cards'].append(card_data)
            
            total_cards = sum(c['quantity'] for c in deck_data['cards'])
            logger.info(f"Extracted deck with {total_cards} cards ({len(deck_data['cards'])} unique)")
            
        except Exception as e:
            logger.error(f"Error scraping deck {deck_id}: {e}")
            import traceback
            traceback.print_exc()
        finally:
            driver.quit()
        
        return deck_data
    
    def save_event_data(self, event_data: Dict):
        """Save event data to folder"""
        event_id = event_data.get('event_id', 'unknown')
        event_date = event_data.get('event_date', 'unknown')
        
        # Create event folder
        event_folder = os.path.join(self.output_dir, f"event_{event_id}_{event_date}")
        os.makedirs(event_folder, exist_ok=True)
        
        # Save event info
        event_file = os.path.join(event_folder, "event_info.json")
        with open(event_file, 'w', encoding='utf-8') as f:
            json.dump(event_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Saved event data to {event_file}")
        return event_folder
    
    def save_deck_data(self, deck_data: Dict, folder: str = None):
        """Save deck data to folder"""
        if folder is None:
            folder = self.output_dir
        
        deck_id = deck_data.get('deck_id', 'unknown')
        deck_file = os.path.join(folder, f"deck_{deck_id}.json")
        
        with open(deck_file, 'w', encoding='utf-8') as f:
            json.dump(deck_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Saved deck data to {deck_file}")
    
    def scrape_event_with_decks(self, event_url: str):
        """Scrape event and all associated decks"""
        # Scrape event
        event_data = self.scrape_event(event_url)
        
        # Save event data
        event_folder = self.save_event_data(event_data)
        
        # Scrape all decks
        logger.info(f"Scraping {len(event_data['results'])} decks...")
        for i, result in enumerate(event_data['results'], 1):
            deck_id = result.get('deck_id')
            if deck_id:
                logger.info(f"[{i}/{len(event_data['results'])}] Scraping deck {deck_id}")
                deck_data = self.scrape_deck_by_id(deck_id)
                self.save_deck_data(deck_data, event_folder)
                time.sleep(1)  # Reduced from 2 to 1 second
        
        logger.info(f"✓ Event scraping completed! Data saved to: {event_folder}")
        return event_folder


def main():
    """Test the enhanced scraper"""
    scraper = EventDeckScraper(output_dir="event_data")
    
    # Example 1: Scrape event with all decks
    print("\n" + "="*80)
    print("SCRAPING EVENT WITH ALL DECKS")
    print("="*80)
    
    event_url = "https://players.pokemon-card.com/event/detail/848638/result"
    event_folder = scraper.scrape_event_with_decks(event_url)
    
    print(f"\n✓ All data saved to: {event_folder}")
    
    # Example 2: Scrape individual deck by ID
    print("\n" + "="*80)
    print("SCRAPING INDIVIDUAL DECK BY ID")
    print("="*80)
    
    deck_id = "DcY884-4mRFyP-Y8x4xx"  # Second place deck
    deck_data = scraper.scrape_deck_by_id(deck_id)
    scraper.save_deck_data(deck_data)
    
    print(f"\n✓ Deck {deck_id} saved")
    print(f"  Total cards: {sum(c['quantity'] for c in deck_data['cards'])}")
    print(f"  Unique cards: {len(deck_data['cards'])}")


if __name__ == "__main__":
    main()
