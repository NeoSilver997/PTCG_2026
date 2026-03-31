#!/usr/bin/env python3
"""
Batch scrape multiple events
"""
import time
import re
import os
import glob
import json
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
from event_scraper_enhanced import EventDeckScraper
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def get_event_ids_from_list(max_events=5, start_offset=0):
    """Get real event IDs from the event list page with pagination support
    
    Args:
        max_events: Maximum number of events to fetch
        start_offset: Offset to start from (e.g., 100 to skip first 100 events)
    """
    chrome_options = Options()
    chrome_options.add_argument('--headless')
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    driver = webdriver.Chrome(options=chrome_options)
    
    event_data_list = []
    offset = start_offset
    page = (start_offset // 20) + 1
    
    while len(event_data_list) < max_events:
        url = f'https://players.pokemon-card.com/event/result/list?offset={offset}'
        print(f"Fetching event list page {page} (offset={offset})...")
        driver.get(url)
        time.sleep(2)  # Reduced from 5 to 2 seconds
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        # Find all event links
        event_links = soup.find_all('a', href=lambda x: x and '/event/detail/' in str(x))
        
        # Track how many new IDs we found on this page
        initial_count = len(event_data_list)
        
        for link in event_links:
            href = link.get('href', '')
            match = re.search(r'/event/detail/(\d+)', href)
            if match:
                event_id = match.group(1)
                
                # Extract capacity
                capacity = ""
                capacity_span = link.find('span', class_='capacity')
                if capacity_span:
                    cap_text = capacity_span.get_text(strip=True)
                    cap_match = re.search(r'定員\s*(\d+)人', cap_text)
                    if cap_match:
                        capacity = cap_match.group(1)
                
                # Check if we already have this event
                if not any(e['id'] == event_id for e in event_data_list):
                    event_data_list.append({'id': event_id, 'capacity': capacity})
                    if len(event_data_list) >= max_events:
                        break
        
        # If no new events found, we've reached the end
        if len(event_data_list) == initial_count:
            print(f"No more events found. Total: {len(event_data_list)} events")
            break
        
        print(f"  → Found {len(event_data_list) - initial_count} new events (total: {len(event_data_list)})")
        
        # Stop if we have enough events
        if len(event_data_list) >= max_events:
            break
        
        # Move to next page (20 events per page)
        offset += 20
        page += 1
        time.sleep(1)  # Reduced from 2 to 1 second
    
    driver.quit()
    print(f"Total event IDs collected: {len(event_data_list)}")
    return event_data_list

def main(start_offset=0, reload_info=False, force_reimport=False, max_events=50):
    """Main function with optional start offset
    
    Args:
        start_offset: Offset to start from (e.g., 100 to skip first 100 events)
        reload_info: If True, re-scrape event info even if folder exists (skips deck download if present)
        force_reimport: If True, re-download decks even if already present
        max_events: Maximum number of new events to scrape (default 50)
    """
    scraper = EventDeckScraper(output_dir="event_data")
    
    # Get real event IDs from the list page (fetch more to find new events)
    events_to_scrape = get_event_ids_from_list(max_events=200, start_offset=start_offset)  # Fetch 200 event IDs to find more new events
    
    successful_events = []
    
    print("=" * 80)
    print("BATCH EVENT SCRAPING")
    print("=" * 80)
    print(f"Found {len(events_to_scrape)} event IDs from list page")
    if reload_info:
        print(f"Mode: RELOAD INFO ONLY (Updating event metadata, skipping deck downloads)")
    elif force_reimport:
        print(f"Mode: FORCE RE-IMPORT (re-downloading all events including already downloaded)")
    else:
        print(f"Will scrape up to {max_events} NEW events (skipping already downloaded)")
    print()
    
    for idx, event_info in enumerate(events_to_scrape, 1):
        event_id = event_info['id']
        capacity = event_info['capacity']
        event_url = f"https://players.pokemon-card.com/event/detail/{event_id}/result"
        
        try:
            print(f"\n[{idx}/{len(events_to_scrape)}] Checking event {event_id}...")
            
            # Check if event already exists
            existing_folders = glob.glob(f"{scraper.output_dir}/event_{event_id}_*")
            
            if existing_folders:
                event_folder = existing_folders[0]
                
                # Check if decks are already downloaded
                deck_files = glob.glob(f"{event_folder}/deck_*.json")
                event_info_file = os.path.join(event_folder, "event_info.json")
                
                # If reloading info, force re-scrape of event page
                if reload_info:
                    print(f"  → Reloading info for event {event_id}...")
                    # Scrape event info
                    event_data = scraper.scrape_event(event_url, capacity=capacity)
                    
                    # Save event data (overwrites existing event_info.json)
                    # Note: save_event_data creates folder based on date. 
                    # If date is same, it overwrites event_info.json in same folder.
                    # If date differs, it creates new folder.
                    new_folder = scraper.save_event_data(event_data)
                    
                    # If folder changed (date changed), we might have two folders now.
                    # But usually date is stable.
                    if new_folder != event_folder:
                        print(f"  ! Warning: Event folder changed from {event_folder} to {new_folder}")
                    
                    print(f"  ✓ Info updated for {event_id}. Capacity: {event_data.get('event_capacity')}人")
                    continue # Skip deck checks/downloads in reload mode
                
                # If event info exists, check if we need to download decks
                if os.path.exists(event_info_file):
                    with open(event_info_file, 'r', encoding='utf-8') as f:
                        event_data = json.load(f)
                    
                    # Update capacity if missing
                    if capacity and not event_data.get('event_capacity'):
                        print(f"  → Updating capacity for event {event_id}: {capacity}人")
                        event_data['event_capacity'] = capacity
                        with open(event_info_file, 'w', encoding='utf-8') as f:
                            json.dump(event_data, f, ensure_ascii=False, indent=2)
                    
                    expected_decks = len(event_data.get('results', []))
                    actual_decks = len(deck_files)
                    
                    if actual_decks >= expected_decks and actual_decks > 0 and not force_reimport:
                        print(f"⊙ Event {event_id}: Already downloaded with {actual_decks} decks, skipping...")
                        # Don't count already downloaded events toward the target
                        continue
                    else:
                        print(f"⊙ Event {event_id}: Found but missing decks ({actual_decks}/{expected_decks}), re-downloading decks...")
                        # Will download decks below
                else:
                    print(f"  → Event {event_id}: Folder exists but no event_info.json, re-scraping...")
            else:
                print(f"  → Scraping event {event_id}...")
                event_data = scraper.scrape_event(event_url, capacity=capacity)
                
                # Check if event has results
                if not event_data['results']:
                    print(f"✗ Event {event_id}: No results found (might not exist)")
                    continue
                
                print(f"✓ Event {event_id}: {len(event_data['results'])} results")
                print(f"  Date: {event_data['event_date']}")
                print(f"  Host: {event_data['event_host'][:50]}..." if len(event_data['event_host']) > 50 else f"  Host: {event_data['event_host']}")
                if event_data.get('event_capacity'):
                    print(f"  Capacity: {event_data['event_capacity']}人")
                
                # Save event data
                event_folder = scraper.save_event_data(event_data)
            
            # Load event data if not already loaded
            if 'event_data' not in locals() or not event_data:
                event_info_file = os.path.join(event_folder, "event_info.json")
                with open(event_info_file, 'r', encoding='utf-8') as f:
                    event_data = json.load(f)
            
            # Scrape decks with ranking in filename
            print(f"  → Scraping {len(event_data['results'])} decks...")
            for result in event_data['results']:
                deck_id = result.get('deck_id')
                if not deck_id:
                    continue
                
                # Format rank for filename (1位 -> 1st, 2位 -> 2nd, etc.)
                rank = result.get('rank', '').replace('位', '')
                rank_suffix = 'st' if rank == '1' else 'nd' if rank == '2' else 'rd' if rank == '3' else 'th'
                rank_name = f"{rank}{rank_suffix}"
                
                # Check if this deck already exists
                deck_filename = f"deck_{rank_name}_{deck_id}.json"
                deck_path = os.path.join(event_folder, deck_filename)
                
                if os.path.exists(deck_path):
                    print(f"    ⊙ {rank_name}: {deck_id} (already exists)")
                    continue
                
                try:
                    deck_data = scraper.scrape_deck_by_id(deck_id)
                    
                    # Save with ranking in filename
                    with open(deck_path, 'w', encoding='utf-8') as f:
                        json.dump(deck_data, f, ensure_ascii=False, indent=2)
                    
                    print(f"    ✓ {rank_name}: {deck_id} ({len(deck_data['cards'])} cards)")
                    
                    # Small delay between decks
                    time.sleep(2)
                except Exception as e:
                    print(f"    ✗ {rank_name}: {deck_id} - Error: {e}")
                    continue
            
            successful_events.append(event_id)
            print(f"✓ Downloaded event {event_id} ({len(successful_events)}/{max_events} new events)")
            
            # Stop after max_events NEW successful events
            if len(successful_events) >= max_events:
                print(f"\n✓ Reached target of {max_events} NEW events!")
                break
            
            # Be respectful to server
            time.sleep(2)
            
        except Exception as e:
            print(f"✗ Event {event_id}: Error - {e}")
            continue
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Successfully scraped {len(successful_events)} events:")
    for event_id in successful_events:
        print(f"  - Event {event_id}")
    print()

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description='Batch scrape PTCG tournament events from players.pokemon-card.com'
    )
    parser.add_argument(
        'start_offset', nargs='?', type=int, default=0,
        help='Number of most-recent events to skip (positional, default: 0)'
    )
    parser.add_argument(
        '--skip-recent', type=int, dest='skip_recent', default=None,
        help='Alias for start_offset used by the API server'
    )
    parser.add_argument(
        '--region', default='JP', choices=['JP', 'HK', 'EN'],
        help='Region identifier (informational; only JP scraping supported, default: JP)'
    )
    parser.add_argument(
        '--reload-info', action='store_true', dest='reload_info',
        help='Re-scrape event info even if folder already exists (skips deck downloads)'
    )
    parser.add_argument(
        '--force-reimport', action='store_true', dest='force_reimport',
        help='Re-download decks even if they already exist locally'
    )
    parser.add_argument(
        '--max-events', type=int, default=50, dest='max_events',
        help='Maximum number of new events to scrape (default: 50)'
    )

    args = parser.parse_args()

    # --skip-recent overrides the positional start_offset when provided
    offset = args.skip_recent if args.skip_recent is not None else args.start_offset

    main(offset, args.reload_info, args.force_reimport, args.max_events)
