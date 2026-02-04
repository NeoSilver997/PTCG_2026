
import requests
from bs4 import BeautifulSoup
import re

urls = [
    "https://asia.pokemon-card.com/hk/card-search/list/?expansionCodes=M3",
    "https://asia.pokemon-card.com/hk-en/card-search/list/?expansionCodes=ME02"
]

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

for url in urls:
    print(f"\n--- Fetching {url} ---")
    try:
        r = requests.get(url, headers=headers, timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, 'html.parser')
            
            # Look for links to card details
            # Pattern typically involves /card-search/details.php/card/ID
            links = soup.find_all('a', href=re.compile(r'details\.php/card/\d+'))
            print(f"Found {len(links)} card links")
            
            for i, link in enumerate(links[:3]):
                print(f"Link {i}: {link.get('href')}")
                
            # Also check for pagination to know if we need to crawl multiple pages
            pagination = soup.find_all('div', class_='pagination')
            print(f"Pagination found: {len(pagination) > 0}")
            
    except Exception as e:
        print(f"Error: {e}")
