#!/usr/bin/env python3
"""
Japanese Pokemon Card Scraper for PTCG_2026
Scrapes card details from pokemon-card.com and saves to data/cards JSON files

Features:
- Multi-threaded scraping with rate limiting
- HTML caching for offline processing
- Automatic expansion grouping
- Maps Japanese data to PTCG_2026 schema (PrimaryCard, Card, RegionalExpansion)

Sample usage:
    # Scrape recent cards with caching
    python scrapers/src/japanese_card_scraper.py --id-range 50000 100 --cache-html

    # Process cached HTML offline (fast)
    python scrapers/src/japanese_card_scraper.py --id-range 50000 100 --cache-only --threads 20

    # Scrape specific expansion
    python scrapers/src/japanese_card_scraper.py --id-range 48000 1000 --expansions sv9 --cache-html
"""

import requests
from bs4 import BeautifulSoup
import json
import re
import time
from typing import Dict, Any, Optional, List, Tuple
import urllib.parse
import importlib.util
import argparse
from pathlib import Path
from datetime import datetime
import threading
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
from collections import Counter, defaultdict
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Check for lxml parser
_BS4_PARSER = 'lxml' if importlib.util.find_spec('lxml') else 'html.parser'

# ============================================================================
# MAPPING CONSTANTS
# ============================================================================

# Energy cost icons to symbols
ICON_COST_MAP = {
    'icon-fire': '炎',
    'icon-water': '水',
    'icon-lightning': '雷',
    'icon-electric': '雷',
    'icon-grass': '草',
    'icon-fighting': '闘',
    'icon-psychic': '超',
    'icon-darkness': '悪',
    'icon-dark': '悪',
    'icon-metal': '鋼',
    'icon-steel': '鋼',
    'icon-none': '無',
    'icon-colorless': '無',
    'icon-fairy': '妖',
    'icon-dragon': '龍'
}

# Element icons to database enum values
ELEMENT_TO_TYPE = {
    'icon-fire': 'FIRE',
    'icon-water': 'WATER',
    'icon-lightning': 'LIGHTNING',
    'icon-electric': 'LIGHTNING',
    'icon-grass': 'GRASS',
    'icon-fighting': 'FIGHTING',
    'icon-psychic': 'PSYCHIC',
    'icon-darkness': 'DARKNESS',
    'icon-dark': 'DARKNESS',
    'icon-metal': 'METAL',
    'icon-steel': 'METAL',
    'icon-none': 'COLORLESS',
    'icon-colorless': 'COLORLESS',
    'icon-fairy': 'FAIRY',
    'icon-dragon': 'DRAGON'
}

# Evolution stage mapping to database enum
EVOLUTION_STAGE_MAP = {
    'たね': 'BASIC',
    '1進化': 'STAGE_1',
    '1 進化': 'STAGE_1',
    '2進化': 'STAGE_2',
    '2 進化': 'STAGE_2',
    'M進化': 'MEGA',
    'VMAX': 'VMAX',
    'VSTAR': 'VSTAR'
}

# Subtype mapping
SUBTYPE_MAP = {
    'pokemon': 'BASIC',  # Default, overridden by evolution stage
    'pokemon_tool': 'TOOL',
    'trainer_supporter': 'SUPPORTER',
    'item': 'ITEM',
    'stadium': 'STADIUM',
    'basic_energy': 'BASIC_ENERGY',
    'special_energy': 'SPECIAL_ENERGY'
}

# Rarity mapping to database enum
RARITY_MAP = {
    'C': 'COMMON',
    'U': 'UNCOMMON',
    'R': 'RARE',
    'RR': 'DOUBLE_RARE',
    'RRR': 'ULTRA_RARE',
    'SR': 'SPECIAL_ILLUSTRATION_RARE',
    'UR': 'HYPER_RARE',
    'AR': 'ILLUSTRATION_RARE',
    'SAR': 'SPECIAL_ILLUSTRATION_RARE',
    'SSR': 'SPECIAL_ILLUSTRATION_RARE',
    'MUR': 'ULTRA_RARE',
    'MA': 'AMAZING_RARE',
    'CHR': 'SHINY_RARE',
    'PROMO': 'PROMO',
    'S': 'PROMO'
}

# Variant type mapping
VARIANT_TYPE_MAP = {
    'AR': 'AR',
    'SAR': 'SAR',
    'SR': 'SR',
    'SSR': 'SSR',
    'UR': 'UR',
    'MUR': 'MUR',
    'MA': 'MA',
    'CHR': 'CHR'
}

# Rule box detection patterns
RULE_BOX_PATTERNS = {
    'EX': r'\bEX\b',
    'GX': r'\bGX\b',
    'V': r'\bV$',
    'VMAX': r'\bVMAX\b',
    'VSTAR': r'\bVSTAR\b',
    'RADIANT': r'^かがやく'
}

# Default sample cards for testing
DEFAULT_SAMPLE_IDS = [
    48717, 48879, 48944, 49536, 49583, 49461, 48539, 49457,
    49453, 49397, 49390, 49331, 49266
]


# ============================================================================
# SCRAPER CLASS
# ============================================================================

class JapaneseCardScraper:
    """Scraper for Japanese Pokemon card details from pokemon-card.com"""

    def __init__(self, data_root: Optional[str] = None):
        """
        Initialize scraper
        
        Args:
            data_root: Root directory for data storage (defaults to ../../data)
        """
        if data_root is None:
            script_dir = Path(__file__).parent.parent.parent
            data_root = script_dir / 'data'
        
        self.data_root = Path(data_root)
        self.cards_dir = self.data_root / 'cards' / 'japan'
        self.html_dir = self.data_root / 'html' / 'japan'
        
        # HTTP session management
        self.user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        self.thread_local = threading.local()
        
        # Rate limiting
        self.request_lock = threading.Lock()
        self.last_request_ts = 0.0
        self.min_request_interval = 2.0
        
        # Logging
        self.quiet = False

    def scrape_card_details(
        self,
        card_url: str,
        cache_html: bool = False,
        refresh_cache: bool = False,
        cache_only: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Scrape individual card details from Japanese website
        
        Args:
            card_url: URL to card detail page
            cache_html: Save HTML to cache directory
            refresh_cache: Force re-fetch even if cached
            cache_only: Only use cache, skip HTTP requests
            
        Returns:
            Card data dict or None if failed
        """
        try:
            card_id = self._extract_card_id_from_url(card_url)
            cache_path = self.html_dir / f"{card_id}.html" if card_id and cache_html else None
            html_text = None

    # Try cache first
            if cache_path and cache_path.exists() and not refresh_cache:
                if not self.quiet:
                    logger.info(f"Using cached HTML for card {card_id}")
                html_text = cache_path.read_text(encoding='utf-8')
            else:
                # Fetch from web
                if cache_only:
                    if not self.quiet:
                        logger.warning(f"Cache miss for {card_id}, skipping (cache-only mode)")
                    return None
                
                if not self.quiet:
                    logger.info(f"Fetching {card_url}")
                
                self._wait_for_request_slot()
                response = self._get_session().get(card_url, timeout=10)
                response.raise_for_status()
                html_text = response.text
                
                # Save to cache
                if cache_path:
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    cache_path.write_text(html_text, encoding='utf-8')

            # Parse HTML
            soup = BeautifulSoup(html_text, _BS4_PARSER)
            card_data = self._extract_card_info(soup, card_url)

            if card_data and self._is_valid_card_data(card_data):
                if not self.quiet:
                    logger.info(f"✓ Scraped: {card_data.get('name')}")
                return card_data
            else:
                if not self.quiet:
                    logger.warning(f"✗ Failed to extract card data from {card_url}")
                return None

        except Exception as e:
            if not self.quiet:
                logger.error(f"✗ Error scraping {card_url}: {e}")
            return None

    def _wait_for_request_slot(self) -> None:
        """Ensure minimum delay between HTTP requests (thread-safe)"""
        with self.request_lock:
            now = time.time()
            elapsed = now - self.last_request_ts
            remaining = self.min_request_interval - elapsed
            if remaining > 0:
                time.sleep(remaining)
            self.last_request_ts = time.time()

    def _get_session(self) -> requests.Session:
        """Get thread-local HTTP session"""
        session = getattr(self.thread_local, 'session', None)
        if session is None:
            session = requests.Session()
            session.headers.update({'User-Agent': self.user_agent})
            self.thread_local.session = session
        return session

    # ========================================================================
    # EXTRACTION METHODS
    # ========================================================================

    def _extract_card_info(self, soup: BeautifulSoup, url: str) -> Optional[Dict[str, Any]]:
        """Extract all card information from BeautifulSoup object"""
        try:
            page_text = soup.get_text(' ', strip=True)

            # Card name (required)
            name_elem = soup.find('h1')
            if not name_elem:
                return None
            card_name = name_elem.get_text(strip=True)

            # Extract page card ID
            page_card_id = self._extract_card_id_from_url(url)
            web_card_id = self._format_web_card_id(page_card_id)

            # Pokedex number and classification
            pokedex_number = self._extract_pokedex_number(soup)
            
            # Determine supertype
            supertype = self._extract_supertype(soup, card_name, page_text)
            
            # Pokemon-specific attributes
            hp = self._extract_hp(soup) if supertype == 'POKEMON' else None
            pokemon_type = self._extract_pokemon_type(soup) if supertype == 'POKEMON' else None
            evolution_stage = self._extract_evolution_stage(soup, page_text) if supertype == 'POKEMON' else None
            weakness, weakness_value = self._extract_weakness(soup) if supertype == 'POKEMON' else (None, None)
            resistance, resistance_value = self._extract_resistance(soup) if supertype == 'POKEMON' else (None, None)
            retreat_cost = self._extract_retreat_cost(soup) if supertype == 'POKEMON' else None
            
            # Attacks and abilities
            attacks = self._extract_attacks(soup) if supertype == 'POKEMON' else []
            abilities = self._extract_abilities(soup) if supertype == 'POKEMON' else []
            
            # Evolution information
            evolves_from, evolves_to = self._extract_evolution_info(soup, evolution_stage) if supertype == 'POKEMON' else (None, None)
            
            # Card metadata
            image_url = self._extract_image_url(soup)
            collector_number = self._extract_collector_number(soup, page_text)
            expansion_code = self._extract_expansion_code(soup)
            rarity = self._extract_rarity(soup)
            illustrator = self._extract_illustrator(soup)
            
            # Rules and descriptions
            rules = self._extract_rules(soup, card_name)
            effect_text = self._extract_effect_text(soup, supertype)
            
            # Determine subtype
            subtype = self._determine_subtype(supertype, evolution_stage, soup, page_text)
            
            # Determine variant type and rarity
            variant_type = self._determine_variant_type(rarity, collector_number)
            rarity_enum = RARITY_MAP.get(rarity, 'COMMON') if rarity else 'COMMON'
            
            # Build card data in PTCG_2026 schema format
            card_data = {
                # Core identification
                "webCardId": web_card_id,
                "name": card_name,
                "language": "JA_JP",
                "region": "JP",
                
                # Card classification
                "supertype": supertype,
                "subtypes": [subtype] if subtype else [],
                "variantType": variant_type,
                "rarity": rarity_enum,
                
                # Expansion info
                "expansionCode": expansion_code or "promo",
                "collectorNumber": collector_number,
                
                # Pokemon attributes
                "hp": hp,
                "pokemonTypes": [pokemon_type] if pokemon_type else None,
                "evolutionStage": evolution_stage,
                "evolvesFrom": evolves_from,
                "evolvesTo": evolves_to,
                "ruleBox": self._extract_rulebox(card_name),
                "pokedexNumber": pokedex_number,
                
                # Combat stats
                "weakness": {
                    "type": weakness,
                    "value": weakness_value
                } if weakness else None,
                "resistance": {
                    "type": resistance,
                    "value": resistance_value
                } if resistance else None,
                "retreatCost": retreat_cost,
                
                # Abilities and attacks
                "abilities": abilities if abilities else None,
                "attacks": attacks if attacks else None,
                
                # Text and rules
                "effectText": effect_text,
                "rules": rules if rules else None,
                "flavorText": self._extract_flavor_text(soup, page_text) if supertype == 'POKEMON' else None,
                
                # Metadata
                "imageUrl": image_url,
                "illustrator": illustrator,
                "sourceUrl": url,
                "scrapedAt": datetime.now().isoformat()
            }

            # Clean empty values
            return self._clean_empty_values(card_data)

        except Exception as e:
            logger.error(f"Error extracting card info: {e}")
            return None

    def _extract_pokedex_number(self, soup: BeautifulSoup) -> Optional[int]:
        """Extract Pokedex number (e.g., No.001)"""
        card_info = soup.select_one('div.card h4') or soup.find('h4')
        if card_info:
            info_text = card_info.get_text(strip=True)
            match = re.search(r'No\.(\d+)', info_text)
            if match:
                return int(match.group(1))
        return None

    def _extract_supertype(self, soup: BeautifulSoup, card_name: str, page_text: str) -> str:
        """Determine card supertype (POKEMON, TRAINER, ENERGY)"""
        # Check for HP (Pokemon indicator)
        if re.search(r'HP\s*\d+', page_text):
            return 'POKEMON'
        
        # Check name suffix patterns
        if re.search(r'(VSTAR|VMAX|V|GX|EX|ex)$', card_name):
            return 'POKEMON'
        
        # Check for Energy cards
        if card_name.endswith('エネルギー'):
            return 'ENERGY'
        
        # Check section headings
        section_titles = ' '.join(tag.get_text(strip=True) for tag in soup.select('h2,h3'))
        
        if any(keyword in section_titles for keyword in ['ワザ', '特性']):
            return 'POKEMON'
        
        # Default to Trainer
        return 'TRAINER'

    def _extract_hp(self, soup: BeautifulSoup) -> Optional[int]:
        """Extract HP value"""
        text = soup.get_text(' ', strip=True)
        match = re.search(r'HP\s*(\d+)', text)
        return int(match.group(1)) if match else None

    def _extract_pokemon_type(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract Pokemon type from icon classes"""
        # Look in TopInfo area first to avoid Weakness/Resistance icons
        top_info = soup.select_one('div.RightBox div.TopInfo div.td-r')
        if top_info:
            for tag in top_info.find_all(['span', 'div', 'i']):
                classes = tag.get('class', [])
                for cls in classes:
                    if isinstance(cls, str) and cls.startswith('icon-') and cls != 'icon-none':
                        pokemon_type = ELEMENT_TO_TYPE.get(cls)
                        if pokemon_type and pokemon_type != 'COLORLESS':
                            return pokemon_type
        
        # Fallback: search all icons (skip table for Weakness/Resistance)
        for tag in soup.find_all(['span', 'div', 'i']):
            if tag.find_parent('table'):
                continue
            classes = tag.get('class', [])
            for cls in classes:
                if isinstance(cls, str) and cls.startswith('icon-') and cls != 'icon-none':
                    pokemon_type = ELEMENT_TO_TYPE.get(cls)
                    if pokemon_type and pokemon_type != 'COLORLESS':
                        return pokemon_type
        
        return None

    def _extract_evolution_stage(self, soup: BeautifulSoup, text: str) -> Optional[str]:
        """Extract evolution stage from the specific <span class="type"> element"""
        # Find the evolution stage in the TopInfo section
        type_span = soup.find('span', class_='type')
        if not type_span:
            return 'BASIC'  # Default if no type span found
        
        stage_text = type_span.get_text(strip=True)
        
        # Normalize whitespace (handles &nbsp; and regular spaces)
        stage_text = ' '.join(stage_text.split())
        
        # Map to database enum values
        stage_map = {
            'たね': 'BASIC',
            'たねポケモン': 'BASIC',
            '1 進化': 'STAGE_1',
            '1進化': 'STAGE_1',
            '2 進化': 'STAGE_2',
            '2進化': 'STAGE_2',
            'M進化': 'MEGA',
            'VMAX': 'VMAX',
            'VSTAR': 'VSTAR'
        }
        
        return stage_map.get(stage_text, 'BASIC')

    def _extract_weakness(self, soup: BeautifulSoup) -> Tuple[Optional[str], Optional[str]]:
        """Extract weakness type and value"""
        table = soup.find('table')
        if not table:
            return None, None

        headers = [th.get_text(strip=True) for th in table.find_all('th')]
        if '弱点' not in headers:
            return None, None

        cells = table.find_all('td')
        if not cells:
            return None, None

        weakness_cell = cells[0]
        weakness_text = weakness_cell.get_text(strip=True)
        value = '×2' if '×2' in weakness_text else None
        
        # Extract type from icon
        weakness_type = self._extract_type_from_icons(weakness_cell)
        
        return weakness_type, value

    def _extract_resistance(self, soup: BeautifulSoup) -> Tuple[Optional[str], Optional[str]]:
        """Extract resistance type and value"""
        table = soup.find('table')
        if not table:
            return None, None

        cells = table.find_all('td')
        if len(cells) < 2:
            return None, None

        resistance_cell = cells[1]
        resistance_text = resistance_cell.get_text(strip=True)
        
        if resistance_text and resistance_text != '--':
            value = resistance_text
            resistance_type = self._extract_type_from_icons(resistance_cell)
            return resistance_type, value
        
        return None, None

    def _extract_retreat_cost(self, soup: BeautifulSoup) -> Optional[int]:
        """Extract retreat cost"""
        table = soup.find('table')
        if not table:
            return None

        headers = [th.get_text(strip=True) for th in table.find_all('th')]
        if 'にげる' not in headers:
            return None

        cells = table.find_all('td')
        if len(cells) < 3:
            return None

        retreat_cell = cells[2]
        icon_count = len(retreat_cell.select('[class*="icon-"]'))
        
        return icon_count if icon_count > 0 else None

    def _extract_type_from_icons(self, element: BeautifulSoup) -> Optional[str]:
        """Extract Pokemon type from icon classes in element"""
        for tag in element.select('[class*="icon-"]'):
            classes = tag.get('class', [])
            for cls in classes:
                if isinstance(cls, str) and cls.startswith('icon-'):
                    pokemon_type = ELEMENT_TO_TYPE.get(cls)
                    if pokemon_type:
                        return pokemon_type
        return None

    def _extract_attacks(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Extract attack information"""
        attacks = []
        
        waza_section = soup.find('h2', string='ワザ')
        if not waza_section:
            return attacks

        current = waza_section.find_next_sibling()
        while current and current.name != 'h2':
            if current.name == 'h4':
                # Extract attack name
                attack_name = current.get_text(strip=True)
                
                # Extract damage (remove from name)
                damage_elem = current.find('span', class_=lambda c: c and 'Text-fjalla' in c)
                damage = None
                if damage_elem:
                    damage = damage_elem.get_text(strip=True)
                    damage_elem.decompose()
                    attack_name = current.get_text(strip=True)
                
                # Extract cost
                cost = self._extract_attack_cost(current)
                
                # Extract effect
                effect_elem = current.find_next_sibling()
                effect = None
                if effect_elem and effect_elem.name in ['p', 'div']:
                    effect = effect_elem.get_text(strip=True)
                
                attacks.append({
                    'name': attack_name,
                    'cost': cost,
                    'damage': damage,
                    'effect': effect
                })
            
            current = current.find_next_sibling()
        
        return attacks

    def _extract_attack_cost(self, attack_elem: BeautifulSoup) -> Optional[str]:
        """Extract energy cost symbols from attack"""
        symbols = []
        for tag in attack_elem.find_all(True):
            classes = tag.get('class', [])
            for cls in classes:
                if isinstance(cls, str) and cls.startswith('icon-'):
                    symbol = ICON_COST_MAP.get(cls)
                    if symbol:
                        symbols.append(symbol)
        return ''.join(symbols) if symbols else None

    def _extract_abilities(self, soup: BeautifulSoup) -> List[Dict[str, str]]:
        """Extract ability information"""
        abilities = []
        
        tokusei_section = soup.find('h2', string='特性')
        if not tokusei_section:
            return abilities

        current = tokusei_section.find_next_sibling()
        while current and current.name != 'h2':
            if current.name == 'h4':
                ability_name = current.get_text(strip=True)
                
                desc_elem = current.find_next_sibling()
                description = None
                if desc_elem and desc_elem.name in ['p', 'div']:
                    description = desc_elem.get_text(strip=True)
                
                abilities.append({
                    'name': ability_name,
                    'description': description
                })
            
            current = current.find_next_sibling()
        
        return abilities

    def _extract_image_url(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract card image URL"""
        img_elem = soup.select_one('img[src*="/card_images/large/"]')
        if img_elem:
            src = img_elem.get('src')
            if src:
                return urllib.parse.urljoin('https://www.pokemon-card.com', src)
        return None

    def _extract_collector_number(self, soup: BeautifulSoup, page_text: str) -> Optional[str]:
        """Extract collector number (e.g., '005/100' or '228')"""
        subtext = soup.select_one('div.subtext')
        text = subtext.get_text(' ', strip=True) if subtext else page_text

        # Standard set cards: "005 / 100"
        match = re.search(r'\b(\d{1,4})\s*/\s*(\d{1,4})\b', text)
        if match:
            return f"{match.group(1)}/{match.group(2)}"

        # Promo cards: "228 / SV-P"
        match = re.search(r'\b(\d{1,4})\s*/\s*([A-Za-z0-9\-]+)\b', text)
        if match:
            return match.group(1)

        return None

    def _extract_expansion_code(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract expansion code (e.g., 'sv9')"""
        # Check regulation logo
        logo = soup.select_one('img.img-regulation[alt]')
        if logo:
            alt = (logo.get('alt') or '').strip()
            if alt:
                return alt.lower()

        # Check /ex/<code>/ link
        link = soup.select_one('a[href^="/ex/"]')
        if link and link.get('href'):
            match = re.search(r'^/ex/([^/]+)/', link['href'])
            if match:
                return match.group(1).lower()
        
        return None

    def _extract_rarity(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract rarity code"""
        rarity_img = soup.select_one('img[src*="/rarity/"]')
        if not rarity_img:
            return None
        
        src = rarity_img.get('src')
        if not src:
            return None

        # Extract filename
        filename = src.rsplit('/', 1)[-1].split('?')[0].split('#')[0]
        
        # Map known rarities
        rarity_map = {
            'ic_rare_s_2.gif': 'S',
            'ic_rare_ar.gif': 'AR',
            'ic_rare_sr_c.gif': 'SR',
            'ic_rare_mur.gif': 'MUR',
            'ic_rare_sar.gif': 'SAR',
            'ic_rare_ssr.gif': 'SSR',
            'ic_rare_ur.gif': 'UR'
        }
        
        if filename.lower() in rarity_map:
            return rarity_map[filename.lower()]

        # Parse from filename pattern: ic_rare_<RARITY>
        if filename.lower().startswith('ic_rare_'):
            remainder = filename[8:].split('_')[0].split('.')[0]
            if remainder and not remainder.isdigit():
                return remainder.upper()

        return None

    def _extract_illustrator(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract illustrator name"""
        illustrator_elem = soup.find('h5', string='イラストレーター')
        if illustrator_elem:
            illustrator_p = illustrator_elem.find_next_sibling('p')
            if illustrator_p:
                link = illustrator_p.find('a')
                if link:
                    return link.get_text(strip=True)
        return None

    def _extract_rules(self, soup: BeautifulSoup, card_name: str) -> Optional[List[str]]:
        """Extract rule box text (V, VMAX, ex, etc.)"""
        rules = []
        
        # Check name for rule box keywords
        for pattern_name, pattern in RULE_BOX_PATTERNS.items():
            if re.search(pattern, card_name):
                rules.append(f"{pattern_name} rule applies")
        
        # Look for ACE SPEC indicator
        if 'ACE SPEC' in soup.get_text():
            rules.append("You can't have more than 1 ACE SPEC card in your deck")
        
        return rules if rules else None
    
    def _extract_rulebox(self, card_name: str) -> Optional[str]:
        """Extract ruleBox enum value from card name"""
        # Check name for rule box keywords (VMAX, VSTAR, etc.)
        for pattern_name, pattern in RULE_BOX_PATTERNS.items():
            if re.search(pattern, card_name):
                return pattern_name
        
        # Check for MEGA in name
        if re.search(r'M([^a-z]|$)', card_name):  # M followed by non-lowercase or end
            return 'MEGA'
        
        return None

    def _extract_effect_text(self, soup: BeautifulSoup, supertype: str) -> Optional[str]:
        """Extract card effect text (for Trainer/Energy cards)"""
        if supertype == 'POKEMON':
            return None
        
        # Method 1: Look for specific Trainer/Energy sections
        for section_title in ['グッズ', 'サポート', 'スタジアム', 'ポケモンのどうぐ', '特殊エネルギー', '基本エネルギー']:
            section = soup.find(['h2', 'h3'], string=re.compile(section_title))
            if section:
                # Get the next paragraph after the section title
                next_p = section.find_next('p')
                if next_p:
                    text = next_p.get_text(strip=True)
                    # Skip header/metadata paragraphs
                    if text and len(text) > 15 and not text.startswith('高さ') and not text.startswith('重さ'):
                        return text
        
        # Method 2: Look for paragraphs with effect-like keywords (fallback)
        for p in soup.find_all('p'):
            text = p.get_text(strip=True)
            if text and len(text) > 20:
                # Check for effect-like keywords
                if any(keyword in text for keyword in ['このカード', '自分の番', '相手の', 'ダメージ', 'ポケモン']):
                    # Skip if it's flavor text indicators
                    if not any(skip in text for skip in ['高さ：', '重さ：']):
                        return text
        
        return None

    def _extract_flavor_text(self, soup: BeautifulSoup, page_text: str) -> Optional[str]:
        """Extract Pokemon flavor text (height, weight, description)"""
        parts = []
        
        # Height and weight
        height_match = re.search(r'高さ：([\d.]+)\s*m', page_text)
        weight_match = re.search(r'重さ：([\d.]+)\s*kg', page_text)
        
        if height_match:
            parts.append(f"高さ：{height_match.group(1)} m")
        if weight_match:
            parts.append(f"重さ：{weight_match.group(1)} kg")
        
        # Description
        card_info = soup.find('h4')
        if card_info:
            desc_elem = card_info.find_next_sibling('p')
            if desc_elem:
                desc = desc_elem.get_text(' ', strip=True)
                # Remove height/weight from description
                desc = re.sub(r'高さ：[\d.]+\s*m', '', desc)
                desc = re.sub(r'重さ：[\d.]+\s*kg', '', desc)
                desc = re.sub(r'\s+', ' ', desc).strip()
                if desc:
                    parts.append(desc)
        
        return ' '.join(parts) if parts else None

    def _extract_evolution_info(self, soup: BeautifulSoup, evolution_stage: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        """
        Extract evolution information from the page
        
        Returns:
            Tuple of (evolvesFrom, evolvesTo)
        """
        evolves_from = None
        evolves_to = None
        
        # Look for the "進化" (Evolution) section heading
        evolution_section = soup.find('h2', string='進化')
        if not evolution_section:
            return None, None
        
        # Get all evolution boxes after the heading
        # The structure is: <h2>進化</h2><div class="evolution evbox">...</div>
        evolution_boxes = []
        current = evolution_section.find_next_sibling()
        
        # Collect all evolution divs
        while current and (current.name == 'div' and 'evolution' in current.get('class', [])):
            evolution_boxes.append(current)
            current = current.find_next_sibling()
        
        # Extract evolvesTo from the evolution boxes
        # For Basic Pokemon: shows what they evolve into (Stage 1)
        # For Stage 1: shows what they evolve into (Stage 2)
        # For Stage 2: may show alternate Stage 2 forms
        evolves_to_list = []
        for box in evolution_boxes:
            links = box.find_all('a')
            for link in links:
                card_name = link.get_text(strip=True)
                if card_name and len(card_name) > 1:
                    evolves_to_list.append(card_name)
        
        if evolves_to_list:
            # Join multiple evolution options with comma
            evolves_to = ', '.join(evolves_to_list[:5])  # Limit to first 5
        
        # For evolvesFrom, we need to look at the evolution stage
        # Stage 1 typically evolves from Basic Pokemon
        # We can try to extract from the page, but it's not always shown
        # For now, leave it empty - could be populated later via card name patterns
        
        return evolves_from, evolves_to

    def _determine_subtype(
        self, 
        supertype: str, 
        evolution_stage: Optional[str],
        soup: BeautifulSoup,
        page_text: str
    ) -> Optional[str]:
        """Determine card subtype - Returns None for Pokemon cards"""
        # Pokemon cards don't have subtypes (evolution stage is separate)
        if supertype == 'POKEMON':
            return None
        
        if supertype == 'ENERGY':
            if '基本' in page_text:
                return 'BASIC_ENERGY'
            return 'SPECIAL_ENERGY'
        
        # Trainer subtypes
        section_titles = ' '.join(tag.get_text(strip=True) for tag in soup.select('h2,h3'))
        
        if 'ポケモンのどうぐ' in section_titles:
            return 'TOOL'
        if 'スタジアム' in section_titles:
            return 'STADIUM'
        if any(keyword in section_titles for keyword in ['サポート', 'サポーター']):
            return 'SUPPORTER'
        
        return 'ITEM'

    def _determine_variant_type(self, rarity: Optional[str], collector_number: Optional[str]) -> str:
        """Determine variant type from rarity"""
        if rarity in VARIANT_TYPE_MAP:
            return VARIANT_TYPE_MAP[rarity]
        
        # Check if secret rare (collector number > set size)
        if collector_number and '/' in collector_number:
            parts = collector_number.split('/')
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                if int(parts[0]) > int(parts[1]):
                    return 'SECRET_RARE'
        
        return 'NORMAL'

    # ========================================================================
    # UTILITY METHODS
    # ========================================================================

    def _extract_card_id_from_url(self, url: str) -> Optional[str]:
        """Extract numeric card ID from URL"""
        match = re.search(r'/card/(\d+)', url)
        return match.group(1) if match else None

    def _format_web_card_id(self, card_id: Optional[str]) -> Optional[str]:
        """Format card ID as jp##### (e.g., jp49355)"""
        if not card_id or not card_id.isdigit():
            return None
        return f"jp{int(card_id)}"

    def _is_valid_card_data(self, data: Dict[str, Any]) -> bool:
        """Check if card data is valid"""
        return bool(data.get('name') and data.get('webCardId'))

    def _clean_empty_values(self, data: Any) -> Any:
        """Recursively remove None, empty strings, and empty collections"""
        if isinstance(data, dict):
            return {
                key: self._clean_empty_values(value)
                for key, value in data.items()
                if value is not None and value != "" and value != [] and value != {}
            }
        elif isinstance(data, list):
            return [self._clean_empty_values(item) for item in data]
        return data


# ============================================================================
# CLI AND BATCH PROCESSING
# ============================================================================

def build_card_url(card_id: int) -> str:
    """Build card detail URL from ID"""
    return f"https://www.pokemon-card.com/card-search/details.php/card/{card_id}/regu/XY"


def scrape_batch(
    card_ids: List[int],
    scraper: JapaneseCardScraper,
    cache_html: bool = False,
    refresh_cache: bool = False,
    cache_only: bool = False,
    threads: int = 1
) -> List[Dict[str, Any]]:
    """
    Scrape multiple cards with optional threading
    
    Args:
        card_ids: List of card IDs to scrape
        scraper: Scraper instance
        cache_html: Save HTML to cache
        refresh_cache: Force re-fetch
        cache_only: Only use cache
        threads: Number of threads (1 = sequential)
        
    Returns:
        List of scraped card data
    """
    urls = [build_card_url(card_id) for card_id in card_ids]
    results = []
    
    def scrape_one(url: str) -> Optional[Dict[str, Any]]:
        return scraper.scrape_card_details(url, cache_html, refresh_cache, cache_only)
    
    if threads > 1:
        with ThreadPoolExecutor(max_workers=threads) as executor:
            future_to_url = {executor.submit(scrape_one, url): url for url in urls}
            for future in as_completed(future_to_url):
                data = future.result()
                if data:
                    results.append(data)
    else:
        for url in urls:
            data = scrape_one(url)
            if data:
                results.append(data)
    
    return results


def save_cards_by_expansion(cards: List[Dict[str, Any]], output_path: Path, compact: bool = False) -> None:
    """
    Save cards grouped by expansion to separate JSON files
    
    Args:
        cards: List of card data
        output_path: Base output path
        compact: Use compact JSON formatting
    """
    # Group by expansion
    by_expansion = defaultdict(list)
    for card in cards:
        expansion = card.get('expansionCode', 'unknown')
        by_expansion[expansion].append(card)
    
    # Save each expansion
    output_dir = output_path.parent
    base_name = output_path.stem
    
    for expansion, expansion_cards in by_expansion.items():
        file_path = output_dir / f"{base_name}_{expansion}.json"
        
        with open(file_path, 'w', encoding='utf-8') as f:
            if compact:
                json.dump(expansion_cards, f, ensure_ascii=False, separators=(',', ':'))
            else:
                json.dump(expansion_cards, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Saved {len(expansion_cards)} cards to {file_path}")


def parse_args() -> argparse.Namespace:
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(
        description='Scrape Japanese Pokemon cards from pokemon-card.com'
    )
    
    # Card selection
    parser.add_argument('--ids', type=str, help='Comma-separated card IDs')
    parser.add_argument('--id-range', nargs=2, type=int, metavar=('START', 'COUNT'),
                        help='Start ID and number of cards to scrape')
    
    # Output options
    parser.add_argument('--output', default='japanese_cards.json',
                        help='Output JSON file path (default: japanese_cards.json)')
    parser.add_argument('--compact-json', action='store_true',
                        help='Use compact JSON formatting')
    
    # Caching options
    parser.add_argument('--cache-html', action='store_true',
                        help='Save HTML responses to cache')
    parser.add_argument('--refresh-cache', action='store_true',
                        help='Force re-fetch cached HTML')
    parser.add_argument('--cache-only', action='store_true',
                        help='Only use cached HTML, skip HTTP requests')
    
    # Filtering
    parser.add_argument('--expansions', type=str,
                        help='Comma-separated expansion codes to filter (e.g., "sv8,sv9")')
    
    # Performance
    parser.add_argument('--threads', type=int, default=1,
                        help='Number of parallel threads (default: 1)')
    parser.add_argument('--min-request-interval', type=float, default=2.0,
                        help='Minimum seconds between requests (default: 2.0)')
    parser.add_argument('--quiet', action='store_true',
                        help='Suppress per-card logging')
    
    return parser.parse_args()


def main():
    """Main CLI entry point"""
    args = parse_args()
    
    # Determine card IDs to scrape
    if args.ids:
        card_ids = [int(x.strip()) for x in args.ids.split(',') if x.strip()]
    elif args.id_range:
        start, count = args.id_range
        card_ids = list(range(start, start + count))
    else:
        card_ids = DEFAULT_SAMPLE_IDS
        logger.info("No IDs specified, using default sample cards")
    
    # Initialize scraper
    scraper = JapaneseCardScraper()
    scraper.min_request_interval = args.min_request_interval
    scraper.quiet = args.quiet
    
    # Scrape cards
    logger.info(f"Starting scrape of {len(card_ids)} cards...")
    start_time = time.time()
    
    cards = scrape_batch(
        card_ids,
        scraper,
        cache_html=args.cache_html or args.cache_only,
        refresh_cache=args.refresh_cache,
        cache_only=args.cache_only,
        threads=args.threads
    )
    
    elapsed = time.time() - start_time
    
    # Filter by expansion if specified
    if args.expansions:
        expansion_filter = set(x.strip().lower() for x in args.expansions.split(','))
        original_count = len(cards)
        cards = [c for c in cards if c.get('expansionCode', '').lower() in expansion_filter]
        logger.info(f"Filtered {original_count} → {len(cards)} cards for expansions: {expansion_filter}")
    
    # Save results
    output_path = Path(args.output)
    save_cards_by_expansion(cards, output_path, args.compact_json)
    
    # Summary
    logger.info(f"\n{'='*60}")
    logger.info(f"✅ Scraped {len(cards)} cards in {elapsed:.2f}s")
    logger.info(f"⏱️  Average: {elapsed/len(card_ids):.2f}s per card")
    
    # Stats
    by_expansion = Counter(c.get('expansionCode', 'unknown') for c in cards)
    by_rarity = Counter(c.get('rarity', 'unknown') for c in cards)
    by_supertype = Counter(c.get('supertype', 'unknown') for c in cards)
    
    logger.info(f"\n📦 By Expansion: {dict(by_expansion)}")
    logger.info(f"✨ By Rarity: {dict(by_rarity)}")
    logger.info(f"🎴 By Type: {dict(by_supertype)}")


if __name__ == '__main__':
    main()
