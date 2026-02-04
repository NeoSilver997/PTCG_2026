
import requests
import re

url = "https://asia.pokemon-card.com/hk/card-search/list/?expansionCodes=M3"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

print(f"Fetching raw HTML from {url}")
r = requests.get(url, headers=headers)
print(f"Content length: {len(r.text)}")

# Check for keywords indicating data source
print("API endpoints in code:", re.findall(r'api/[a-zA-Z0-9_/]+', r.text))
print("JSON data in code:", len(re.findall(r'json', r.text, re.IGNORECASE)))
print("Card ID patterns:", len(re.findall(r'details\.php/card/\d+', r.text)))
