#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG BitsAndBytes 4-bit Random-50 Benchmark
============================================================
Group A (training data):  50 random samples from datasets/train.jsonl
                          → find image in image_cache → compare vs ground truth JSON
Group B (DB cards):       50 random images from data/images/cards (official art PNG)
                          → check if valid JSON is returned (no ground truth)

Uses qlora_v4/final adapter with BitsAndBytes 4-bit quantization.
Same setup as the original 90.9% benchmark.
============================================================
"""

import os
import sys
import re

# Fix: remove script dir from sys.path to prevent datasets/ shadowing HF package
_script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path = [p for p in sys.path if os.path.normpath(p) not in (os.path.normpath(_script_dir), "")]

import json
import time
import random
import logging
import argparse
from pathlib import Path
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("huggingface_hub").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

import torch
from PIL import Image
from transformers import AutoProcessor, BitsAndBytesConfig

try:
    from transformers import AutoModelForVision2Seq
except ImportError:
    from transformers import AutoModelForImageTextToText as AutoModelForVision2Seq

from peft import PeftConfig, PeftModel

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
IMAGE_CACHE = BASE_DIR / "image_cache"
DB_IMAGES   = BASE_DIR.parent.parent / "data" / "images" / "cards"
DATASETS    = BASE_DIR / "datasets"
ADAPTER     = BASE_DIR / "outputs" / "qlora_v4" / "final"
OUT_DIR     = BASE_DIR / "benchmarks" / "bnb4bit_random"

PROMPT = (
    "Look at this Pokemon Trading Card Game card image carefully.\n"
    "Extract ALL visible information and respond with ONLY a JSON object (no markdown):\n"
    '{"name": "...", "hp": ..., "types": [...], "supertype": "...", "rarity": "...", '
    '"attacks": [...], "abilities": [...], "retreat_cost": ..., "expansion": "...", '
    '"card_number": "..."}'
)


# ── Model loading (4-bit BnB) ─────────────────────────────────────────────────
def load_model(adapter_path: Path, max_pixels_factor: int = 512):
    peft_cfg = PeftConfig.from_pretrained(str(adapter_path))
    base_model_id = peft_cfg.base_model_name_or_path
    logger.info(f"Base model: {base_model_id}")
    logger.info(f"Adapter:    {adapter_path}")

    # Visual token count: Qwen2.5-VL default is 1280×28×28 ≈ 1M pixels.
    # Reducing to 1024 saves <1s (prefill is fast; generation is the bottleneck).
    # Only lower this if you need speed and can tolerate accuracy loss on high-res cards.
    processor = AutoProcessor.from_pretrained(
        base_model_id,
        trust_remote_code=True,
        min_pixels=256 * 28 * 28,             # ≈ 200k pixels minimum
        max_pixels=max_pixels_factor * 28 * 28, # default 1280 = 1M px (original)
    )
    logger.info(f"Processor max_pixels={max_pixels_factor}×28×28 = {max_pixels_factor * 28 * 28:,} px")

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )
    # Use sdpa (scaled dot product attention) — faster than eager, no extra install needed
    attn_impl = "sdpa"
    logger.info(f"Loading base model (4-bit nf4, attn={attn_impl}) ...")
    base_model = AutoModelForVision2Seq.from_pretrained(
        base_model_id,
        quantization_config=bnb_config,
        device_map="auto",
        attn_implementation=attn_impl,
        trust_remote_code=True,
    )
    logger.info("Applying LoRA adapter ...")
    model = PeftModel.from_pretrained(base_model, str(adapter_path))
    model.eval()

    # torch.compile: ~15-20% speedup on repeated calls (first call is slower)
    try:
        model = torch.compile(model, mode="reduce-overhead", fullgraph=False)
        logger.info("torch.compile applied (reduce-overhead mode)")
    except Exception as e:
        logger.warning(f"torch.compile skipped: {e}")

    vram = torch.cuda.memory_allocated() / 1e9
    logger.info(f"Model ready. VRAM: {vram:.2f} GB")
    return model, processor


# ── Image helpers ─────────────────────────────────────────────────────────────
def open_image_rgb(img_path: Path) -> Image.Image:
    """Open any image as RGB; white-background for RGBA/P mode."""
    img = Image.open(img_path)
    if img.mode in ("RGBA", "P", "LA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        if img.mode in ("RGBA", "LA"):
            bg.paste(img, mask=img.split()[-1])
        else:
            bg.paste(img)
        return bg
    return img.convert("RGB")


# ── Inference ─────────────────────────────────────────────────────────────────
def run_inference(model, processor, image: Image.Image) -> str:
    conversation = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text",  "text": PROMPT},
            ],
        }
    ]
    inputs = processor.apply_chat_template(
        conversation,
        tokenize=True,
        add_generation_prompt=True,
        return_dict=True,
        return_tensors="pt",
    )
    inputs = {k: v.to(model.device) if hasattr(v, "to") else v for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=512,   # Complex JP cards with 2 attacks + ability need 300-400 tokens
            do_sample=False,
            pad_token_id=processor.tokenizer.eos_token_id,
        )

    gen_ids = outputs[0][inputs["input_ids"].shape[1]:]
    return processor.decode(gen_ids, skip_special_tokens=True).strip()


# ── JSON parsing ──────────────────────────────────────────────────────────────
def parse_json(text: str):
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except Exception:
            pass
    return None


# ── URL → cache filename ──────────────────────────────────────────────────────
def url_to_cache_path(url: str) -> Path | None:
    """
    Derive image_cache filename from the training-data URL.
    Examples:
      .../large/XYP/032151_P_PIKACHUU.jpg  →  image_cache/032151_P_PIKACHUU.jpg
      .../hk/card-img/hk00012699.png       →  image_cache/hk00012699.jpg
    """
    stem = Path(url.split("?")[0].split("/")[-1]).stem   # strip query + ext
    candidate = IMAGE_CACHE / (stem + ".jpg")
    return candidate if candidate.exists() else None


# ── Group A: training data ────────────────────────────────────────────────────
def load_group_a(n: int, seed: int) -> list[dict]:
    """
    Load n samples from train.jsonl that have a matching cached image.
    Returns list of dicts: {image_path, ground_truth_json, label}
    """
    train_jsonl = DATASETS / "train.jsonl"
    all_lines = [l.strip() for l in train_jsonl.read_text("utf-8").splitlines() if l.strip()]
    rng = random.Random(seed)
    rng.shuffle(all_lines)

    selected = []
    for line in all_lines:
        if len(selected) >= n:
            break
        try:
            obj = json.loads(line)
        except Exception:
            continue

        # Extract image URL
        img_url = None
        gt_text = None
        for msg in obj.get("messages", []):
            if msg["role"] == "user":
                for c in msg["content"]:
                    if c["type"] == "image":
                        img_url = c["image"]
            elif msg["role"] == "assistant":
                for c in msg["content"]:
                    if c["type"] == "text":
                        gt_text = c["text"]

        if not img_url:
            continue

        cache_path = url_to_cache_path(img_url)
        if cache_path is None:
            continue  # image not in cache, skip

        gt_json = parse_json(gt_text) if gt_text else None
        meta = obj.get("metadata", {})
        selected.append({
            "image_path": cache_path,
            "ground_truth": gt_json,
            "label": meta.get("webCardId", cache_path.stem),
            "language": meta.get("language", "?"),
        })

    logger.info(f"Group A: {len(selected)} training samples with cached images found")
    return selected


# ── Group B: DB cards ─────────────────────────────────────────────────────────
def load_group_b(n: int, seed: int) -> list[dict]:
    """
    Load n random PNG files from data/images/cards (official card art).
    Prefer SV-era (hk/sv* or japan/sv*) to keep it relevant.
    """
    all_pngs = list(DB_IMAGES.rglob("*.png"))
    rng = random.Random(seed + 1)
    rng.shuffle(all_pngs)

    # prefer SV-era
    sv_era = [p for p in all_pngs if any(part.lower().startswith("sv") for part in p.parts)]
    other  = [p for p in all_pngs if p not in sv_era]
    ordered = sv_era + other
    selected = ordered[:n]

    logger.info(f"Group B: {len(selected)} DB card images (SV-era preferred)")
    return [{"image_path": p, "ground_truth": None, "label": p.stem, "language": "?"} for p in selected]


# ── Field accuracy (Group A only) ────────────────────────────────────────────
TRACKED_FIELDS = ["name", "hp", "types", "rarity", "expansion", "card_number"]

def field_match(pred: dict, gt: dict, field: str) -> bool:
    if field not in gt or gt[field] is None:
        return True   # can't evaluate, skip
    pv = pred.get(field)
    gv = gt[field]
    if isinstance(gv, str) and isinstance(pv, str):
        return gv.strip().lower() == pv.strip().lower()
    if isinstance(gv, list) and isinstance(pv, list):
        return sorted([str(x).lower() for x in gv]) == sorted([str(x).lower() for x in pv])
    return str(pv).strip().lower() == str(gv).strip().lower()


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter",    type=str, default=str(ADAPTER))
    parser.add_argument("--n-train",    type=int, default=50, help="Group A samples (training data)")
    parser.add_argument("--n-db",       type=int, default=50, help="Group B samples (DB card art)")
    parser.add_argument("--seed",       type=int, default=42)
    parser.add_argument("--output-dir", type=str, default=str(OUT_DIR))
    parser.add_argument("--max-pixels", type=int, default=1280, help="Max pixels factor (N×28×28). 1280=default (accurate). 1024=~20%% fewer tokens (small speed gain). 512=fast but inaccurate.")
    args = parser.parse_args()

    OUT = Path(args.output_dir)
    OUT.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("BitsAndBytes 4-bit Random Benchmark (qlora_v4) [FAST]")
    print(f"  max_pixels={args.max_pixels}x28x28  max_new_tokens=512  attn=sdpa  compile=True")
    print("=" * 60)

    # ── Load model ────────────────────────────────────────────────────────────
    model, processor = load_model(Path(args.adapter), max_pixels_factor=args.max_pixels)

    # ── Load groups ───────────────────────────────────────────────────────────
    group_a = load_group_a(args.n_train, args.seed)
    group_b = load_group_b(args.n_db,   args.seed)

    # ── Run inference ─────────────────────────────────────────────────────────
    def run_group(items: list[dict], group_name: str) -> dict:
        ok = 0
        n  = len(items)
        times = []
        detail = []
        field_hits = {f: 0 for f in TRACKED_FIELDS}
        field_evals = {f: 0 for f in TRACKED_FIELDS}

        for i, item in enumerate(items):
            try:
                image = open_image_rgb(item["image_path"])
            except Exception as e:
                logger.warning(f"  [{group_name}] Cannot open {item['image_path']}: {e}")
                times.append(0)
                detail.append({"label": item["label"], "ok": False, "error": str(e)})
                continue

            t0 = time.time()
            try:
                text = run_inference(model, processor, image)
            except Exception as e:
                text = f"Error: {e}"
            elapsed = time.time() - t0
            times.append(elapsed)

            pred = parse_json(text)
            is_ok = pred is not None

            # Field accuracy (Group A only — where we have ground truth)
            field_result = {}
            if is_ok and item["ground_truth"] and isinstance(item["ground_truth"], dict):
                for f in TRACKED_FIELDS:
                    if f in item["ground_truth"]:
                        match = field_match(pred, item["ground_truth"], f)
                        field_result[f] = match
                        field_hits[f]  += int(match)
                        field_evals[f] += 1

            if is_ok:
                ok += 1

            status = "OK  " if is_ok else "FAIL"
            fa_str = " | ".join(f"{f}:{'Y' if v else 'N'}" for f, v in field_result.items()) if field_result else ""
            print(f"  [{group_name}][{i+1:3d}/{n}] {status}  {item['label']:20s}  {elapsed:.2f}s  {fa_str}")

            detail.append({
                "label":    item["label"],
                "language": item["language"],
                "ok":       is_ok,
                "time":     round(elapsed, 3),
                "text":     text[:300],
                "field_match": field_result,
            })

        pct = ok / n * 100 if n else 0
        avg_t = sum(times) / len(times) if times else 0

        # Field accuracy summary
        field_acc = {}
        for f in TRACKED_FIELDS:
            if field_evals[f]:
                field_acc[f] = round(field_hits[f] / field_evals[f] * 100, 1)

        return {"n": n, "ok": ok, "pct": round(pct, 1), "avg_time": round(avg_t, 2),
                "field_accuracy": field_acc, "detail": detail}

    print(f"\n{'─'*60}")
    print(f"GROUP A — Training Data ({len(group_a)} samples from train.jsonl + image_cache)")
    print(f"{'─'*60}")
    res_a = run_group(group_a, "A-train")

    print(f"\n{'─'*60}")
    print(f"GROUP B — DB Card Art ({len(group_b)} samples from data/images/cards)")
    print(f"{'─'*60}")
    res_b = run_group(group_b, "B-db")

    # ── Summary ───────────────────────────────────────────────────────────────
    total_ok = res_a["ok"] + res_b["ok"]
    total_n  = res_a["n"]  + res_b["n"]
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Group A (training data):  {res_a['ok']}/{res_a['n']}  ({res_a['pct']}%)  avg {res_a['avg_time']}s")
    if res_a["field_accuracy"]:
        print(f"  Field accuracy: " + " | ".join(f"{f}={v}%" for f, v in res_a["field_accuracy"].items()))
    print(f"Group B (DB card art):    {res_b['ok']}/{res_b['n']}  ({res_b['pct']}%)  avg {res_b['avg_time']}s")
    print(f"Combined:                 {total_ok}/{total_n}  ({round(total_ok/total_n*100,1)}%)")
    print("=" * 60)

    # ── Save ──────────────────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = OUT / f"bnb4bit_{ts}.json"
    out_data = {
        "timestamp": ts,
        "adapter": str(args.adapter),
        "model": "qlora_v4 / BitsAndBytes nf4 4-bit",
        "group_a_training_data": {
            "n": res_a["n"], "ok": res_a["ok"], "pct": res_a["pct"],
            "avg_time": res_a["avg_time"], "field_accuracy": res_a["field_accuracy"],
            "source": "datasets/train.jsonl + image_cache",
        },
        "group_b_db_art": {
            "n": res_b["n"], "ok": res_b["ok"], "pct": res_b["pct"],
            "avg_time": res_b["avg_time"],
            "source": "data/images/cards/**/*.png",
        },
        "combined": {
            "n": total_n, "ok": total_ok,
            "pct": round(total_ok / total_n * 100, 1),
        },
        "notes": (
            "Group A uses image_cache JPEGs (official website art, same source as training images). "
            "Group B uses data/images/cards PNGs (official card art, DB images). "
            "Model loaded with BitsAndBytes nf4 4-bit, qlora_v4/final adapter."
        ),
        "detail_a": res_a["detail"],
        "detail_b": res_b["detail"],
    }
    out_path.write_text(json.dumps(out_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved: {out_path}")


if __name__ == "__main__":
    main()
