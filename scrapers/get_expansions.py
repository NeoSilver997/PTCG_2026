
import requests
from bs4 import BeautifulSoup
import re
import json

urls = [
    "https://asia.pokemon-card.com/hk/card-search/",
    "https://asia.pokemon-card.com/sg/card-search/"
]

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

for url in urls:
    print(f"\n--- Fetching {url} ---")
    try:
        r = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(r.text, 'html.parser')
        
        # Look for expansion checkboxes or select options
        # Common pattern: input type="checkbox" name="expansionCodes[]" value="M3"
        expansions = []
        
        # Check checkboxes
        checkboxes = soup.find_all('input', {'name': re.compile(r'expansion')})
        for cb in checkboxes:
            code = cb.get('value')
            label = cb.find_parent().get_text(strip=True) if cb.find_parent() else code
            expansions.append({'code': code, 'name': label})
            
        # Check select options
        options = soup.find_all('option')
        for opt in options:
            if opt.get('value') and len(opt.get('value')) < 10: # Simple heuristic
                expansions.append({'code': opt.get('value'), 'name': opt.get_text(strip=True)})
                
        # Look for JS data objects
        scripts = soup.find_all('script')
        for s in scripts:
            if s.string:
                if 'expansion' in s.string.lower():
                    pass # print("Found 'expansion' keyword in script tag (truncated):")

        print(f"Found {len(expansions)} expansions")
        
        # Save to file
        region = 'hk' if 'hk' in url else 'sg'
        with open(f"data/expansions_{region}.json", "w", encoding="utf-8") as f:
            json.dump(expansions, f, ensure_ascii=False, indent=2)
        print(f"Saved to data/expansions_{region}.json")
            
    except Exception as e:
        print(f"Error: {e}")
