#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Qwen-VL Test Without Database
Test with existing data only - no database connection needed
"""

import os
import sys
import json
import time
from pathlib import Path
from datetime import datetime

print("=" * 60)
print("PTCG Qwen-VL Test (No Database Required)")
print("=" * 60)

# Check if test data exists
test_data_path = Path("./datasets/test.jsonl")

if not test_data_path.exists():
    print(f"\nERROR: Test data not found at {test_data_path}")
    print("\nYou need to export data first. Options:")
    print("1. Use existing data from database export")
    print("2. Create sample test data manually")
    print("\nRun this to export data:")
    print("  python export_training_data.py --samples 1800")
    sys.exit(1)

print(f"OK: Test data found at {test_data_path}")

# Count samples by language
languages = {}
with open(test_data_path, 'r', encoding='utf-8') as f:
    for line in f:
        if line.strip():
            try:
                data = json.loads(line)
                lang = data.get("metadata", {}).get("language", "unknown")
                languages[lang] = languages.get(lang, 0) + 1
            except:
                pass

print("\nAvailable samples by language:")
for lang, count in sorted(languages.items()):
    print(f"  {lang}: {count}")

# Check if we have enough Chinese cards
zh_count = languages.get("zh-HK", 0)
if zh_count < 10:
    print(f"\nWARNING: Only {zh_count} Chinese cards available")
    print("Test will use all available Chinese cards")
else:
    print(f"\nOK: {zh_count} Chinese cards available for testing")

print("\n" + "=" * 60)
print("Ready to run benchmark test")
print("=" * 60)
print("\nRun:")
print("  python benchmark_simple.py --model-path ./outputs/final --samples 50")
print("\nOr specify a different language:")
print("  python benchmark_simple.py --language ja-JP --samples 50")
