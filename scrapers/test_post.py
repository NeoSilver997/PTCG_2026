
import requests
from bs4 import BeautifulSoup

url = "https://asia.pokemon-card.com/hk/card-search/list/"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}
data = {
    'expansionCodes': 'SV8',
    'keyword': '',
    'cardType': 'all',
    'regulation': 'all'
}

print(f"POSTing to {url} with data {data}")
try:
    r = requests.post(url, headers=headers, data=data, timeout=10)
    print(f"Status: {r.status_code}")
    print(f"Content length: {len(r.text)}")
    
    # Check for card links
    with open("scrapers/post_response.html", "w", encoding="utf-8") as f:
        f.write(r.text)
    print("Saved response to scrapers/post_response.html")

    soup = BeautifulSoup(r.text, 'html.parser')
    links = soup.find_all('a', href=lambda h: h and 'details.php/card/' in h)
    
    print(f"Found {len(links)} card links")
    for i, link in enumerate(links[:5]):
        print(f"  - {link.get('href')}")
        
except Exception as e:
    print(f"Error: {e}")
