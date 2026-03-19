import requests
from bs4 import BeautifulSoup
import re
import json
import time

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

# Load existing detailed expansions if available
detailed_file = "../data/expansions_en_detailed.json"
try:
    with open(detailed_file, "r", encoding="utf-8") as f:
        detailed_expansions = json.load(f)
    print(f"Loaded existing detailed expansions: {len(detailed_expansions)}")
except FileNotFoundError:
    detailed_expansions = []
    print("No existing detailed expansions file found")

# If processing new ones, append
if detailed_expansions and len(detailed_expansions) >= 5:  # Assuming Mega data is there
    pass  # Don't process again
else:
    for i, exp in enumerate(expansions[:5]):  # Limit to first 5 for testing
        print(f"Processing {i+1}: {exp['name']}")
        try:
            r = requests.get(exp['url'], headers=headers, timeout=10)
            soup = BeautifulSoup(r.text, 'html.parser')
            
            # Find the first paragraph after h1
            h1 = soup.find('h1')
            data = {'Name of Expansion': exp['name']}
            if h1:
                p = h1.find_next('p')
                if p:
                    text = p.get_text()
                    print("First paragraph:")
                    print(text[:500])
                    
                    # Release date
                    date_match = re.search(r'released.*on ([A-Z][a-z]+ \d+, \d{4})', text, re.IGNORECASE)
                    if date_match:
                        data['Release date'] = date_match.group(1)
                    
                    # No. of cards
                    cards_match = re.search(r'consists of (\d+) cards', text, re.IGNORECASE)
                    if cards_match:
                        data['No. of cards'] = cards_match.group(1)
                    
                    # Type
                    if 'expansion' in text.lower():
                        data['Type of Expansion'] = 'Expansion'
                    elif 'supplemental' in text.lower():
                        data['Type of Expansion'] = 'Supplemental'
                    
                    # Set abb
                    abb_match = re.search(r'\(([A-Z]{2,3})\)', text)
                    if abb_match:
                        data['Set abb.'] = abb_match.group(1)
                    
                    # Set no.
                    no_match = re.search(r'(\d+)(?:st|nd|rd|th)? expansion', text, re.IGNORECASE)
                    if no_match:
                        data['Set no.'] = no_match.group(1)
                    
                    print("Extracted data:", data)
            
            # Map to desired fields
            detailed = {
                'Set no.': data.get('Set no.', ''),
                'Symbol': '',
                'Logo of Expansion': '',
                'Name of Expansion': data.get('Name of Expansion', exp['name']),
                'Type of Expansion': data.get('Type of Expansion', ''),
                'No. of cards': data.get('No. of cards', ''),
                'Release date': data.get('Release date', ''),
                'Set abb.': data.get('Set abb.', '')
            }
            detailed_expansions.append(detailed)
            
            time.sleep(1)
            
        except Exception as e:
            print(f"  Error: {e}")
            detailed_expansions.append({
                'Name of Expansion': exp['name'],
                'error': str(e)
            })

    # Save detailed data
    with open(detailed_file, "w", encoding="utf-8") as f:
        json.dump(detailed_expansions, f, ensure_ascii=False, indent=2)

    print("Saved detailed expansions to ../data/expansions_en_detailed.json")

# Print in tabular format
print("\nSet no.\tSymbol\tLogo of Expansion\tName of Expansion\tType of Expansion\tNo. of cards\tRelease date\tSet abb.")
for exp in detailed_expansions:
    no_cards = exp['No. of cards'].replace('\n', '\\n') if '\n' in exp['No. of cards'] else exp['No. of cards']
    print(f"{exp['Set no.']}\t{exp['Symbol']}\t{exp['Logo of Expansion']}\t{exp['Name of Expansion']}\t{exp['Type of Expansion']}\t{no_cards}\t{exp['Release date']}\t{exp['Set abb.']}")