#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Supplement dataset with additional zh-HK cards filtered by regulationMark.

Usage:
    python supplement_zh_hk.py --regulation-marks H I J --max-cards 600
    python supplement_zh_hk.py --regulation-marks H I J --max-cards 600 --output-dir ./datasets

This script:
  1. Reads existing webCardIds from current datasets (to avoid duplicates)
  2. Queries ZH_TW cards with the specified regulationMarks from the DB
  3. Filters to cards that have local images
  4. Formats them for Qwen-VL training
  5. Appends to train.jsonl / validation.jsonl / test.jsonl (80/10/10)
  6. Updates dataset_info.json
"""

import os
import sys
import json
import random
import argparse
import logging
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Reuse helpers from export_training_data in same directory
sys.path.insert(0, str(Path(__file__).parent))
from export_training_data import (
    setup_prisma,
    _rows_to_cards, get_image_path,
    format_card_for_training,
    IMAGE_CONFIG,
)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger(__name__)


# ─── helpers ────────────────────────────────────────────────────────────────

def _query_zh_hk_by_regulation(conn, marks: list[str], limit: int):
    """Query ZH_TW cards filtered by regulationMark IN (marks)."""
    placeholders = ",".join(["%s"] * len(marks))
    sql = f"""
        SELECT
            c.id, c."primaryCardId", c."webCardId", c.language, c."variantType",
            c.name, c.supertype, c.subtypes, c.hp, c.types, c."ruleBox",
            c.abilities, c.attacks, c."flavorText", c.artist, c.rarity,
            c."regulationMark", c."imageUrl", c."imageUrlHiRes", c."createdAt",
            c."evolutionStage", c."regionalExpansionId", c."evolvesFrom", c."evolvesTo",
            re.code AS "expansionCode",
            pc."cardNumber"
        FROM cards c
        LEFT JOIN regional_expansions re ON c."regionalExpansionId" = re.id
        LEFT JOIN primary_cards pc ON c."primaryCardId" = pc.id
        WHERE c.language = 'ZH_TW'
          AND c."regulationMark" IN ({placeholders})
          AND c.name IS NOT NULL AND c.name != ''
        ORDER BY c."regulationMark", c."createdAt" DESC
        LIMIT %s
    """
    with conn.cursor() as cur:
        cur.execute(sql, marks + [limit])
        rows = cur.fetchall()
    return _rows_to_cards(rows)


def load_existing_ids(dataset_dir: Path) -> set:
    """Return set of webCardIds already in train/val/test JSONL files."""
    ids = set()
    for fname in ("train.jsonl", "validation.jsonl", "test.jsonl"):
        p = dataset_dir / fname
        if not p.exists():
            continue
        with open(p, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    wid = obj.get("metadata", {}).get("webCardId")
                    if wid:
                        ids.add(wid)
                except json.JSONDecodeError:
                    pass
    log.info(f"  Existing dataset webCardIds: {len(ids)}")
    return ids


def update_dataset_info(dataset_dir: Path):
    """Recount samples across all JSONL files and rewrite dataset_info.json."""
    counts = {"train": 0, "validation": 0, "test": 0}
    lang_dist = {"zh-HK": {"simple": 0, "medium": 0, "complex": 0},
                 "ja-JP": {"simple": 0, "medium": 0, "complex": 0},
                 "en-US": {"simple": 0, "medium": 0, "complex": 0}}

    for split, fname in [("train", "train.jsonl"), ("validation", "validation.jsonl"),
                         ("test", "test.jsonl")]:
        p = dataset_dir / fname
        if not p.exists():
            continue
        with open(p, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    counts[split] += 1
                    lang = obj.get("metadata", {}).get("language", "")
                    comp = obj.get("metadata", {}).get("complexity", "simple")
                    if lang in lang_dist and comp in lang_dist[lang]:
                        lang_dist[lang][comp] += 1
                except json.JSONDecodeError:
                    pass

    total = counts["train"] + counts["validation"] + counts["test"]
    info_path = dataset_dir / "dataset_info.json"
    existing = {}
    if info_path.exists():
        with open(info_path, encoding="utf-8") as f:
            existing = json.load(f)

    existing.update({
        "total_samples": total,
        "train_samples": counts["train"],
        "val_samples": counts["validation"],
        "test_samples": counts["test"],
        "language_distribution": lang_dist,
        "updated_at": datetime.now().isoformat(),
    })
    with open(info_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)
    log.info(f"  Updated dataset_info.json — total: {total} "
             f"(train {counts['train']}, val {counts['validation']}, test {counts['test']})")


# ─── main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Append zh-HK cards by regulationMark to existing dataset"
    )
    parser.add_argument(
        "--regulation-marks", nargs="+", default=["H", "I", "J"],
        help="List of regulationMark values to include (default: H I J)"
    )
    parser.add_argument(
        "--max-cards", type=int, default=600,
        help="Max new cards to add (default: 600)"
    )
    parser.add_argument(
        "--output-dir", default="./datasets",
        help="Dataset directory (default: ./datasets)"
    )
    parser.add_argument(
        "--data-dir", default="../../data",
        help="Root data directory containing images (default: ../../data)"
    )
    parser.add_argument(
        "--preprocess-images", action="store_true",
        help="Resize images to 512px before appending"
    )
    parser.add_argument(
        "--split", nargs=3, type=float, default=[0.8, 0.1, 0.1],
        metavar=("TRAIN", "VAL", "TEST"),
        help="Train/val/test split ratios for NEW cards (default: 0.8 0.1 0.1)"
    )
    args = parser.parse_args()

    dataset_dir = Path(args.output_dir)
    data_dir = Path(args.data_dir)
    preprocessed_dir = dataset_dir / "preprocessed_images" if args.preprocess_images else None
    if preprocessed_dir:
        preprocessed_dir.mkdir(parents=True, exist_ok=True)

    marks = [m.upper() for m in args.regulation_marks]
    log.info("=" * 60)
    log.info(f"Supplement zh-HK cards: regulationMark IN {marks}")
    log.info(f"Max new cards : {args.max_cards}")
    log.info(f"Dataset dir   : {dataset_dir}")
    log.info("=" * 60)

    # 1. Connect to DB
    conn = setup_prisma()

    # 2. Load existing webCardIds (dedup)
    existing_ids = load_existing_ids(dataset_dir)

    # 3. Query targeted cards
    log.info(f"\nQuerying ZH_TW cards with regulationMark IN {marks}...")
    raw_cards = _query_zh_hk_by_regulation(conn, marks, limit=args.max_cards * 3)
    log.info(f"  Found {len(raw_cards)} raw cards from DB")

    # 4. Filter: not already in dataset + has image
    new_cards = []
    skipped_dup = 0
    skipped_no_image = 0
    mark_counts = {m: 0 for m in marks}

    for card in raw_cards:
        if card.webCardId in existing_ids:
            skipped_dup += 1
            continue
        img_path, found = get_image_path(card, data_dir) if data_dir.exists() else ("", False)
        has_image = found or card.imageUrl or card.imageUrlHiRes
        if not has_image:
            skipped_no_image += 1
            continue
        new_cards.append(card)
        m = card.regulationMark or "?"
        if m in mark_counts:
            mark_counts[m] += 1

    log.info(f"  After dedup/image filter: {len(new_cards)} usable cards")
    log.info(f"  Skipped duplicates    : {skipped_dup}")
    log.info(f"  Skipped (no image)    : {skipped_no_image}")
    log.info(f"  By regulationMark     : {mark_counts}")

    # Cap and shuffle
    if len(new_cards) > args.max_cards:
        random.shuffle(new_cards)
        new_cards = new_cards[:args.max_cards]
        log.info(f"  Capped to {args.max_cards} cards")
    else:
        random.shuffle(new_cards)

    conn.close()

    if not new_cards:
        log.warning("No new cards to add. Exiting.")
        return

    # 5. Format cards → training samples
    log.info(f"\nFormatting {len(new_cards)} cards for training...")
    train_ratio, val_ratio, test_ratio = args.split
    train_samples, val_samples, test_samples = [], [], []
    failed = 0

    for i, card in enumerate(new_cards):
        img_path, _ = get_image_path(card, data_dir) if data_dir.exists() else ("", False)
        if not img_path and card.imageUrlHiRes:
            img_path = card.imageUrlHiRes
        elif not img_path and card.imageUrl:
            img_path = card.imageUrl

        sample = format_card_for_training(
            card, img_path,
            preprocess_images=args.preprocess_images,
            output_dir=preprocessed_dir,
        )
        if sample is None:
            failed += 1
            continue

        # Assign to split
        r = random.random()
        if r < train_ratio:
            train_samples.append(sample)
        elif r < train_ratio + val_ratio:
            val_samples.append(sample)
        else:
            test_samples.append(sample)

        if (i + 1) % 100 == 0:
            log.info(f"  Processed {i + 1}/{len(new_cards)}")

    log.info(f"  Formatted OK : train {len(train_samples)}, "
             f"val {len(val_samples)}, test {len(test_samples)}")
    log.info(f"  Failed       : {failed}")

    # 6. Append to JSONL files
    def append_jsonl(path: Path, samples: list):
        with open(path, "a", encoding="utf-8") as f:
            for s in samples:
                f.write(json.dumps(s, ensure_ascii=False) + "\n")
        log.info(f"  Appended {len(samples)} → {path.name}")

    dataset_dir.mkdir(parents=True, exist_ok=True)
    append_jsonl(dataset_dir / "train.jsonl", train_samples)
    append_jsonl(dataset_dir / "validation.jsonl", val_samples)
    append_jsonl(dataset_dir / "test.jsonl", test_samples)

    # 7. Update dataset_info.json
    update_dataset_info(dataset_dir)

    total_added = len(train_samples) + len(val_samples) + len(test_samples)
    log.info("\n" + "=" * 60)
    log.info(f"Done! Added {total_added} new zh-HK samples (marks: {marks})")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
