#!/usr/bin/env python3
"""
Fix Prisma Client Issue
Run this to regenerate Prisma client
"""

import subprocess
import sys
import os

print("=" * 60)
print("Fixing Prisma Client")
print("=" * 60)

# Change to database package directory
db_dir = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "database")
db_dir = os.path.abspath(db_dir)

print(f"\nWorking directory: {db_dir}")
os.chdir(db_dir)

# Try to generate Prisma client
print("\nRunning: prisma generate")
try:
    # Try with pnpm
    result = subprocess.run(
        ["pnpm", "exec", "prisma", "generate"],
        capture_output=True,
        text=True
    )
    
    if result.returncode == 0:
        print("\n✓ Prisma client generated successfully!")
        print("\nNow you can run:")
        print("  python export_training_data.py --samples 1800")
    else:
        print(f"\n⚠️  Prisma generate failed:")
        print(result.stdout)
        print(result.stderr)
        print("\nManual fix:")
        print(f"  1. cd {db_dir}")
        print("  2. pnpm exec prisma generate")
        
except FileNotFoundError:
    print("\nERROR: pnpm not found")
    print("\nManual fix:")
    print(f"  1. cd {db_dir}")
    print("  2. pnpm install")
    print("  3. pnpm exec prisma generate")

except Exception as e:
    print(f"\nERROR: {e}")
    print("\nTry manually:")
    print(f"  cd {db_dir}")
    print("  pnpm exec prisma generate")

print("\n" + "=" * 60)
