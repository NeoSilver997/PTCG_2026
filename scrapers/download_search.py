
import requests

url = "https://asia.pokemon-card.com/hk/card-search/"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

print(f"Downloading {url}...")
r = requests.get(url, headers=headers)
with open("scrapers/search_page.html", "w", encoding="utf-8") as f:
    f.write(r.text)
print("Saved to scrapers/search_page.html")
