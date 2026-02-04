#!/usr/bin/env python3
"""
Hong Kong Pokemon Card Scraper for PTCG_2026
Scrapes card details from asia.pokemon-card.com/hk and saves to data/cards JSON files

Features:
- Multi-threaded scraping with rate limiting
- HTML caching for offline processing
- Automatic expansion grouping
- Maps HK data to PTCG_2026 schema
- Enhanced rarity detection logic

Sample usage:
    python scrapers/src/hk_card_scraper.py --id-range 1000 100 --cache-html
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
from concurrent.futures import ThreadPoolExecutor, as_completed
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
# MAPPING CONSTANTS (Inherited from Japanese Scraper but adapted for HK)
# ============================================================================

# Energy cost icons to symbols (HK uses same icons usually)
ICON_COST_MAP = {
    'icon-fire': 'Fire',
    'icon-water': 'Water',
    'icon-lightning': 'Lightning',
    'icon-electric': 'Lightning',
    'icon-grass': 'Grass',
    'icon-fighting': 'Fighting',
    'icon-psychic': 'Psychic',
    'icon-darkness': 'Darkness',
    'icon-dark': 'Darkness',
    'icon-metal': 'Metal',
    'icon-steel': 'Metal',
    'icon-none': 'Colorless',
    'icon-colorless': 'Colorless',
    'icon-fairy': 'Fairy',
    'icon-dragon': 'Dragon'
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

# Rarity mapping (HK specific adjustments)
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
    'S': 'PROMO',
    'TR': 'TRAINER_RARE'
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
    'RADIANT': r'^Radiant'
}

class HkCardScraper:
    """Scraper for Hong Kong Pokemon card details"""

    def __init__(self, data_root: Optional[str] = None):
        if data_root is None:
            script_dir = Path(__file__).parent.parent.parent
            data_root = script_dir / 'data'
        
        self.data_root = Path(data_root)
        self.cards_dir = self.data_root / 'cards' / 'hongkong'
        self.html_dir = self.data_root / 'html' / 'hongkong'
        
        self.user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        self.min_request_interval = 2.0
        self.quiet = False

    def scrape_card_details(
        self,
        card_url: str,
        cache_html: bool = False,
        refresh_cache: bool = False,
        cache_only: bool = False
    ) -> Optional[Dict[str, Any]]:
        try:
            card_id = self._extract_card_id_from_url(card_url)
            cache_path = self.html_dir / f"{card_id}.html" if card_id and cache_html else None
            html_text = None

            if cache_path and cache_path.exists() and not refresh_cache:
                if not self.quiet:
                    logger.info(f"Using cached HTML for card {card_id}")
                html_text = cache_path.read_text(encoding='utf-8')
            else:
                if cache_only:
                    if not self.quiet:
                        logger.warning(f"Cache miss for {card_id}, skipping (cache-only mode)")
                    return None
                
                if not self.quiet:
                    logger.info(f"Fetching {card_url}")
                
                time.sleep(self.min_request_interval)
                response = requests.get(card_url, headers={'User-Agent': self.user_agent}, timeout=10)
                response.raise_for_status()
                html_text = response.text
                
                if cache_path:
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    cache_path.write_text(html_text, encoding='utf-8')

            soup = BeautifulSoup(html_text, _BS4_PARSER)
            card_data = self._extract_card_info(soup, card_url)

            if card_data and self._is_valid_card_data(card_data):
                if not self.quiet:
                    logger.info(f"Successfully scraped: {card_data['name']} ({card_data['webCardId']})")
                return card_data
            else:
                if not self.quiet:
                    logger.error(f"Failed to parse card data for {card_url}")
                return None

        except Exception as e:
            if not self.quiet:
                import traceback
                logger.error(f"Error scraping {card_url}: {e}")
                logger.error(traceback.format_exc())
            return None

    def _extract_card_info(self, soup: BeautifulSoup, url: str) -> Optional[Dict[str, Any]]:
        card_name_h1 = soup.find('h1')
        if not card_name_h1:
            return None
        
        # Extract raw name from h1
        raw_card_name = card_name_h1.get_text(strip=True)
        raw_card_name = re.sub(r'\s+', ' ', raw_card_name).strip()
        
        # Extract evolution stage from evolveMarker span
        evolution_marker = card_name_h1.find('span', class_='evolveMarker')
        evolution_stage_text = evolution_marker.get_text(strip=True) if evolution_marker else None
        
        # Clean card name (remove evolution stage prefix)
        card_name = raw_card_name
        if evolution_stage_text:
            # Remove patterns like "基礎", "1階進化", "2階進化", "Basic", "Stage 1", "Stage 2"
            card_name = re.sub(r'^(基礎|1階進化|2階進化|Basic|Stage\s*1|Stage\s*2)\s*', '', card_name).strip()
        
        page_text = soup.get_text()
        
        # Basic extraction
        card_id = self._extract_card_id_from_url(url)
        web_card_id = self._format_web_card_id(card_id)
        
        # Enhanced Rarity Logic
        rarity = self._extract_rarity(soup)
        
        collector_number = self._extract_collector_number(soup, page_text)
        expansion_code = self._extract_expansion_code(soup)
        
        supertype = self._extract_supertype(soup, card_name, page_text)
        evolution_stage = self._extract_evolution_stage_from_marker(evolution_stage_text) if supertype == 'POKEMON' else None
        subtype = self._determine_subtype(supertype, evolution_stage, soup, page_text)
        
        # Extract Pokemon type from main info section
        pokemon_type = self._extract_pokemon_type(soup) if supertype == 'POKEMON' else None
        
        data = {
            'webCardId': web_card_id,
            'name': card_name,
            'language': 'ZH_HK',
            'region': 'HK',
            'supertype': supertype,
            'subtype': subtype,
            'variantType': self._determine_variant_type(rarity, collector_number),
            'rarity': RARITY_MAP.get(rarity, 'COMMON') if rarity else 'COMMON',
            'expansionCode': expansion_code,
            'collectorNumber': collector_number,
            'imageUrl': self._extract_image_url(soup),
            'sourceUrl': url,
            'scrapedAt': datetime.now().isoformat(),
            'rawRarity': rarity 
        }

        if supertype == 'POKEMON':
            weakness_type, weakness_value = self._extract_weakness(soup)
            
            data.update({
                'hp': self._extract_hp(soup),
                'pokemonTypes': [pokemon_type] if pokemon_type else [],
                'evolutionStage': evolution_stage,
                'evolvesTo': self._extract_evolves_to(soup),
                'attacks': self._extract_attacks(soup),
                'abilities': self._extract_abilities(soup),
                'weakness': {'type': weakness_type, 'value': weakness_value} if weakness_type else None,
                'retreatCost': self._extract_retreat_cost(soup),
                'ruleBox': self._extract_rulebox(card_name),
                'pokedexNumber': self._extract_pokedex_number(soup),
                'flavorText': self._extract_flavor_text(soup)
            })
        
        return self._clean_empty_values(data)

    def _extract_rarity(self, soup: BeautifulSoup) -> Optional[str]:
        """
        Enhanced rarity extraction for HK site
        Strategies:
        1. Check for image filename (similar to JP)
        2. Check for text content in rarity span/div
        3. Check for class names indicating rarity
        """
        # Strategy 1: Image filename
        rarity_img = soup.select_one('img[src*="/rarity/"]')
        if rarity_img:
            src = rarity_img.get('src')
            if src:
                filename = src.rsplit('/', 1)[-1].split('?')[0]
                # Map known files
                if filename.startswith('ic_rare_'):
                     parts = filename.replace('ic_rare_', '').split('.')
                     if parts:
                         return parts[0].upper()
        
        # Strategy 2: Text content (HK specific)
        # Often in a span class="rarity" or td
        rarity_elem = soup.find('span', class_='rarity')
        if rarity_elem:
            return rarity_elem.get_text(strip=True).upper()
            
        # Strategy 3: Table check
        table = soup.find('table')
        if table:
            for row in table.find_all('tr'):
                header = row.find('th')
                if header:
                    header_text = header.get_text()
                    if 'Rarity' in header_text or '稀有度' in header_text:
                        cell = row.find('td')
                        if cell:
                            return cell.get_text(strip=True).upper()

        return None

    # ... (Include other extraction methods similar to Japanese scraper but adapted)
    
    def _extract_card_id_from_url(self, url: str) -> Optional[str]:
        # Match /detail/12345/ or /details.php/card/12345
        match = re.search(r'/(?:detail|card)/(\d+)', url)
        return match.group(1) if match else None

    def _format_web_card_id(self, card_id: Optional[str]) -> Optional[str]:
        return f"hk{int(card_id)}" if card_id and card_id.isdigit() else None

    def _clean_empty_values(self, data: Any) -> Any:
        if isinstance(data, dict):
            return {k: self._clean_empty_values(v) for k, v in data.items() if v}
        return data

    def _extract_supertype(self, soup: BeautifulSoup, card_name: str, page_text: str) -> str:
        """Determine card supertype (POKEMON, TRAINER, ENERGY)"""
        if re.search(r'HP\s*\d+', page_text): return 'POKEMON'
        if re.search(r'(VSTAR|VMAX|V|GX|EX|ex)$', card_name): return 'POKEMON'
        if 'Energy' in card_name or '能量' in card_name: return 'ENERGY'
        section_titles = ' '.join(tag.get_text(strip=True) for tag in soup.select('h2,h3'))
        if any(keyword in section_titles for keyword in ['招式', '特性']): return 'POKEMON'
        return 'TRAINER'

    def _extract_hp(self, soup: BeautifulSoup) -> Optional[int]:
        if not soup: return None
        text = soup.get_text()
        if not text: return None
        match = re.search(r'HP\s*(\d+)', text)
        return int(match.group(1)) if match else None

    def _extract_pokemon_type(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract Pokemon type from the main information section"""
        if not soup: return None
        
        # Look for type in mainInfomation section
        main_info = soup.find('p', class_='mainInfomation')
        if main_info:
            type_img = main_info.find('img')
            if type_img and type_img.get('src'):
                src = type_img.get('src', '')
                # Extract from image filename
                if 'Grass' in src: return 'GRASS'
                if 'Fire' in src: return 'FIRE'
                if 'Water' in src: return 'WATER'
                if 'Lightning' in src: return 'LIGHTNING'
                if 'Psychic' in src: return 'PSYCHIC'
                if 'Fighting' in src: return 'FIGHTING'
                if 'Darkness' in src: return 'DARKNESS'
                if 'Metal' in src: return 'METAL'
                if 'Fairy' in src: return 'FAIRY'
                if 'Dragon' in src: return 'DRAGON'
                if 'Colorless' in src: return 'COLORLESS'
        
        # Fallback to old icon-based method
        for tag in soup.find_all(['span', 'div', 'i']):
            if tag.find_parent('table'): continue
            classes = tag.get('class', [])
            for cls in classes:
                if isinstance(cls, str) and cls.startswith('icon-') and cls != 'icon-none':
                    pokemon_type = ELEMENT_TO_TYPE.get(cls)
                    if pokemon_type and pokemon_type != 'COLORLESS': return pokemon_type
        return None

    def _extract_evolution_stage_from_marker(self, marker_text: Optional[str]) -> Optional[str]:
        """Extract evolution stage from the evolveMarker span text"""
        if not marker_text:
            return 'BASIC'
        
        marker_text = marker_text.strip()
        
        # Chinese patterns
        if marker_text == '基礎' or marker_text == 'Basic':
            return 'BASIC'
        if marker_text == '1階進化' or marker_text == 'Stage 1':
            return 'STAGE_1'
        if marker_text == '2階進化' or marker_text == 'Stage 2':
            return 'STAGE_2'
        
        # Special mechanics
        if 'VMAX' in marker_text:
            return 'VMAX'
        if 'VSTAR' in marker_text:
            return 'VSTAR'
        if 'V-UNION' in marker_text:
            return 'V_UNION'
        if 'BREAK' in marker_text:
            return 'BREAK'
        
        return 'BASIC'

    def _determine_subtype(self, supertype: str, evolution_stage: Optional[str], soup: BeautifulSoup, page_text: str) -> Optional[str]:
        if supertype == 'POKEMON': return None
        if supertype == 'ENERGY': return 'BASIC_ENERGY' if '基本' in page_text or 'Basic' in page_text else 'SPECIAL_ENERGY'
        
        section_titles = ' '.join(tag.get_text(strip=True) for tag in soup.select('h2,h3') if tag)
        if 'Tool' in section_titles or '道具' in section_titles: return 'TOOL'
        if 'Stadium' in section_titles or '競技場' in section_titles: return 'STADIUM'
        if 'Supporter' in section_titles or '支援者' in section_titles: return 'SUPPORTER'
        return 'ITEM'

    def _determine_variant_type(self, rarity: Optional[str], collector_number: Optional[str]) -> str:
        if rarity in VARIANT_TYPE_MAP: return VARIANT_TYPE_MAP[rarity]
        return 'NORMAL'

    def _extract_collector_number(self, soup: BeautifulSoup, page_text: str) -> Optional[str]:
        subtext = soup.select_one('div.subtext')
        text = subtext.get_text(' ', strip=True) if subtext else page_text
        match = re.search(r'\b(\d{1,4})\s*/\s*(\d{1,4})\b', text)
        if match: return f"{match.group(1)}/{match.group(2)}"
        return None

    def _extract_expansion_code(self, soup: BeautifulSoup) -> Optional[str]:
        logo = soup.select_one('img.img-regulation[alt]')
        if logo: return (logo.get('alt') or '').strip().lower()
        link = soup.select_one('a[href^="/ex/"]')
        if link and link.get('href'):
            match = re.search(r'^/ex/([^/]+)/', link['href'])
            if match: return match.group(1).lower()
        
        # Fallback: check expansion column
        exp_col = soup.find('section', class_='expansionColumn')
        if exp_col:
            img = exp_col.find('img')
            if img and img.get('src'):
                # Extract from filename like M2F_exp.png
                filename = img['src'].split('/')[-1]
                code = filename.split('_')[0]
                # Remove last char if it indicates set A/B (e.g. M2F -> M2) - heuristic
                if code.endswith('F') or code.endswith('L') or code.endswith('S'):
                     return code # actually return the full code for now to be safe
                return code.lower()
        return None

    def _extract_image_url(self, soup: BeautifulSoup) -> Optional[str]:
        img_elem = soup.select_one('img[src*="/card-img/"]')
        if img_elem:
            src = img_elem.get('src')
            if src: return urllib.parse.urljoin('https://asia.pokemon-card.com', src)
        return None

    def _extract_attacks(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Extract attacks (exclude abilities with [特性] prefix)"""
        attacks = []
        skill_info = soup.find('div', class_='skillInformation')
        if not skill_info: return attacks
        
        for skill_div in skill_info.find_all('div', class_='skill'):
            # Name
            name_span = skill_div.find('span', class_='skillName')
            if not name_span: continue
            
            name = name_span.get_text(strip=True)
            
            # Skip if this is an ability (has [特性] or [Ability] prefix)
            if '[特性]' in name or '[Ability]' in name:
                continue
            
            # Damage
            dmg_span = skill_div.find('span', class_='skillDamage')
            damage = dmg_span.get_text(strip=True) if dmg_span else None
            
            # Cost
            cost_span = skill_div.find('span', class_='skillCost')
            cost = self._extract_attack_cost(cost_span) if cost_span else None
            
            # Effect
            effect_p = skill_div.find('p', class_='skillEffect')
            effect = effect_p.get_text(strip=True) if effect_p else None
            
            attacks.append({'name': name, 'cost': cost, 'damage': damage, 'effect': effect})
            
        return attacks

    def _extract_attack_cost(self, attack_elem: BeautifulSoup) -> Optional[str]:
        symbols = []
        for img in attack_elem.find_all('img'):
            src = img.get('src', '')
            for key, val in ICON_COST_MAP.items():
                if key.replace('icon-', '') in src.lower(): # Loose matching on filename
                     symbols.append(val)
                     break
            # Fallback based on image filename
            if 'Grass' in src: symbols.append('Grass')
            elif 'Fire' in src: symbols.append('Fire')
            elif 'Water' in src: symbols.append('Water')
            elif 'Lightning' in src: symbols.append('Lightning')
            elif 'Psychic' in src: symbols.append('Psychic')
            elif 'Fighting' in src: symbols.append('Fighting')
            elif 'Darkness' in src: symbols.append('Darkness')
            elif 'Metal' in src: symbols.append('Metal')
            elif 'Fairy' in src: symbols.append('Fairy')
            elif 'Dragon' in src: symbols.append('Dragon')
            elif 'Colorless' in src: symbols.append('Colorless')

        return ''.join(symbols) if symbols else None

    def _extract_abilities(self, soup: BeautifulSoup) -> List[Dict[str, str]]:
        """Extract abilities (identified by [特性] or [Ability] prefix)"""
        abilities = []
        skill_info = soup.find('div', class_='skillInformation')
        if not skill_info: return abilities
        
        for skill_div in skill_info.find_all('div', class_='skill'):
            name_span = skill_div.find('span', class_='skillName')
            if not name_span: continue
            
            name_text = name_span.get_text(strip=True)
            
            # Check if this is an ability (has [特性] or [Ability] prefix)
            if '[特性]' in name_text or '[Ability]' in name_text:
                # Remove the prefix to get clean name
                name = name_text.replace('[特性]', '').replace('[Ability]', '').strip()
                effect_p = skill_div.find('p', class_='skillEffect')
                desc = effect_p.get_text(strip=True) if effect_p else None
                abilities.append({'name': name, 'description': desc})
                
        return abilities

    def _extract_weakness(self, soup: BeautifulSoup) -> Tuple[Optional[str], Optional[str]]:
        table = soup.find('table')
        if not table: return None, None
        
        # Looking for Weakness cell
        weak_td = table.find('td', class_='weakpoint')
        if not weak_td: return None, None
        
        type_img = weak_td.find('img')
        type_val = None
        if type_img:
             src = type_img.get('src', '')
             if 'Grass' in src: type_val = 'GRASS'
             elif 'Fire' in src: type_val = 'FIRE'
             elif 'Water' in src: type_val = 'WATER'
             elif 'Lightning' in src: type_val = 'LIGHTNING'
             elif 'Psychic' in src: type_val = 'PSYCHIC'
             elif 'Fighting' in src: type_val = 'FIGHTING'
             elif 'Darkness' in src: type_val = 'DARKNESS'
             elif 'Metal' in src: type_val = 'METAL'
             elif 'Fairy' in src: type_val = 'FAIRY'
             elif 'Dragon' in src: type_val = 'DRAGON'
             elif 'Colorless' in src: type_val = 'COLORLESS'
             
        val_text = weak_td.get_text(strip=True)
        value = '×2' if '×2' in val_text else None
        
        return type_val, value

    def _extract_type_from_icons(self, element: BeautifulSoup) -> Optional[str]:
        # Not used with new logic
        return None

    def _extract_retreat_cost(self, soup: BeautifulSoup) -> Optional[int]:
        table = soup.find('table')
        if not table: return None
        escape_td = table.find('td', class_='escape')
        if not escape_td: return 0
        return len(escape_td.find_all('img'))

    def _extract_rulebox(self, card_name: str) -> Optional[str]:
        for pattern_name, pattern in RULE_BOX_PATTERNS.items():
            if re.search(pattern, card_name): return pattern_name
        return None

    def _is_valid_card_data(self, data: Dict[str, Any]) -> bool:
        return bool(data.get('name') and data.get('webCardId'))
    
    def _extract_evolves_to(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract evolution chain from evolution section"""
        evolution_div = soup.find('div', class_='evolution')
        if not evolution_div:
            return None
        
        # Extract all evolution names from the chain
        evolution_names = []
        for link in evolution_div.find_all('a'):
            name = link.get_text(strip=True)
            if name:
                evolution_names.append(name)
        
        return ', '.join(evolution_names) if evolution_names else None
    
    def _extract_pokedex_number(self, soup: BeautifulSoup) -> Optional[int]:
        """Extract Pokedex number from extra information section"""
        extra_info = soup.find('div', class_='extraInformation')
        if not extra_info:
            return None
        
        # Look for pattern like "No.272" or "No. 272"
        text = extra_info.get_text()
        match = re.search(r'No\.?\s*(\d+)', text)
        if match:
            return int(match.group(1))
        
        return None
    
    def _extract_flavor_text(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract flavor text (height, weight, description)"""
        extra_info = soup.find('div', class_='extraInformation')
        if not extra_info:
            return None
        
        # Look for size paragraph (height/weight)
        size_p = extra_info.find('p', class_='size')
        description_p = extra_info.find('p', class_='discription')  # Note: their typo
        
        parts = []
        if size_p:
            parts.append(size_p.get_text(strip=True))
        if description_p:
            parts.append(description_p.get_text(strip=True))
        
        return ' '.join(parts) if parts else None

# ============================================================================
# CLI AND BATCH PROCESSING
# ============================================================================

def build_card_url(card_id: int) -> str:
    # Updated to match the user's provided URL format
    return f"https://asia.pokemon-card.com/hk/card-search/detail/{card_id}/"

def scrape_batch(
    card_ids: List[int],
    scraper: HkCardScraper,
    cache_html: bool = False,
    refresh_cache: bool = False,
    cache_only: bool = False,
    threads: int = 1
) -> List[Dict[str, Any]]:
    urls = [build_card_url(card_id) for card_id in card_ids]
    results = []
    
    def scrape_one(url: str) -> Optional[Dict[str, Any]]:
        return scraper.scrape_card_details(url, cache_html, refresh_cache, cache_only)
    
    if threads > 1:
        with ThreadPoolExecutor(max_workers=threads) as executor:
            future_to_url = {executor.submit(scrape_one, url): url for url in urls}
            for future in as_completed(future_to_url):
                data = future.result()
                if data: results.append(data)
    else:
        for url in urls:
            data = scrape_one(url)
            if data: results.append(data)
    return results

def save_cards_by_expansion(cards: List[Dict[str, Any]], output_path: Path, compact: bool = False) -> None:
    by_expansion = defaultdict(list)
    for card in cards:
        expansion = card.get('expansionCode', 'unknown')
        by_expansion[expansion].append(card)
    
    output_dir = output_path.parent
    base_name = output_path.stem
    
    for expansion, expansion_cards in by_expansion.items():
        file_path = output_dir / f"{base_name}_{expansion}.json"
        with open(file_path, 'w', encoding='utf-8') as f:
            if compact: json.dump(expansion_cards, f, ensure_ascii=False, separators=(',', ':'))
            else: json.dump(expansion_cards, f, ensure_ascii=False, indent=2)
        logger.info(f"Saved {len(expansion_cards)} cards to {file_path}")

def main():
    parser = argparse.ArgumentParser(description='HK Card Scraper')
    parser.add_argument('--ids', type=str, help='Comma-separated card IDs')
    parser.add_argument('--id-range', nargs=2, type=int)
    parser.add_argument('--output', default='hk_cards.json')
    parser.add_argument('--cache-html', action='store_true')
    parser.add_argument('--refresh-cache', action='store_true')
    parser.add_argument('--cache-only', action='store_true')
    parser.add_argument('--threads', type=int, default=1)
    parser.add_argument('--quiet', action='store_true')
    parser.add_argument('--expansion', type=str, help='Filter by expansion code (requires fetch_expansion_ids implementation)')
    
    args = parser.parse_args()
    
    scraper = HkCardScraper()
    scraper.quiet = args.quiet
    
    card_ids = []
    
    if args.ids:
        card_ids = [int(x.strip()) for x in args.ids.split(',') if x.strip()]
    elif args.id_range:
        start, count = args.id_range
        card_ids = list(range(start, start + count))
    elif args.expansion:
        # Placeholder for future implementation of fetching IDs by expansion
        # For now, this would require a separate tool or manual ID input
        logger.warning("Fetching by expansion code is not fully implemented due to site structure (JS-rendered). Please provide --id-range.")
        return
    else:
        card_ids = [1000]

    logger.info(f"Starting scrape of {len(card_ids)} cards...")
    cards = scrape_batch(
        card_ids,
        scraper,
        cache_html=args.cache_html or args.cache_only,
        refresh_cache=args.refresh_cache,
        cache_only=args.cache_only,
        threads=args.threads
    )
    
    save_cards_by_expansion(cards, Path(args.output), False)
    logger.info(f"Scraped {len(cards)} cards")

if __name__ == '__main__':
    main()
