#!/usr/bin/env python3
"""
Head-to-head benchmark: Fine-tuned model (llama-server/Vulkan) vs Two-stage pipeline.

Runs the fine-tuned PTCG model on the test_sample images and compares against
existing two-stage pipeline results (glm-ocr + qwen3-vl + llava fallback).

Usage:
    python benchmark_vs_pipeline.py
    python benchmark_vs_pipeline.py --image-dir C:/path/to/images
    python benchmark_vs_pipeline.py --pipeline-json benchmarks/two_stage/pipeline_results_20260307_074212.json
    python benchmark_vs_pipeline.py --skip-run  # use cached finetuned results
"""

import argparse
import base64
import glob
import html as html_lib
import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

LLAMA_SERVER_URL   = "http://localhost:8080/v1/chat/completions"
DEFAULT_IMAGE_DIR  = r"C:\AI_Server\Coding\PTCG_2026\data\test_sample"
PIPELINE_JSON_GLOB = "benchmarks/two_stage/pipeline_results_*.json"
OUTPUT_DIR         = Path("benchmarks/vs_pipeline")
TIMEOUT            = 60  # seconds per card

EXTRACT_PROMPT = (
    "Look at this Pokemon card image and extract the printed information. "
    "Return ONLY a JSON object with EXACTLY these fields: "
    "name (string), hp (integer or null), types (array of English type strings), "
    "supertype (POKEMON/TRAINER/ENERGY), subtype (string or null), "
    "rarity (string), "
    "attacks (array of {cost: [], name, damage, effect}), "
    "abilities (array of {name, description}), "
    "retreat_cost (integer), card_number (string). "
    "Do NOT include any database IDs or extra fields. "
    "No markdown, no explanation."
)

_KNOWN_TYPES = {
    "GRASS", "FIRE", "WATER", "LIGHTNING", "PSYCHIC",
    "FIGHTING", "DARKNESS", "METAL", "COLORLESS", "DRAGON", "STELLAR",
}

SUPPORTED_EXT = {".jpg", ".jpeg", ".png", ".webp"}

# ---------------------------------------------------------------------------
# Fine-tuned model (llama-server) helpers
# ---------------------------------------------------------------------------

def encode_image(path: Path) -> tuple[str, str]:
    suffix = path.suffix.lower()
    mime = "image/jpeg" if suffix in {".jpg", ".jpeg"} else f"image/{suffix[1:]}"
    return base64.b64encode(path.read_bytes()).decode(), mime


def fix_pg_array(value):
    """Fix PostgreSQL {GRASS} format emitted as list of chars."""
    if not isinstance(value, list):
        return value
    joined = "".join(str(x) for x in value)
    found = [t for t in _KNOWN_TYPES if t in joined.upper()]
    if found:
        return found
    if all(isinstance(x, str) and len(x) <= 2 for x in value):
        return []
    return value


def fix_truncated_json(text: str) -> str:
    opens = text.count("{") - text.count("}")
    if opens > 0:
        text += "}" * opens
    opens = text.count("[") - text.count("]")
    if opens > 0:
        text += "]" * opens
    return text


def parse_response(text: str, filename: str) -> dict:
    # Strip markdown fences
    text = re.sub(r"```(?:json)?\s*", "", text).replace("```", "").strip()
    s = text.find("{")
    e = text.rfind("}") + 1
    if s >= 0 and e > s:
        text = text[s:e]
    text = fix_truncated_json(text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {"_parse_error": True, "_raw": text[:300], "name": None, "filename": filename}

    if isinstance(data.get("types"), list):
        data["types"] = fix_pg_array(data["types"])
    if isinstance(data.get("subtype"), list):
        data["subtype"] = fix_pg_array(data["subtype"])
        if isinstance(data["subtype"], list):
            data["subtype"] = data["subtype"][0] if data["subtype"] else None

    data["filename"] = filename
    return data


def extract_card_finetuned(image_path: Path, timeout: int = TIMEOUT) -> tuple[dict, float]:
    """Run fine-tuned model via llama-server. Returns (result, elapsed_sec)."""
    img_b64, mime = encode_image(image_path)
    payload = json.dumps({
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_b64}"}},
            {"type": "text", "text": EXTRACT_PROMPT},
        ]}],
        "max_tokens": 1024,
        "temperature": 0,
    }).encode()

    t0 = time.time()
    try:
        req = urllib.request.Request(
            LLAMA_SERVER_URL, data=payload,
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read())
        raw_text = result["choices"][0]["message"]["content"]
        return parse_response(raw_text, image_path.name), time.time() - t0
    except Exception as ex:
        return {"_error": str(ex), "name": None, "filename": image_path.name}, time.time() - t0


def check_server() -> bool:
    try:
        with urllib.request.urlopen("http://localhost:8080/health", timeout=5) as r:
            return r.status == 200
    except Exception:
        return False

# ---------------------------------------------------------------------------
# Load two-stage pipeline results
# ---------------------------------------------------------------------------

def load_pipeline_results(json_path: str) -> dict:
    """Parse pipeline_results JSON. Returns {image_name -> best extraction dict}."""
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    by_image = {}
    for r in data.get("results", []):
        label = r.get("image", "")
        exts  = r.get("extractions", [])
        ok    = [e for e in exts if e.get("success")]
        total_time = r.get("total_time_sec", 0)

        # For multi-card images, take first successful extraction
        if ok:
            parsed = ok[0].get("parsed", {}) or {}
            by_image[label] = {
                "success":    True,
                "model_used": ok[0].get("model_used", "?"),
                "name":       parsed.get("cardName", ""),
                "hp":         parsed.get("hp", ""),
                "types":      parsed.get("types", []),
                "supertype":  parsed.get("supertype", ""),
                "subtype":    parsed.get("subtype", ""),
                "rarity":     parsed.get("rarity", ""),
                "card_code":  parsed.get("cardCode", ""),
                "language":   parsed.get("language", ""),
                "cards_found": r.get("cards_found", 1),
                "time_sec":   total_time,
                "raw_result": r,
            }
        else:
            by_image[label] = {
                "success": False,
                "cards_found": r.get("cards_found", 0),
                "time_sec": total_time,
                "raw_result": r,
                "name": None,
            }
    return by_image

# ---------------------------------------------------------------------------
# Comparison logic
# ---------------------------------------------------------------------------

COMPARE_FIELDS = ["name", "hp", "types", "supertype", "subtype", "rarity", "card_number"]

def norm(v) -> str:
    if v is None:
        return ""
    if isinstance(v, list):
        # Guard against lists of dicts (e.g. attacks/abilities leaking into types)
        strs = [str(x) for x in v if not isinstance(x, (dict, list))]
        return ",".join(s.upper().strip() for s in sorted(strs))
    return str(v).strip().lower()


def compare_results(ft_result: dict, pl_data: dict) -> dict:
    """Return field-level comparison between fine-tuned and pipeline results."""
    # Map pipeline field names to fine-tuned field names
    pl_mapped = {
        "name":        pl_data.get("name", ""),
        "hp":          str(pl_data.get("hp", "")) if pl_data.get("hp") else "",
        "types":       pl_data.get("types", []),
        "supertype":   pl_data.get("supertype", ""),
        "subtype":     pl_data.get("subtype", ""),
        "rarity":      pl_data.get("rarity", ""),
        "card_number": pl_data.get("card_code", ""),
    }
    ft_mapped = {
        "name":        ft_result.get("name", ""),
        "hp":          str(ft_result.get("hp", "")) if ft_result.get("hp") else "",
        "types":       ft_result.get("types", []),
        "supertype":   ft_result.get("supertype", ""),
        "subtype":     ft_result.get("subtype", ""),
        "rarity":      ft_result.get("rarity", ""),
        "card_number": ft_result.get("card_number", ""),
    }

    agree = {}
    for field in COMPARE_FIELDS:
        ft_v  = norm(ft_mapped.get(field))
        pl_v  = norm(pl_mapped.get(field))
        both_empty = not ft_v and not pl_v
        both_have  = bool(ft_v) and bool(pl_v)
        match      = (ft_v == pl_v) if both_have else None
        agree[field] = {
            "finetuned": ft_mapped.get(field),
            "pipeline":  pl_mapped.get(field),
            "match":     match,
            "both_empty": both_empty,
        }
    return agree

# ---------------------------------------------------------------------------
# Main benchmark runner
# ---------------------------------------------------------------------------

def run_finetuned_benchmark(image_paths: list[Path], cache_path: Path) -> list[dict]:
    """Run fine-tuned model on all images, saving results. Resumes if cache exists."""
    done: dict[str, dict] = {}
    if cache_path.exists():
        try:
            with open(cache_path, encoding="utf-8") as f:
                cached = json.load(f)
            done = {r["filename"]: r for r in cached}
            print(f"  Loaded {len(done)} cached results from {cache_path.name}")
        except Exception:
            pass

    results = []
    total = len(image_paths)
    for i, path in enumerate(image_paths, 1):
        name = path.name
        if name in done:
            results.append(done[name])
            print(f"  [{i:>2}/{total}] {name} — (cached)")
            continue

        result, elapsed = extract_card_finetuned(path)
        result["_elapsed"] = round(elapsed, 2)
        results.append(result)
        card_name = result.get("name") or "?"
        err = " ⚠" if result.get("_parse_error") or result.get("_error") else ""
        print(f"  [{i:>2}/{total}] {name} → {str(card_name)[:24]} ({elapsed:.1f}s){err}")

        # Save after each card
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

    return results


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def score_finetuned(results: list[dict]) -> dict:
    total = len(results)
    ok = [r for r in results if not r.get("_parse_error") and not r.get("_error") and r.get("name")]
    return {
        "total": total,
        "success": len(ok),
        "success_rate": round(len(ok) / total * 100, 1) if total else 0,
        "avg_time": round(sum(r.get("_elapsed", 0) for r in results) / total, 2) if total else 0,
    }


def score_pipeline(pipeline_by_image: dict, image_names: list[str]) -> dict:
    relevant = [pipeline_by_image[n] for n in image_names if n in pipeline_by_image]
    total = len(relevant)
    ok = [r for r in relevant if r.get("success")]
    avg_t = sum(r.get("time_sec", 0) for r in relevant) / total if total else 0
    return {
        "total": total,
        "success": len(ok),
        "success_rate": round(len(ok) / total * 100, 1) if total else 0,
        "avg_time": round(avg_t, 2),
    }

# ---------------------------------------------------------------------------
# HTML report
# ---------------------------------------------------------------------------

def _e(v) -> str:
    return html_lib.escape(str(v) if v is not None else "")


def thumb_b64(path: Path, max_px: int = 280) -> str:
    if Image is None:
        return ""
    try:
        img = Image.open(path).convert("RGB")
        img.thumbnail((max_px, max_px))
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return ""


def generate_html_report(
    finetuned_results: list[dict],
    pipeline_by_image: dict,
    ft_score: dict,
    pl_score: dict,
    image_paths: list[Path],
    out_path: Path,
):
    rows_html = []
    name_idx = {p.name: p for p in image_paths}

    ft_by_name = {r.get("filename", ""): r for r in finetuned_results}

    for path in image_paths:
        label = path.name
        ft    = ft_by_name.get(label, {})
        pl    = pipeline_by_image.get(label, {})

        ft_ok = bool(ft.get("name") and not ft.get("_parse_error") and not ft.get("_error"))
        pl_ok = pl.get("success", False)

        thumb = thumb_b64(path)
        thumb_tag = f'<img src="data:image/jpeg;base64,{thumb}" style="max-width:120px;max-height:180px;border-radius:6px">' if thumb else ""

        def badge(ok: bool) -> str:
            return ('<span style="color:#22c55e;font-weight:bold">✓ OK</span>'
                    if ok else '<span style="color:#ef4444;font-weight:bold">✗ FAIL</span>')

        def field_row(label_: str, ft_v, pl_v) -> str:
            fn = norm(ft_v)
            pn = norm(pl_v)
            if not fn and not pn:
                return ""
            color = ""
            if fn and pn:
                color = '#d1fae5' if fn == pn else '#fee2e2'
            bg = f'background:{color};' if color else ''
            return (f'<tr style="{bg}"><td style="color:#64748b;font-size:11px;padding:2px 6px">{_e(label_)}</td>'
                    f'<td style="font-size:12px;padding:2px 6px">{_e(ft_v)}</td>'
                    f'<td style="font-size:12px;padding:2px 6px">{_e(pl_v)}</td></tr>')

        comparison = compare_results(ft, pl) if (ft_ok or pl_ok) else {}

        agree_count = sum(1 for v in comparison.values()
                         if v.get("match") is True)
        disagree_count = sum(1 for v in comparison.values()
                            if v.get("match") is False)

        comp_rows = ""
        if comparison:
            rows_f = []
            for field in COMPARE_FIELDS:
                info = comparison.get(field, {})
                ft_v = info.get("finetuned", "")
                pl_v = info.get("pipeline", "")
                rows_f.append(field_row(field, ft_v, pl_v))
            comp_rows = "\n".join(r for r in rows_f if r)

        ft_time = ft.get("_elapsed", 0)
        pl_time = pl.get("time_sec", 0)

        model_tag = pl.get("model_used", "?")

        rows_html.append(f"""
        <tr>
          <td style="padding:8px;vertical-align:top;text-align:center">{thumb_tag}<br>
            <span style="font-size:10px;color:#64748b">{_e(label)}</span></td>
          <td style="padding:8px;vertical-align:top">
            {badge(ft_ok)}<br>
            <span style="font-size:11px;color:#64748b">{ft_time:.1f}s</span>
          </td>
          <td style="padding:8px;vertical-align:top">
            {badge(pl_ok)}<br>
            <span style="font-size:11px;color:#64748b">{pl_time:.1f}s<br>via {_e(model_tag)}</span>
          </td>
          <td style="padding:8px;vertical-align:top">
            {'<table style="border-collapse:collapse;width:100%"><tr><th style="font-size:11px;text-align:left;padding:2px 6px;color:#1e293b">Field</th><th style="font-size:11px;padding:2px 6px;color:#3b82f6">Fine-tuned</th><th style="font-size:11px;padding:2px 6px;color:#f59e0b">Pipeline</th></tr>' + comp_rows + '</table>' if comp_rows else '<span style="color:#94a3b8;font-size:12px">—</span>'}
            {f'<div style="margin-top:4px;font-size:11px;color:#64748b">✅ {agree_count} agree  ❌ {disagree_count} disagree</div>' if comparison else ""}
          </td>
        </tr>""")

    agree_total = 0
    disagree_total = 0
    for path in image_paths:
        ft = ft_by_name.get(path.name, {})
        pl = pipeline_by_image.get(path.name, {})
        comp = compare_results(ft, pl)
        agree_total    += sum(1 for v in comp.values() if v.get("match") is True)
        disagree_total += sum(1 for v in comp.values() if v.get("match") is False)

    row_html = "\n".join(rows_html)
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>PTCG Benchmark: Fine-tuned vs Two-stage Pipeline</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin:0; background:#f8fafc; color:#0f172a }}
  .header {{ background: linear-gradient(135deg, #1e40af, #7c3aed); color:#fff; padding:24px 32px }}
  .header h1 {{ margin:0 0 4px; font-size:22px }}
  .header p {{ margin:0; opacity:.8; font-size:13px }}
  .scorecard {{ display:flex; gap:16px; padding:20px 32px; flex-wrap:wrap }}
  .card {{ background:#fff; border-radius:12px; padding:20px 28px; box-shadow:0 1px 4px rgba(0,0,0,.08); flex:1; min-width:200px }}
  .card h2 {{ margin:0 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:#64748b }}
  .card .big {{ font-size:36px; font-weight:700 }}
  .card .sub {{ font-size:13px; color:#64748b }}
  .ft {{ border-top:4px solid #3b82f6 }}
  .pl {{ border-top:4px solid #f59e0b }}
  .winner {{ border-top:4px solid #22c55e }}
  table.main {{ width:100%; border-collapse:collapse }}
  table.main th {{ background:#f1f5f9; padding:10px 8px; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:#64748b; text-align:left; border-bottom:2px solid #e2e8f0 }}
  table.main tr:hover {{ background:#f8fafc }}
  table.main td {{ border-bottom:1px solid #f1f5f9 }}
  .section {{ padding:0 32px 32px }}
</style>
</head>
<body>
<div class="header">
  <h1>⚔️ PTCG Benchmark: Fine-tuned Model vs Two-stage Pipeline</h1>
  <p>Generated {ts} — {len(image_paths)} test images from data/test_sample</p>
</div>
<div class="scorecard">
  <div class="card ft">
    <h2>Fine-tuned (Vulkan)</h2>
    <div class="big" style="color:#3b82f6">{ft_score['success_rate']}%</div>
    <div class="sub">{ft_score['success']}/{ft_score['total']} success &nbsp;·&nbsp; {ft_score['avg_time']}s avg</div>
    <div class="sub" style="margin-top:4px;font-size:11px">ptcg-card-reader-Q4_K_M (llama-server)</div>
  </div>
  <div class="card pl">
    <h2>Two-stage Pipeline</h2>
    <div class="big" style="color:#f59e0b">{pl_score['success_rate']}%</div>
    <div class="sub">{pl_score['success']}/{pl_score['total']} success &nbsp;·&nbsp; {pl_score['avg_time']}s avg</div>
    <div class="sub" style="margin-top:4px;font-size:11px">glm-ocr → qwen3-vl → llava:13b</div>
  </div>
  <div class="card winner">
    <h2>Field Agreement</h2>
    <div class="big" style="color:#22c55e">{agree_total}</div>
    <div class="sub">fields agree &nbsp;·&nbsp; {disagree_total} disagree</div>
    <div class="sub" style="margin-top:4px;font-size:11px">name, hp, types, supertype, subtype, rarity, card_number</div>
  </div>
</div>
<div class="section">
<table class="main">
  <thead><tr>
    <th style="width:130px">Image</th>
    <th style="width:90px">Fine-tuned</th>
    <th style="width:100px">Pipeline</th>
    <th>Field Comparison (green=agree, red=disagree)</th>
  </tr></thead>
  <tbody>{row_html}</tbody>
</table>
</div>
</body>
</html>"""

    out_path.write_text(html, encoding="utf-8")
    print(f"\n  HTML report: {out_path}")

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def find_latest_pipeline_json(script_dir: Path) -> str | None:
    pattern = str(script_dir / PIPELINE_JSON_GLOB)
    matches = sorted(glob.glob(pattern))
    return matches[-1] if matches else None


def main():
    parser = argparse.ArgumentParser(description="Benchmark fine-tuned model vs two-stage pipeline")
    parser.add_argument("--image-dir", default=DEFAULT_IMAGE_DIR,
                        help="Directory of test images")
    parser.add_argument("--pipeline-json", default=None,
                        help="Path to pipeline_results_*.json (auto-detected if omitted)")
    parser.add_argument("--skip-run", action="store_true",
                        help="Skip running fine-tuned model; use cached finetuned_results.json only")
    parser.add_argument("--timeout", type=int, default=TIMEOUT,
                        help="Per-card timeout in seconds")
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Find pipeline JSON
    pipeline_json = args.pipeline_json or find_latest_pipeline_json(script_dir)
    if not pipeline_json or not Path(pipeline_json).exists():
        print("ERROR: No pipeline results JSON found. Run pipeline_two_stage.py first.")
        return
    print(f"Pipeline JSON: {pipeline_json}")

    # Get image paths
    image_dir = Path(args.image_dir)
    image_paths = sorted(
        p for p in image_dir.iterdir() if p.suffix.lower() in SUPPORTED_EXT
    )
    if not image_paths:
        print(f"ERROR: No images found in {image_dir}")
        return
    print(f"Test images : {len(image_paths)}")

    # Load pipeline results
    print("\n── Loading two-stage pipeline results ──")
    pipeline_by_image = load_pipeline_results(pipeline_json)
    image_names = [p.name for p in image_paths]
    pl_coverage = sum(1 for n in image_names if n in pipeline_by_image)
    print(f"  Pipeline coverage: {pl_coverage}/{len(image_names)} images")
    pl_score = score_pipeline(pipeline_by_image, image_names)
    print(f"  Pipeline success: {pl_score['success']}/{pl_score['total']} ({pl_score['success_rate']}%)")
    print(f"  Pipeline avg time: {pl_score['avg_time']}s")

    # Run fine-tuned model
    cache_path = OUTPUT_DIR / "finetuned_results.json"
    if not args.skip_run:
        if not check_server():
            print("\nERROR: llama-server not running on port 8080.")
            print("  Start it with: start_server.bat")
            return
        print(f"\n── Running fine-tuned model (llama-server port 8080) ──")
        finetuned_results = run_finetuned_benchmark(image_paths, cache_path)
    else:
        if not cache_path.exists():
            print(f"ERROR: No cached results at {cache_path}. Run without --skip-run first.")
            return
        with open(cache_path, encoding="utf-8") as f:
            finetuned_results = json.load(f)
        print(f"Loaded {len(finetuned_results)} cached fine-tuned results")

    ft_score = score_finetuned(finetuned_results)

    # Print summary
    print("\n" + "=" * 60)
    print("  BENCHMARK COMPARISON")
    print("=" * 60)
    print(f"  {'Metric':<25} {'Fine-tuned':>12}  {'Pipeline':>12}")
    print("  " + "-" * 55)
    print(f"  {'Success rate':<25} {ft_score['success_rate']:>11}%  {pl_score['success_rate']:>11}%")
    print(f"  {'Success / Total':<25} {ft_score['success']:>10}/{ft_score['total']}  {pl_score['success']:>10}/{pl_score['total']}")
    print(f"  {'Avg time/image (s)':<25} {ft_score['avg_time']:>12}  {pl_score['avg_time']:>12}")
    print(f"  {'Speed advantage':<25}", end="")
    if pl_score["avg_time"] and ft_score["avg_time"]:
        ratio = pl_score["avg_time"] / ft_score["avg_time"]
        print(f"  Fine-tuned is {ratio:.1f}x {'faster' if ratio > 1 else 'slower'}")
    else:
        print()
    print("=" * 60)

    # Per-image comparison
    print("\n  Per-image results:")
    print(f"  {'Image':<36} {'FT':>4}  {'PL':>4}  {'FT Name':<22}  PL Name")
    print("  " + "-" * 90)
    ft_by_name = {r.get("filename"): r for r in finetuned_results}
    for path in image_paths:
        n  = path.name
        ft = ft_by_name.get(n, {})
        pl = pipeline_by_image.get(n, {})
        ft_ok = "✓" if (ft.get("name") and not ft.get("_parse_error")) else "✗"
        pl_ok = "✓" if pl.get("success") else "✗"
        ft_name = str(ft.get("name", ""))[:22]
        pl_name = str(pl.get("name", ""))[:22]
        print(f"  {n:<36} {ft_ok:>4}  {pl_ok:>4}  {ft_name:<22}  {pl_name}")

    # Save comparison JSON
    ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    cmp_json_path = OUTPUT_DIR / f"comparison_{ts_str}.json"
    comparison_data = []
    for path in image_paths:
        n  = path.name
        ft = ft_by_name.get(n, {})
        pl = pipeline_by_image.get(n, {})
        comparison_data.append({
            "image": n,
            "finetuned": {
                "success": bool(ft.get("name") and not ft.get("_parse_error")),
                "name": ft.get("name"), "types": ft.get("types"),
                "hp": ft.get("hp"), "rarity": ft.get("rarity"),
                "supertype": ft.get("supertype"), "card_number": ft.get("card_number"),
                "elapsed": ft.get("_elapsed"),
            },
            "pipeline": {
                "success": pl.get("success", False),
                "name": pl.get("name"), "types": pl.get("types"),
                "hp": pl.get("hp"), "rarity": pl.get("rarity"),
                "supertype": pl.get("supertype"), "card_code": pl.get("card_code"),
                "model_used": pl.get("model_used"), "time_sec": pl.get("time_sec"),
            },
            "field_comparison": compare_results(ft, pl),
        })

    summary = {
        "timestamp": datetime.now().isoformat(),
        "pipeline_json": str(pipeline_json),
        "image_dir": str(args.image_dir),
        "finetuned_score": ft_score,
        "pipeline_score": pl_score,
        "per_image": comparison_data,
    }
    with open(cmp_json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"\n  JSON saved: {cmp_json_path}")

    # HTML report
    html_path = OUTPUT_DIR / f"report_{ts_str}.html"
    generate_html_report(
        finetuned_results, pipeline_by_image,
        ft_score, pl_score, image_paths, html_path
    )

    print("\nDone!")


if __name__ == "__main__":
    main()
