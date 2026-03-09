#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Random-50 Benchmark
Group A (in_sample):     all test_sample photos (our curated benchmark set)
Group B (not_in_sample): 50 random images from data/images/cards DB (SV-era official art)
                         + 50 random images from image_cache (training download set)
Uses /api/generate (confirmed working endpoint for this model).
"""

import os
import json
import time
import base64
import random
import requests
from pathlib import Path
from datetime import datetime
from io import BytesIO

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow not installed.")
    raise

OLLAMA_BASE_URL = "http://192.168.50.56:11434"
DEFAULT_MODEL = "ptcg-card-reader-v4:latest"
MAX_SIZE = 448  # training resolution

PROMPT = (
    "Extract all card information as JSON with fields: "
    "name, hp, types, subtypes, supertype, abilities (array with name/effect), "
    "attacks (array with name/cost/damage/effect), setCode, cardNumber, rarity, regulationMark"
)

# Paths
BASE_DIR = Path(__file__).parent
IMAGE_CACHE = BASE_DIR / "image_cache"
TEST_SAMPLE = BASE_DIR.parent.parent / "data" / "test_sample"
DB_IMAGES   = BASE_DIR.parent.parent / "data" / "images" / "cards"


def load_image_b64(img_path: Path) -> str | None:
    """Load a local image file, handle RGBA→white-bg, resize to MAX_SIZE."""
    try:
        img = Image.open(img_path)
        if img.mode in ("RGBA", "P", "LA"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            if img.mode in ("RGBA", "LA"):
                bg.paste(img, mask=img.split()[-1])
            else:
                bg.paste(img)
            img = bg
        else:
            img = img.convert("RGB")
        # Resize: maintain aspect, target MAX_SIZE on the long side
        scale = MAX_SIZE / max(img.size)
        if scale != 1.0:
            new_size = (max(1, int(img.width * scale)), max(1, int(img.height * scale)))
            img = img.resize(new_size, Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        return None


def ollama_infer(model: str, image_b64: str | None, timeout: int = 120) -> tuple[str, bool]:
    """Use /api/generate — confirmed working endpoint for ptcg-card-reader-v4."""
    payload = {
        "model": model,
        "prompt": PROMPT,
        "images": [image_b64] if image_b64 else [],
        "stream": False,
        "options": {"temperature": 0, "num_predict": 512},
    }
    try:
        r = requests.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload, timeout=timeout)
        r.raise_for_status()
        text = r.json().get("response", "").strip()
        return text, True
    except Exception as e:
        return f"Error: {e}", False


def parse_json(text: str) -> dict | list | None:
    import re
    if not text or text.startswith("Error:"):
        return None
    for candidate in [text, re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()]:
        try:
            return json.loads(candidate)
        except Exception:
            pass
        m = re.search(r"```json\s*(.*?)\s*```", candidate, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
        # JSON object
        s, e = candidate.find("{"), candidate.rfind("}") + 1
        if s >= 0 and e > s:
            try:
                return json.loads(candidate[s:e])
            except Exception:
                pass
        # JSON array
        s2, e2 = candidate.find("["), candidate.rfind("]") + 1
        if s2 >= 0 and e2 > s2:
            try:
                return json.loads(candidate[s2:e2])
            except Exception:
                pass
    return None


def run_group(images: list[Path], group_label: str, model: str) -> list[dict]:
    results = []
    for i, img_path in enumerate(images):
        img_b64 = load_image_b64(img_path)
        stem = img_path.stem[:25]
        parent = img_path.parent.name

        t0 = time.time()
        text, ok = ollama_infer(model, img_b64)
        elapsed = time.time() - t0

        parsed = parse_json(text)
        success = ok and parsed is not None
        img_ok = img_b64 is not None

        status = "OK  " if success else "FAIL"
        img_tag = "     " if img_ok else "NoImg"
        print(f"  [{i+1:2d}/{len(images)}] {status} {img_tag} {parent:8s}/{stem:25s}  {elapsed:.1f}s")
        if success and parsed:
            name = parsed.get("name", "?") if isinstance(parsed, dict) else "?"
            print(f"           → {str(name)[:60]}")

        results.append({
            "group": group_label,
            "filename": img_path.name,
            "dir": parent,
            "success": success,
            "has_image": img_ok,
            "inference_time": round(elapsed, 3),
            "predicted_text": text[:600] if text else "",
        })
    return results


def main():
    random.seed(int(time.time()))
    out_dir = BASE_DIR / "benchmarks" / "random50"
    out_dir.mkdir(parents=True, exist_ok=True)
    model = DEFAULT_MODEL

    print("=" * 65)
    print(f"PTCG Random-50 Benchmark — {model}")
    print("=" * 65)

    # --- Verify Ollama ---
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        available = [m["name"] for m in r.json().get("models", [])]
        if model in available:
            print(f"OK: '{model}' is available\n")
        else:
            print(f"WARNING: '{model}' not found. Available: {available}")
    except Exception as e:
        print(f"ERROR: Cannot reach Ollama at {OLLAMA_BASE_URL}: {e}")
        return

    # ── Group A: IN-SAMPLE (test_sample directory — our curated photo set) ──
    # These are real-world photos of physical cards (the ones we benchmarked before)
    in_sample_all = sorted(TEST_SAMPLE.glob("*.jpg")) + sorted(TEST_SAMPLE.glob("*.png"))
    random.shuffle(in_sample_all)
    in_sample_imgs = in_sample_all[:50]  # cap at 50 (may be fewer)

    # ── Group B: NOT-IN-SAMPLE = cards from our DB not in test_sample ──
    # Use image_cache (training download set) as a proxy for "DB cards" since
    # data/images/cards contains official card art PNGs that the model can't
    # read well (it was trained on downloaded JPEG images from pokemon websites).
    # Filter out any images whose filename matches a test_sample file.
    test_sample_names = {p.name for p in in_sample_all}
    db_pool = [p for p in IMAGE_CACHE.glob("*.jpg")
               if p.name not in test_sample_names]
    # Prefer SV-era (hk00014xxx or 04xxxx) over legacy XY (03xxxx)
    sv_pool   = [p for p in db_pool if p.name[:2] in ("hk", "04") or p.stem[:2] == "04"]
    other_pool = [p for p in db_pool if p not in sv_pool]
    random.shuffle(sv_pool)
    random.shuffle(other_pool)
    not_in_sample_imgs = (sv_pool + other_pool)[:50]

    print(f"Pool sizes:")
    print(f"  Group A in_sample  (test_sample/):   {len(in_sample_all)} images → using {len(in_sample_imgs)}")
    print(f"  Group B not_in_sample (image_cache): {len(db_pool)} images → using {len(not_in_sample_imgs)}")
    print(f"    (SV-era preferred: {len(sv_pool)} SV-era, {len(other_pool)} other)\n")

    # ── Run Group A ──
    print(f"━━━ Group A: IN-SAMPLE (test_sample photos, n={len(in_sample_imgs)}) ━━━")
    t0_a = time.time()
    results_a = run_group(in_sample_imgs, "in_sample", model)
    time_a = time.time() - t0_a
    ok_a = sum(1 for r in results_a if r["success"])
    print(f"\n>>> Group A: {ok_a}/{len(results_a)} ({ok_a/max(len(results_a),1)*100:.0f}%)  avg {time_a/max(len(results_a),1):.1f}s")

    # ── Run Group B ──
    print(f"\n━━━ Group B: NOT-IN-SAMPLE (image_cache/DB cards, n={len(not_in_sample_imgs)}) ━━━")
    t0_b = time.time()
    results_b = run_group(not_in_sample_imgs, "not_in_sample", model)
    time_b = time.time() - t0_b
    ok_b = sum(1 for r in results_b if r["success"])
    print(f"\n>>> Group B: {ok_b}/{len(results_b)} ({ok_b/max(len(results_b),1)*100:.0f}%)  avg {time_b/max(len(results_b),1):.1f}s")

    # ── Summary ──
    all_results = results_a + results_b
    total_ok = ok_a + ok_b
    total_n  = len(all_results)
    all_times = [r["inference_time"] for r in all_results]

    print("\n" + "=" * 65)
    print("SUMMARY")
    print("=" * 65)
    print(f"  Model:                     {model}")
    print(f"  Group A (in-sample):           {ok_a}/{len(results_a)} ({ok_a/max(len(results_a),1)*100:.0f}%)")
    print(f"  Group B (not-in-sample/cache): {ok_b}/{len(results_b)} ({ok_b/max(len(results_b),1)*100:.0f}%)")
    print(f"  Combined:                      {total_ok}/{total_n} ({total_ok/max(total_n,1)*100:.0f}%)")
    print(f"  Avg inference:                 {sum(all_times)/len(all_times):.2f}s")
    print(f"  Min / Max:                     {min(all_times):.2f}s / {max(all_times):.2f}s")

    report = {
        "timestamp": datetime.now().isoformat(),
        "model": model,
        "notes": (
            "Group A = real card photos from test_sample/ (in-sample). "
            "Group B = image_cache JPEG downloads (training set, not-in-sample). "
            "Model uses /api/generate endpoint at 448px resize."
        ),
        "group_a_in_sample": {
            "n": len(results_a), "ok": ok_a,
            "pct": round(ok_a / max(len(results_a), 1) * 100, 1),
            "avg_time": round(time_a / max(len(results_a), 1), 2),
        },
        "group_b_not_in_sample": {
            "n": len(results_b), "ok": ok_b,
            "pct": round(ok_b / max(len(results_b), 1) * 100, 1),
            "avg_time": round(time_b / max(len(results_b), 1), 2),
        },
        "combined": {
            "n": total_n, "ok": total_ok,
            "pct": round(total_ok / max(total_n, 1) * 100, 1),
            "avg_time": round(sum(all_times) / len(all_times), 2),
        },
        "detailed_results": all_results,
    }

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = out_dir / f"random50_{ts}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\nResults saved: {out_file}")
    print("=" * 65)


if __name__ == "__main__":
    main()
