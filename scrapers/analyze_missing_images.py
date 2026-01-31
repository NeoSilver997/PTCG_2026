"""
Analyze which images are truly missing after checking legacy folder
"""

import json
from pathlib import Path
from collections import defaultdict

def analyze_missing_images():
    """Scan all JSON files and identify missing images"""
    
    data_root = Path(__file__).parent.parent / 'data'
    cards_dir = data_root / 'cards' / 'japan'
    legacy_dir = data_root / 'images' / 'cards' / 'japan_legacy' / 'japan'
    new_dir = data_root / 'images' / 'cards' / 'japan'
    
    stats = {
        'total_cards': 0,
        'have_legacy': 0,
        'have_new': 0,
        'truly_missing': 0,
        'missing_by_expansion': defaultdict(list)
    }
    
    # Get all JSON files
    json_files = sorted(cards_dir.glob('japanese_cards_40k_*.json'))
    
    print(f"\n🔍 Analyzing {len(json_files)} expansion files...")
    print(f"Legacy folder: {legacy_dir}")
    print(f"New folder: {new_dir}\n")
    
    for json_file in json_files:
        with open(json_file, 'r', encoding='utf-8') as f:
            cards = json.load(f)
        
        expansion = json_file.stem.replace('japanese_cards_40k_', '')
        missing_in_expansion = []
        
        for card in cards:
            stats['total_cards'] += 1
            web_card_id = card.get('webCardId')
            
            if not web_card_id:
                continue
            
            # Check new folder
            expansion_code = card.get('expansionCode', 'unknown')
            new_path = new_dir / expansion_code / f"{web_card_id}.png"
            
            # Check legacy folder (jpn##### format)
            legacy_id = web_card_id.replace('jp', 'jpn', 1)
            legacy_path = legacy_dir / f"{legacy_id}.png"
            
            if new_path.exists():
                stats['have_new'] += 1
            elif legacy_path.exists():
                stats['have_legacy'] += 1
            else:
                stats['truly_missing'] += 1
                missing_in_expansion.append({
                    'webCardId': web_card_id,
                    'name': card.get('name'),
                    'imageUrl': card.get('imageUrl')
                })
        
        if missing_in_expansion:
            stats['missing_by_expansion'][expansion] = missing_in_expansion
            print(f"❌ {expansion:15s} - {len(missing_in_expansion):3d} missing")
        else:
            print(f"✓  {expansion:15s} - Complete!")
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"📊 SUMMARY")
    print(f"{'='*60}")
    print(f"Total cards:        {stats['total_cards']:,}")
    print(f"Have legacy:        {stats['have_legacy']:,}")
    print(f"Have new:           {stats['have_new']:,}")
    print(f"Truly missing:      {stats['truly_missing']:,}")
    print(f"Coverage:           {((stats['have_legacy'] + stats['have_new']) / stats['total_cards'] * 100):.2f}%")
    
    # Save missing list
    if stats['truly_missing'] > 0:
        output_file = data_root / 'missing_images.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(stats['missing_by_expansion'], f, ensure_ascii=False, indent=2)
        print(f"\n💾 Missing images list saved to: {output_file}")
    
    return stats

if __name__ == '__main__':
    analyze_missing_images()
