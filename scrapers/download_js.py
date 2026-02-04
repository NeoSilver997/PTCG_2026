
import requests

url = "https://asia.pokemon-card.com/build/app.js"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

print(f"Downloading {url}...")
r = requests.get(url, headers=headers)
with open("scrapers/app.js", "w", encoding="utf-8") as f:
    f.write(r.text)
print("Saved to scrapers/app.js")
