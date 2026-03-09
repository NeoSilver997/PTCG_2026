#!/usr/bin/env python3
"""Generate an HTML comparison report across all PTCG model benchmark results."""

import json
from pathlib import Path

BASE = Path(__file__).parent / "benchmarks"

# ─────────────────────────────────────────────────────
# 1. Load all benchmark data
# ─────────────────────────────────────────────────────

def load_json(rel):
    p = BASE / rel
    if not p.exists():
        return None
    return json.loads(p.read_text("utf-8"))


hf_data   = load_json("hf_baseline/benchmark_results_20260307_094621.json")
v1_data   = load_json("finetuned_v1/benchmark_results_20260307_160615.json")
vs_data   = load_json("vs_pipeline/comparison_20260307_200314.json")
v3_data   = load_json("qlora_v3/finetuned_results_20260308_171127.json")
v4_data   = load_json("qlora_v4/finetuned_results_20260308_191648.json")

# ─────────────────────────────────────────────────────
# 2. Build summary table rows
# ─────────────────────────────────────────────────────

def pct(v):
    return f"{v:.1f}%" if v is not None else "—"

def sec(v):
    return f"{v:.1f}s" if v is not None else "—"

# Model summary: (label, success_rate, avg_time_sec, n, vram_gb, types_fixed, notes)
models = []

if hf_data:
    models.append({
        "label": "HF Baseline (no finetune)",
        "rate":  hf_data["success_rate"],
        "time":  hf_data["avg_inference_time_sec"],
        "n":     hf_data["total_samples"],
        "vram":  "~14 GB",
        "types_fixed": False,
        "notes": "CPU offload, base Qwen2.5-VL-7B",
        "badge": "baseline",
    })

if v1_data:
    models.append({
        "label": "qlora_v1 (bfloat16 load)",
        "rate":  v1_data["success_rate"],
        "time":  v1_data["avg_inference_time_sec"],
        "n":     v1_data["total_samples"],
        "vram":  "~16 GB",
        "types_fixed": False,
        "notes": "First fine-tune, full precision load, types char-split bug",
        "badge": "v1",
    })

if vs_data:
    fs = vs_data["finetuned_score"]
    ps = vs_data["pipeline_score"]
    models.append({
        "label": "qlora_v1 (4-bit, vs pipeline test)",
        "rate":  fs["success_rate"],
        "time":  fs["avg_time"],
        "n":     fs["total"],
        "vram":  "~6 GB",
        "types_fixed": False,
        "notes": "Same v1 adapter, 4-bit quant via benchmark_finetuned.py",
        "badge": "v1-4bit",
    })
    models.append({
        "label": "Two-stage Pipeline (detect + extract)",
        "rate":  ps["success_rate"],
        "time":  ps["avg_time"],
        "n":     ps["total"],
        "vram":  "Ollama",
        "types_fixed": None,
        "notes": "Stage-1: object detect → Stage-2: Qwen3-VL extract",
        "badge": "pipeline",
    })

if v3_data:
    models.append({
        "label": "qlora_v3 (4-bit, 960 samples)",
        "rate":  v3_data["success_rate"],
        "time":  v3_data["avg_inference_time_sec"],
        "n":     v3_data["total"],
        "vram":  "~6 GB",
        "types_fixed": False,
        "notes": "180 steps, loss=0.394, small benchmark n=5, types char-split (unfixed export)",
        "badge": "v3",
    })

if v4_data:
    models.append({
        "label": "qlora_v4 (4-bit, 3000 samples) ★",
        "rate":  v4_data["success_rate"],
        "time":  v4_data["avg_inference_time_sec"],
        "n":     v4_data["total"],
        "vram":  "~6 GB",
        "types_fixed": True,
        "notes": "450 steps, loss=0.2442, types bug FIXED, full 22-image benchmark",
        "badge": "v4",
    })

# ─────────────────────────────────────────────────────
# 3. Per-image grid (22 shared images)
# ─────────────────────────────────────────────────────

# Build per-image data keyed by filename
img_records = {}  # filename → {hf, v1, vs_ft, vs_pipe, v4}

def img_key(name):
    return Path(name).name

for row in (hf_data or {}).get("detailed_results", []):
    k = img_key(row["name"])
    img_records.setdefault(k, {})["hf"] = {
        "ok": row["success"],
        "time": row["inference_time"],
        "pred": row.get("predicted", {}),
    }

for row in (v1_data or {}).get("detailed_results", []):
    k = img_key(row["name"])
    img_records.setdefault(k, {})["v1"] = {
        "ok": row["success"],
        "time": row["inference_time"],
        "pred": row.get("predicted", {}),
    }

for row in (vs_data or {}).get("per_image", []):
    k = img_key(row["image"])
    ft = row.get("finetuned", {})
    pp = row.get("pipeline", {})
    img_records.setdefault(k, {})["vs_ft"] = {
        "ok": ft.get("success", False),
        "time": ft.get("elapsed"),
        "pred": ft,
    }
    img_records.setdefault(k, {})["vs_pipe"] = {
        "ok": pp.get("success", False),
        "time": pp.get("time_sec"),
        "pred": pp,
    }

for row in (v4_data or {}).get("results", []):
    k = img_key(row["file"])
    img_records.setdefault(k, {})["v4"] = {
        "ok": row["success"],
        "time": row.get("inference_time"),
        "pred": row.get("parsed", {}),
    }

# Ordered by filename
images = sorted(img_records.keys())

# ─────────────────────────────────────────────────────
# 4. Build HTML
# ─────────────────────────────────────────────────────

def badge_color(badge):
    return {
        "baseline": "#6b7280",
        "v1":       "#ef4444",
        "v1-4bit":  "#f97316",
        "pipeline": "#3b82f6",
        "v3":       "#8b5cf6",
        "v4":       "#10b981",
    }.get(badge, "#6b7280")

def tick(ok):
    if ok is True:  return '<span class="ok">✓</span>'
    if ok is False: return '<span class="fail">✗</span>'
    return '<span class="na">—</span>'

def types_badge(fixed):
    if fixed is True:  return '<span class="badge-fixed">types ✓</span>'
    if fixed is False: return '<span class="badge-bug">types ✗ char-split</span>'
    return '<span class="badge-na">N/A</span>'

summary_rows = ""
for m in models:
    color = badge_color(m["badge"])
    rate_val = m["rate"] if m["rate"] is not None else 0
    bar_color = "#10b981" if rate_val >= 95 else "#f59e0b" if rate_val >= 85 else "#ef4444"
    bar_w = int(rate_val)
    summary_rows += f"""
        <tr>
          <td><span class="model-label" style="border-left:4px solid {color};padding-left:8px">{m['label']}</span></td>
          <td>
            <div class="bar-cell">
              <div class="bar" style="width:{bar_w}%;background:{bar_color}"></div>
              <span>{pct(m['rate'])}</span>
            </div>
          </td>
          <td>{sec(m['time'])}</td>
          <td>{m['n']}</td>
          <td>{m['vram']}</td>
          <td>{types_badge(m['types_fixed'])}</td>
          <td class="notes">{m['notes']}</td>
        </tr>"""

# Per-image table header
col_labels = [
    ("HF Base", "#6b7280"),
    ("v1 bf16", "#ef4444"),
    ("v1 4-bit", "#f97316"),
    ("Pipeline", "#3b82f6"),
    ("v4 ★", "#10b981"),
]
col_keys = ["hf", "v1", "vs_ft", "vs_pipe", "v4"]

img_header = "".join(
    f'<th style="color:{c}">{l}</th>' for l, c in col_labels
)

img_rows = ""
for i, img in enumerate(images):
    rec = img_records[img]
    row_class = "even" if i % 2 == 0 else "odd"
    cells = ""
    for key in col_keys:
        entry = rec.get(key)
        if entry is None:
            cells += '<td class="na">—</td>'
        else:
            ok_html = tick(entry["ok"])
            time_str = f"{entry['time']:.1f}s" if entry.get("time") else "?"
            cells += f'<td title="{time_str}">{ok_html}</td>'
    # Get v4 card name for label
    v4_entry = rec.get("v4")
    if v4_entry and v4_entry.get("pred"):
        pred_name = v4_entry["pred"].get("name", img)
    else:
        hf_entry = rec.get("hf")
        if hf_entry and hf_entry.get("pred"):
            pred_name = hf_entry["pred"].get("name", img)
        else:
            pred_name = img
    img_rows += f"""
      <tr class="{row_class}">
        <td class="img-name" title="{img}">{pred_name[:28]}</td>
        {cells}
      </tr>"""

# Training progression data for chart
training_data = json.dumps([
    {"model": "qlora_v1", "samples": 100,  "steps": 50,  "loss": 0.62,  "time_min": 12},
    {"model": "qlora_v3", "samples": 960,  "steps": 180, "loss": 0.394, "time_min": 35},
    {"model": "qlora_v4", "samples": 3000, "steps": 450, "loss": 0.2442,"time_min": 69},
])

# qlora_v4 per-card detail
v4_detail_rows = ""
if v4_data:
    for row in v4_data.get("results", []):
        fname = img_key(row["file"])
        ok = row["success"]
        pred = row.get("parsed", {})
        name  = pred.get("name", "?") if pred else "?"
        types = ", ".join(pred.get("types", [])) if pred else "?"
        hp    = pred.get("hp", "?") if pred else "?"
        rarity= pred.get("rarity", "?") if pred else "?"
        sup   = pred.get("supertype", "?") if pred else "?"
        t_s   = f"{row.get('inference_time', 0):.1f}s"
        icon  = "✓" if ok else "✗"
        row_style = 'style="color:#ef4444"' if not ok else ""
        v4_detail_rows += f"""
          <tr {row_style}>
            <td>{icon}</td>
            <td class="img-name" title="{fname}">{fname[:30]}</td>
            <td>{name}</td>
            <td>{types}</td>
            <td>{hp}</td>
            <td>{sup}</td>
            <td>{rarity}</td>
            <td>{t_s}</td>
          </tr>"""

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>PTCG Model Benchmark Comparison</title>
<style>
  :root {{
    --bg: #0f172a;
    --card: #1e293b;
    --border: #334155;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --ok: #10b981;
    --fail: #ef4444;
    --accent: #6366f1;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; padding: 2rem; }}
  h1 {{ font-size: 1.8rem; margin-bottom: 0.25rem; }}
  .subtitle {{ color: var(--muted); margin-bottom: 2rem; }}
  h2 {{ font-size: 1.2rem; margin: 2rem 0 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.4rem; }}
  .card {{ background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 0.875rem; }}
  th {{ text-align: left; padding: 0.5rem 0.75rem; color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--border); }}
  td {{ padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: middle; }}
  tr:last-child td {{ border-bottom: none; }}
  tr.even {{ background: rgba(255,255,255,0.02); }}
  .ok   {{ color: var(--ok); font-weight: 700; font-size: 1rem; }}
  .fail {{ color: var(--fail); font-weight: 700; font-size: 1rem; }}
  .na   {{ color: var(--muted); }}
  .model-label {{ font-weight: 500; }}
  .notes {{ color: var(--muted); font-size: 0.8rem; max-width: 300px; }}
  .img-name {{ font-family: monospace; font-size: 0.78rem; color: var(--muted); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
  .bar-cell {{ display: flex; align-items: center; gap: 8px; }}
  .bar {{ height: 8px; border-radius: 4px; min-width: 2px; flex-shrink: 0; }}
  .badge-fixed {{ background: #064e3b; color: #6ee7b7; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; }}
  .badge-bug   {{ background: #450a0a; color: #fca5a5; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; }}
  .badge-na    {{ background: #1e293b; color: var(--muted); padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; }}
  .kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }}
  .kpi {{ background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1rem; text-align: center; }}
  .kpi-value {{ font-size: 2rem; font-weight: 700; }}
  .kpi-label {{ font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; }}
  .progress-chart {{ display: flex; flex-direction: column; gap: 0.5rem; }}
  .progress-row {{ display: flex; align-items: center; gap: 1rem; }}
  .progress-model {{ width: 100px; text-align: right; font-size: 0.85rem; color: var(--muted); }}
  .progress-bar-wrap {{ flex: 1; background: var(--border); border-radius: 4px; height: 20px; position: relative; overflow: hidden; }}
  .progress-bar-fill {{ height: 100%; border-radius: 4px; display: flex; align-items: center; padding-left: 8px; font-size: 0.75rem; font-weight: 600; }}
  .finding {{ background: rgba(99,102,241,0.1); border: 1px solid #4338ca; border-radius: 0.5rem; padding: 0.75rem 1rem; margin-bottom: 0.75rem; }}
  .finding strong {{ color: #a5b4fc; }}
  canvas {{ max-width: 100%; }}
</style>
</head>
<body>

<h1>🃏 PTCG Model Benchmark Comparison</h1>
<p class="subtitle">Qwen2.5-VL-7B-Instruct · QLoRA fine-tuning progression · RTX 5070 Ti</p>

<!-- KPI Strip -->
<div class="kpi-grid">
  <div class="kpi">
    <div class="kpi-value" style="color:#10b981">6</div>
    <div class="kpi-label">Model variants benchmarked</div>
  </div>
  <div class="kpi">
    <div class="kpi-value" style="color:#6366f1">22</div>
    <div class="kpi-label">Test images (full benchmark)</div>
  </div>
  <div class="kpi">
    <div class="kpi-value" style="color:#f59e0b">0.2442</div>
    <div class="kpi-label">Best training loss (v4)</div>
  </div>
  <div class="kpi">
    <div class="kpi-value" style="color:#10b981">3 000</div>
    <div class="kpi-label">Training samples (v4)</div>
  </div>
  <div class="kpi">
    <div class="kpi-value" style="color:#10b981">22.6s</div>
    <div class="kpi-label">v4 avg inference (4-bit)</div>
  </div>
  <div class="kpi">
    <div class="kpi-value" style="color:#10b981">✓</div>
    <div class="kpi-label">Types array bug fixed</div>
  </div>
</div>

<!-- Summary Table -->
<div class="card">
  <h2>Model Summary</h2>
  <table>
    <thead>
      <tr>
        <th>Model</th>
        <th>Success Rate</th>
        <th>Avg Time</th>
        <th>N</th>
        <th>VRAM</th>
        <th>Types</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      {summary_rows}
    </tbody>
  </table>
</div>

<!-- Training Progression -->
<div class="card">
  <h2>Training Progression</h2>
  <div class="progress-chart" id="training-chart"></div>
  <canvas id="lossChart" height="80" style="margin-top:1.5rem"></canvas>
  <p style="color:var(--muted);font-size:0.8rem;margin-top:0.5rem">* v1 loss estimated from checkpoint log</p>
</div>

<!-- Key Findings -->
<div class="card">
  <h2>Key Findings</h2>
  <div class="finding">
    <strong>Types char-split bug fixed in v4:</strong> PostgreSQL <code>{{DRAGON}}</code> arrays were being split character-by-character (<code>["{{","D","R","A","G","O","N","}}"]</code>). Fixed via <code>_parse_pg_array()</code> in <code>export_training_data.py</code>. qlora_v4 correctly outputs <code>["DRAGON"]</code>.
  </div>
  <div class="finding">
    <strong>4-bit quantization is 25× faster than bfloat16 load:</strong> v1 bfloat16 = 194.6s avg vs v1 4-bit = 7.8s avg. VRAM down from ~16 GB to ~6 GB.
  </div>
  <div class="finding">
    <strong>More data improves loss but not necessarily accuracy:</strong> v3 (960 samples, 180 steps, loss 0.394) achieved 100% on 5 images. v4 (3000 samples, 450 steps, loss 0.2442) achieves 90.9% on 22 images — a harder, more representative benchmark.
  </div>
  <div class="finding">
    <strong>Known remaining issue:</strong> Trainer cards still output spurious <code>hp</code> values (e.g. hp=760 for 老大の指令). Trainer cards should have <code>hp: null</code>. Need more Trainer-card training examples with explicit null labels.
  </div>
  <div class="finding">
    <strong>1 hard failure (hk00014016.png):</strong> The model returns an empty/unparseable name. Likely a non-standard card layout. Investigate and add to training set.
  </div>
</div>

<!-- Per-image grid -->
<div class="card">
  <h2>Per-image Results Grid (22 images)</h2>
  <p style="color:var(--muted);font-size:0.8rem;margin-bottom:0.75rem">Hover cells for inference time. ✓ = parsed successfully, ✗ = parse failure or no result.</p>
  <table>
    <thead>
      <tr>
        <th>Card</th>
        {img_header}
      </tr>
    </thead>
    <tbody>
      {img_rows}
    </tbody>
  </table>
</div>

<!-- v4 Detail -->
<div class="card">
  <h2>qlora_v4 — Per-card Detail</h2>
  <table>
    <thead>
      <tr>
        <th></th><th>File</th><th>Name</th><th>Types</th><th>HP</th><th>Supertype</th><th>Rarity</th><th>Time</th>
      </tr>
    </thead>
    <tbody>
      {v4_detail_rows}
    </tbody>
  </table>
</div>

<script>
// Training progression bars
const trainingData = {training_data};
const chart = document.getElementById('training-chart');
const maxSamples = Math.max(...trainingData.map(d => d.samples));
trainingData.forEach(d => {{
  const colors = {{qlora_v1:'#ef4444',qlora_v3:'#8b5cf6',qlora_v4:'#10b981'}};
  const color  = colors[d.model] || '#6b7280';
  const pct    = (d.samples / maxSamples * 100).toFixed(0);
  chart.innerHTML += `
    <div class="progress-row">
      <div class="progress-model">${{d.model}}</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${{pct}}%;background:${{color}}">
          ${{d.samples}} samples · ${{d.steps}} steps · ${{d.time_min}} min
        </div>
      </div>
      <div style="width:80px;font-size:0.8rem;color:#94a3b8">loss ${{d.loss}}</div>
    </div>`;
}});

// Loss chart using simple canvas bars
const canvas = document.getElementById('lossChart');
const ctx = canvas.getContext('2d');
canvas.width = canvas.parentElement.clientWidth;
canvas.height = 120;

const models2 = trainingData.map(d => d.model);
const losses  = trainingData.map(d => d.loss);
const maxLoss = Math.max(...losses) * 1.1;
const barW    = 80;
const gap     = 60;
const xStart  = 60;

ctx.clearRect(0,0,canvas.width,canvas.height);
// axes
ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
ctx.beginPath(); ctx.moveTo(xStart,10); ctx.lineTo(xStart, 100); ctx.lineTo(canvas.width-20,100); ctx.stroke();

const colors3 = ['#ef4444','#8b5cf6','#10b981'];
models2.forEach((m, i) => {{
  const x = xStart + i * (barW + gap) + 20;
  const h = (losses[i] / maxLoss) * 80;
  const y = 100 - h;
  ctx.fillStyle = colors3[i];
  ctx.fillRect(x, y, barW, h);
  // label
  ctx.fillStyle = '#e2e8f0'; ctx.font = '11px system-ui';
  ctx.fillText(losses[i], x + barW/2 - 15, y - 4);
  ctx.fillStyle = '#94a3b8'; ctx.font = '10px system-ui';
  ctx.fillText(m.replace('qlora_','v'), x + 10, 115);
}});
// y label
ctx.fillStyle = '#94a3b8'; ctx.font = '10px system-ui';
ctx.fillText('loss', 2, 55);
</script>

</body>
</html>
"""

out = BASE / "comparison_report.html"
out.write_text(html, encoding="utf-8")
print(f"Report written → {out}")
print(f"Size: {out.stat().st_size:,} bytes")
