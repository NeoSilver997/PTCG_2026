#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Three-model PTCG card extraction pipeline:

  Stage 1 (glm-ocr, 5s timeout):
    - Detect card count + bounding boxes
    - Grab quick name/code hints to pass downstream

  Stage 2 (qwen3-vl, 10s timeout):
    - Crop each card region
    - Use glm-ocr hints in prompt for better accuracy

  Stage 3 fallback (llava:13b, 15s) — only if qwen3-vl returns no JSON

HTML report with embedded card images saved alongside JSON results.

Usage:
  python pipeline_two_stage.py
  python pipeline_two_stage.py --image-dir "C:/path/to/images"
  python pipeline_two_stage.py --image "path/to/card.jpg"

Output:
  benchmarks/two_stage/pipeline_results.json
  benchmarks/two_stage/report.html
"""

import os
import sys
import json
import time
import base64
import re
import argparse
import html as html_lib
from pathlib import Path
from datetime import datetime
from io import BytesIO

try:
    import requests
except ImportError:
    print("ERROR: pip install requests"); sys.exit(1)

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("ERROR: pip install Pillow"); sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

OLLAMA_BASE_URL   = "http://127.0.0.1:11434"
DETECT_MODEL      = "glm-ocr:latest"
EXTRACT_MODEL     = "qwen3-vl:latest"
FALLBACK_MODEL    = "llava:13b"
DEFAULT_IMAGE_DIR = r"C:\AI_Server\Coding\PTCG_2026\data\test_sample"

MAX_PX_DETECT  = 1024
MAX_PX_EXTRACT = 1024
MAX_PX_THUMB   = 320

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

DETECT_PROMPT = (
    "Look at this image. Count how many Pokemon TCG cards are visible.\n"
    "For each card, estimate its bounding box as percentages of image dimensions,\n"
    "and read the card name and card number printed on it.\n\n"
    "Return ONLY this JSON (no other text):\n"
    '{"count":<n>,"cards":[{"id":1,"bbox_pct":[left%,top%,right%,bottom%],'
    '"hint_name":"card name or empty","hint_code":"card number or empty"}]}\n\n'
    "Rules:\n"
    "- bbox_pct integers 0-100\n"
    "- Single card filling image: bbox_pct=[0,0,100,100]\n"
    "- No Pokemon cards: {\"count\":0,\"cards\":[]}\n"
    "Output ONLY the JSON."
)

EXTRACT_PROMPT_TEMPLATE = (
    "请分析图片中的Pokemon/宝可梦TCG卡牌。{hint_context}"
    "请仔细阅读卡面文字，以JSON格式返回：\n"
    '{{"isCard":true,"cardName":"名称","cardCode":"编号（如001/100）",'
    '"set":"系列代码","rarity":"稀有度符号","language":"ja-JP或zh-HK或en-US"}}\n'
    "如果图片不是宝可梦卡，返回：{{\"isCard\":false}}\n"
    "只输出JSON，不要任何其他文字。"
)


def build_extract_prompt(hint_name: str = "", hint_code: str = "") -> str:
    hints = []
    skip = {"", "empty", "card name or empty", "card number or empty"}
    if hint_name and hint_name not in skip:
        hints.append(f"卡牌名称可能是「{hint_name}」")
    if hint_code and hint_code not in skip:
        hints.append(f"卡牌编号可能是「{hint_code}」")
    hint_ctx = ("（提示：" + "，".join(hints) + "，请核实并精确提取。）\n") if hints else ""
    return EXTRACT_PROMPT_TEMPLATE.format(hint_context=hint_ctx)

# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def get_image_paths(image_dir: str) -> list[tuple[str, str]]:
    exts = {".png", ".jpg", ".jpeg", ".webp"}
    return [
        (p.name, str(p))
        for p in sorted(Path(image_dir).iterdir())
        if p.suffix.lower() in exts
    ]


def load_image(path: str) -> "Image.Image | None":
    try:
        img = Image.open(path)
        if img.mode in ("RGBA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            src = img.convert("RGBA")
            bg.paste(src, mask=src.split()[3])
            return bg
        return img.convert("RGB")
    except Exception as e:
        print(f"  WARNING: Cannot load {path}: {e}")
        return None


def to_b64(img: "Image.Image", max_px: int) -> str:
    out = img.copy()
    if max(out.size) > max_px:
        out.thumbnail((max_px, max_px), Image.LANCZOS)
    buf = BytesIO()
    out.save(buf, format="JPEG", quality=88)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def crop_card(img: "Image.Image", bbox_pct: list, padding: float = 1.0) -> "Image.Image":
    w, h = img.size
    l = max(0, int((bbox_pct[0] - padding) / 100 * w))
    t = max(0, int((bbox_pct[1] - padding) / 100 * h))
    r = min(w, int((bbox_pct[2] + padding) / 100 * w))
    b = min(h, int((bbox_pct[3] + padding) / 100 * h))
    return img.crop((l, t, r, b))


def draw_boxes(img: "Image.Image", cards: list) -> "Image.Image":
    out  = img.copy()
    draw = ImageDraw.Draw(out)
    w, h = img.size
    colors = ["#FF3333", "#33BB33", "#3388FF", "#FF8800", "#CC00CC"]
    for i, card in enumerate(cards):
        bp = card.get("bbox_pct", [0, 0, 100, 100])
        l, t = int(bp[0]/100*w), int(bp[1]/100*h)
        r, b = int(bp[2]/100*w), int(bp[3]/100*h)
        col  = colors[i % len(colors)]
        lw   = max(3, w // 150)
        draw.rectangle([l, t, r, b], outline=col, width=lw)
        label = f"Card {card.get('id', i+1)}"
        draw.rectangle([l, t, l + len(label)*8 + 8, t + 20], fill=col)
        draw.text((l + 4, t + 2), label, fill="white")
    return out

# ---------------------------------------------------------------------------
# JSON & inference helpers
# ---------------------------------------------------------------------------

def strip_thinking(text: str) -> str:
    return re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()


def parse_json(text: str) -> "dict | None":
    for cand in [strip_thinking(text), text]:
        try:
            return json.loads(cand)
        except Exception:
            pass
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cand)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
        s = cand.find("{");  e = cand.rfind("}") + 1
        if s >= 0 and e > s:
            try:
                return json.loads(cand[s:e])
            except Exception:
                pass
    return None


def ollama_infer(model: str, prompt: str, b64: str,
                 timeout: int, base_url: str) -> tuple[str, float]:
    payload = {
        "model": model, "prompt": prompt, "images": [b64],
        "stream": False, "think": False,
        "options": {"temperature": 0.1, "num_predict": 4096},
    }
    t0 = time.time()
    try:
        r = requests.post(f"{base_url}/api/generate", json=payload, timeout=timeout)
        r.raise_for_status()
        d = r.json()
        text = d.get("response", "").strip() or d.get("thinking", "").strip()
        return text, time.time() - t0
    except requests.exceptions.Timeout:
        return "Error: timeout", time.time() - t0
    except Exception as ex:
        return f"Error: {ex}", time.time() - t0

# ---------------------------------------------------------------------------
# Stage functions
# ---------------------------------------------------------------------------

def stage1_detect(img: "Image.Image", timeout: int,
                  base_url: str, model: str) -> tuple[dict, float, str]:
    raw, elapsed = ollama_infer(model, DETECT_PROMPT, to_b64(img, MAX_PX_DETECT), timeout, base_url)

    if raw.startswith("Error:"):
        return _fallback_detection(), elapsed, raw

    parsed = parse_json(raw)
    if parsed and "count" in parsed and "cards" in parsed:
        for c in parsed["cards"]:
            bp = c.get("bbox_pct", [0, 0, 100, 100])
            c["bbox_pct"]   = [max(0, min(100, int(v))) for v in bp]
            c.setdefault("hint_name", "")
            c.setdefault("hint_code", "")
        return parsed, elapsed, raw

    return _fallback_detection(), elapsed, raw


def _fallback_detection() -> dict:
    return {"count": 1, "cards": [{"id": 1, "bbox_pct": [0,0,100,100],
                                    "hint_name": "", "hint_code": ""}]}


def stage2_extract(card_img: "Image.Image", hint_name: str, hint_code: str,
                   timeout: int, base_url: str, model: str) -> tuple["dict | None", float, str]:
    prompt       = build_extract_prompt(hint_name, hint_code)
    raw, elapsed = ollama_infer(model, prompt, to_b64(card_img, MAX_PX_EXTRACT), timeout, base_url)
    if raw.startswith("Error:"):
        return None, elapsed, raw
    return parse_json(raw), elapsed, raw

# ---------------------------------------------------------------------------
# Per-image processing
# ---------------------------------------------------------------------------

def process_image(label: str, path: str, args) -> dict:
    print(f"\n  ┌─ {label}")

    img = load_image(path)
    if img is None:
        print(f"  └─ ERROR: cannot load")
        return {"image": label, "path": path, "error": "load failed",
                "cards_found": 0, "extractions": []}

    # ── Stage 1 ────────────────────────────────────────────────────────────
    detection, s1_time, s1_raw = stage1_detect(
        img, args.timeout_detect, args.ollama_url, args.detect_model)
    card_count = detection.get("count", 0)
    cards_info = detection.get("cards", [])

    hints_str = ", ".join(
        f"{c.get('hint_name','')} {c.get('hint_code','')}".strip()
        for c in cards_info if c.get("hint_name") or c.get("hint_code")
    )
    print(f"  │  Stage 1 [{args.detect_model}] {s1_time:.1f}s → {card_count} card(s)"
          + (f"  hints: {hints_str}" if hints_str else ""))

    if card_count == 0:
        print(f"  └─ No cards detected.")
        return {"image": label, "path": path,
                "stage1_time_sec": round(s1_time, 2), "stage1_raw": s1_raw,
                "cards_found": 0, "extractions": [],
                "overview_b64": to_b64(img, MAX_PX_THUMB)}

    # ── Stage 2 + fallback per card ────────────────────────────────────────
    extractions = []
    for card in cards_info:
        card_id   = card.get("id", 1)
        bbox      = card.get("bbox_pct", [0, 0, 100, 100])
        hint_name = card.get("hint_name", "")
        hint_code = card.get("hint_code", "")
        is_full   = (bbox == [0, 0, 100, 100])
        card_img  = img if is_full else crop_card(img, bbox)

        # Stage 2: qwen3-vl (hints injected)
        parsed, s2_time, s2_raw = stage2_extract(
            card_img, hint_name, hint_code,
            args.timeout_extract, args.ollama_url, args.extract_model)

        success      = parsed is not None and parsed.get("isCard") is not False
        model_used   = args.extract_model
        fallback_raw = None
        fb_time      = 0.0

        # Stage 3: llava fallback
        if not success:
            fb_label = f"  │  Stage 2 [{args.extract_model}] {s2_time:.1f}s ✗ → [{args.fallback_model}]"
            print(fb_label)
            parsed_fb, fb_time, fallback_raw = stage2_extract(
                card_img, hint_name, hint_code,
                args.timeout_fallback, args.ollama_url, args.fallback_model)
            if parsed_fb is not None and parsed_fb.get("isCard") is not False:
                parsed     = parsed_fb
                success    = True
                model_used = args.fallback_model

        # Console log
        t_used = fb_time if model_used == args.fallback_model else s2_time
        if success and parsed:
            name   = str(parsed.get("cardName", "?"))[:24]
            code   = str(parsed.get("cardCode", "?"))[:14]
            rarity = str(parsed.get("rarity",   "?"))[:10]
            lang   = str(parsed.get("language", "?"))[:8]
            tag    = "fb" if model_used == args.fallback_model else "  "
            print(f"  │  Card {card_id} [{model_used}] {t_used:.1f}s ✓{tag} → {name} | {code} | {rarity} | {lang}")
        else:
            print(f"  │  Card {card_id} ✗ no JSON (both models failed)")

        extractions.append({
            "card_id":      card_id,
            "bbox_pct":     bbox,
            "hint_name":    hint_name,
            "hint_code":    hint_code,
            "success":      success,
            "model_used":   model_used,
            "stage2_time":  round(s2_time, 2),
            "stage2_raw":   s2_raw,
            "fallback_time": round(fb_time, 2),
            "fallback_raw": fallback_raw,
            "parsed":       parsed,
            "thumb_b64":    to_b64(card_img, MAX_PX_THUMB),
        })

    annotated    = draw_boxes(img, cards_info) if len(cards_info) > 1 else img
    overview_b64 = to_b64(annotated, MAX_PX_THUMB)
    total_t      = round(s1_time + sum(
        e["stage2_time"] + e["fallback_time"] for e in extractions), 2)
    ok_n = sum(1 for e in extractions if e["success"])
    print(f"  └─ {total_t}s total  ({ok_n}/{len(extractions)} ok)")

    return {
        "image":           label,
        "path":            path,
        "total_time_sec":  total_t,
        "stage1_time_sec": round(s1_time, 2),
        "stage1_raw":      s1_raw,
        "cards_found":     card_count,
        "extractions":     extractions,
        "overview_b64":    overview_b64,
    }

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def print_summary(results: list, extract_model: str):
    total_cards = sum(r.get("cards_found", 0) for r in results)
    by_model: dict[str, int] = {}
    ok_n = ext_n = 0
    for r in results:
        for e in r.get("extractions", []):
            ext_n += 1
            if e.get("success"):
                ok_n += 1
                m = e.get("model_used", extract_model)
                by_model[m] = by_model.get(m, 0) + 1

    print("\n" + "=" * 70)
    print("  PIPELINE SUMMARY")
    print("=" * 70)
    print(f"  Images processed : {len(results)}")
    print(f"  Multi-card images: {sum(1 for r in results if r.get('cards_found',0) > 1)}")
    print(f"  Cards found      : {total_cards}")
    pct = round(ok_n/ext_n*100) if ext_n else 0
    print(f"  Extractions ok   : {ok_n}/{ext_n}  ({pct}%)")
    for m, n in sorted(by_model.items()):
        tag = " (primary)" if m == extract_model else " (fallback)"
        print(f"    {m}{tag}: {n}")
    print()
    print(f"  {'Image':<36} {'Cards':>5}  Result  Names")
    print("  " + "-" * 68)
    for r in results:
        exts = r.get("extractions", [])
        ok   = sum(1 for e in exts if e.get("success"))
        names = ", ".join(
            str(e["parsed"].get("cardName", "?"))[:18]
            for e in exts if e.get("success") and e.get("parsed")
        )[:45]
        print(f"  {r['image']:<36} {r.get('cards_found',0):>5}  {ok}/{len(exts)}  {names}")

# ---------------------------------------------------------------------------
# HTML report
# ---------------------------------------------------------------------------

STATUS_COLOR = {
    "ok_primary":  "#22c55e",
    "ok_fallback": "#f59e0b",
    "fail":        "#ef4444",
    "no_card":     "#94a3b8",
}

def _e(s) -> str:
    return html_lib.escape(str(s))


def generate_html(results: list, detect_model: str,
                  extract_model: str, fallback_model: str, out_path: str):

    rows = []
    for r in results:
        exts     = r.get("extractions", [])
        overview = r.get("overview_b64", "")

        card_cells = []
        for e in exts:
            parsed     = e.get("parsed") or {}
            model_used = e.get("model_used", "")
            success    = e.get("success", False)
            is_card    = parsed.get("isCard", True)
            thumb      = e.get("thumb_b64", "")

            if success:
                key = "ok_primary" if model_used == extract_model else "ok_fallback"
                badge_txt = "✓ " + model_used.split(":")[0]
            elif not is_card:
                key = "no_card"; badge_txt = "✗ not a card"
            else:
                key = "fail"; badge_txt = "✗ no JSON"

            color = STATUS_COLOR[key]

            hn, hc = e.get("hint_name", ""), e.get("hint_code", "")
            hint_html = (
                f'<div class="hint">💡 hint: {_e(hn)} {_e(hc)}</div>'
                if (hn or hc) else ""
            )

            fields_html = ""
            if success and parsed:
                rows_f = [
                    ("Name",   parsed.get("cardName",  "")),
                    ("Code",   parsed.get("cardCode",  "")),
                    ("Set",    parsed.get("set",        "")),
                    ("Rarity", parsed.get("rarity",    "")),
                    ("Lang",   parsed.get("language",   "")),
                ]
                fields_html = "<table class='fld'>" + "".join(
                    f"<tr><td class='fk'>{_e(k)}</td><td class='fv'>{_e(v)}</td></tr>"
                    for k, v in rows_f if v
                ) + "</table>"

            t2  = e.get("stage2_time", 0)
            tfb = e.get("fallback_time", 0)
            time_str = f"{t2:.1f}s" + (f" +{tfb:.1f}s fb" if tfb > 0 else "")

            img_tag = (
                f'<img src="data:image/jpeg;base64,{thumb}" class="thumb" alt="card">'
                if thumb else '<div class="no-img">no img</div>'
            )

            card_cells.append(f"""
              <div class="cc" style="border-left:4px solid {color}">
                {img_tag}
                <div class="ci">
                  <span class="badge" style="background:{color}">{_e(badge_txt)}</span>
                  <span class="tm">{_e(time_str)}</span>
                  {hint_html}
                  {fields_html}
                </div>
              </div>""")

        ov_tag = (
            f'<img src="data:image/jpeg;base64,{overview}" class="ov" alt="{_e(r["image"])}">'
            if overview else ""
        )

        total_ok = sum(1 for e in exts if e.get("success"))
        rows.append(f"""
        <tr>
          <td class="nm">{_e(r["image"])}<br>
            <span class="sub">{r.get("cards_found",0)} card · {r.get("total_time_sec",0):.1f}s</span>
          </td>
          <td class="ovc">{ov_tag}</td>
          <td class="cdc">{''.join(card_cells) or '<em style="color:#64748b">no cards</em>'}</td>
        </tr>""")

    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PTCG Pipeline Report — {ts}</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;font-size:13px}}
h1{{padding:20px 24px 6px;font-size:1.35rem;color:#f8fafc}}
.meta{{padding:4px 24px 12px;color:#94a3b8;font-size:12px;line-height:1.9}}
.meta b{{color:#cbd5e1}}
.legend{{display:flex;gap:14px;flex-wrap:wrap;padding:0 24px 14px}}
.leg{{display:flex;align-items:center;gap:6px;font-size:12px}}
.dot{{width:11px;height:11px;border-radius:50%}}
table.main{{width:100%;border-collapse:collapse}}
table.main th{{background:#1e293b;color:#94a3b8;text-align:left;padding:8px 12px;
  font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #334155}}
tr{{border-bottom:1px solid #1e293b}}
tr:hover{{background:#1e293b55}}
td.nm{{padding:12px 10px;vertical-align:top;min-width:170px;max-width:210px;
  font-size:12px;word-break:break-all}}
.sub{{color:#64748b;font-size:11px}}
td.ovc{{padding:8px 4px;vertical-align:top;width:175px;text-align:center}}
img.ov{{max-width:165px;max-height:210px;border-radius:6px;border:1px solid #334155;object-fit:contain}}
td.cdc{{padding:8px;vertical-align:top}}
.cc{{display:inline-flex;gap:8px;background:#1e293b;border-radius:6px;
  padding:8px;margin:4px;vertical-align:top;max-width:295px}}
img.thumb{{width:88px;height:118px;object-fit:cover;border-radius:4px;
  flex-shrink:0;border:1px solid #334155}}
.no-img{{width:88px;height:118px;background:#334155;border-radius:4px;
  display:flex;align-items:center;justify-content:center;color:#64748b;font-size:10px}}
.ci{{flex:1;min-width:0}}
.badge{{display:inline-block;padding:2px 7px;border-radius:10px;
  font-size:11px;font-weight:600;color:#fff;margin-bottom:3px}}
.tm{{display:block;color:#64748b;font-size:11px;margin-bottom:3px}}
.hint{{color:#94a3b8;font-size:10px;font-style:italic;margin-bottom:4px;
  background:#0f172a;padding:2px 5px;border-radius:3px}}
table.fld{{width:100%;border-collapse:collapse}}
table.fld td{{padding:1px 3px;font-size:12px}}
.fk{{color:#64748b;width:44px;white-space:nowrap}}
.fv{{color:#f1f5f9;font-weight:500;word-break:break-word}}
</style>
</head>
<body>
<h1>PTCG Card Extraction — Pipeline Report</h1>
<div class="meta">
  <b>Generated:</b> {ts}<br>
  <b>Stage 1 detect:</b> {_e(detect_model)} (5s) &nbsp;
  <b>Stage 2 extract:</b> {_e(extract_model)} (10s) &nbsp;
  <b>Stage 3 fallback:</b> {_e(fallback_model)} (15s)
</div>
<div class="legend">
  <div class="leg"><div class="dot" style="background:#22c55e"></div>Extracted (primary)</div>
  <div class="leg"><div class="dot" style="background:#f59e0b"></div>Extracted (fallback)</div>
  <div class="leg"><div class="dot" style="background:#ef4444"></div>Failed</div>
  <div class="leg"><div class="dot" style="background:#94a3b8"></div>Not a card</div>
</div>
<table class="main">
<thead><tr>
  <th>Image</th><th>Overview</th><th>Cards</th>
</tr></thead>
<tbody>
{"".join(rows)}
</tbody>
</table>
</body>
</html>
"""
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\n  HTML report  → {out_path}")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Three-model PTCG pipeline: glm-ocr →  qwen3-vl → llava fallback"
    )
    parser.add_argument("--image-dir",        default=DEFAULT_IMAGE_DIR)
    parser.add_argument("--image",            default=None)
    parser.add_argument("--ollama-url",       default=OLLAMA_BASE_URL)
    parser.add_argument("--detect-model",     default=DETECT_MODEL)
    parser.add_argument("--extract-model",    default=EXTRACT_MODEL)
    parser.add_argument("--fallback-model",   default=FALLBACK_MODEL)
    parser.add_argument("--timeout-detect",   type=int, default=5)
    parser.add_argument("--timeout-extract",  type=int, default=10)
    parser.add_argument("--timeout-fallback", type=int, default=15)
    parser.add_argument("--output-dir",       default="./benchmarks/two_stage")
    args = parser.parse_args()

    images = [(Path(args.image).name, args.image)] if args.image else \
             get_image_paths(args.image_dir)
    if not images:
        print(f"ERROR: No images found in {args.image_dir}"); sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)

    print("=" * 70)
    print("  PTCG Pipeline  (detect → extract → fallback)")
    print("=" * 70)
    print(f"  Stage 1 [{args.detect_model}]  timeout={args.timeout_detect}s")
    print(f"  Stage 2 [{args.extract_model}] timeout={args.timeout_extract}s")
    print(f"  Stage 3 [{args.fallback_model}] timeout={args.timeout_fallback}s (fallback only)")
    print(f"  Images  : {len(images)}")
    print(f"  Ollama  : {args.ollama_url}")
    print(f"  Started : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    all_results = []
    for label, path in images:
        all_results.append(process_image(label, path, args))

    print_summary(all_results, args.extract_model)

    # JSON (strip embedded b64 to keep file small)
    json_results = []
    for r in all_results:
        jr = {k: v for k, v in r.items() if k != "overview_b64"}
        jr["extractions"] = [{k: v for k, v in e.items() if k != "thumb_b64"}
                             for e in r.get("extractions", [])]
        json_results.append(jr)

    json_path = Path(args.output_dir) / "pipeline_results.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp":      datetime.now().isoformat(),
            "detect_model":   args.detect_model,
            "extract_model":  args.extract_model,
            "fallback_model": args.fallback_model,
            "image_count":    len(images),
            "results":        json_results,
        }, f, ensure_ascii=False, indent=2)
    print(f"  JSON results → {json_path}")

    html_path = Path(args.output_dir) / "report.html"
    generate_html(all_results, args.detect_model, args.extract_model,
                  args.fallback_model, str(html_path))

    print(f"  Finished : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()
