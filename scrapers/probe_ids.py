
import requests
import sys

base_urls = [
    "https://asia.pokemon-card.com/hk/card-search/details.php/card/{}/regu/all",
    "https://asia.pokemon-card.com/sg/card-search/details.php/card/{}/regu/all",
    "https://asia.pokemon-card.com/hk/card-search/details.php/card/{}",
    "https://asia.pokemon-card.com/sg/card-search/details.php/card/{}"
]

test_ids = [
    "1000", "2000", "14744", "00014744", "00001000", "01000",
    "49355", "00049355" # Try JP ID on Asia site
]

for cid in test_ids:
    for url_tmpl in base_urls:
        url = url_tmpl.format(cid)
        try:
            print(f"Probing: {url}")
            r = requests.head(url, timeout=2)
            if r.status_code == 200:
                print(f"FOUND VALID ID: {cid} at {url}")
                sys.exit(0)
        except Exception as e:
            print(f"Error: {e}")
print("No valid ID found in test set")
