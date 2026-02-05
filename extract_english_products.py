import json

# Read existing products
with open('c:/AI_Server/Coding/PTCG_CardDB/ptcg_products.json', 'r', encoding='utf-8') as f:
    all_products = json.load(f)

# Filter only Hong Kong (EN) products
english_products = [p for p in all_products if p.get('country') == 'Hong Kong (EN)']

# Save to new file
with open('c:/AI_Server/Coding/PTCG_2026/english_products.json', 'w', encoding='utf-8') as f:
    json.dump(english_products, f, ensure_ascii=False, indent=2)

print(f"Extracted {len(english_products)} English products from {len(all_products)} total products")
print(f"Saved to english_products.json")
