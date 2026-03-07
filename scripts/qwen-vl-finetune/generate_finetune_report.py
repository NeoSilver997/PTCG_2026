"""Generate HTML comparison report for QLoRA v1 fine-tune vs baseline benchmark."""
import json
import datetime
import os

BASE = os.path.dirname(os.path.abspath(__file__))
BENCHMARKS = os.path.join(BASE, "benchmarks")

ft = json.load(open(os.path.join(BENCHMARKS, "finetuned_v1", "benchmark_results_20260307_160615.json"), encoding="utf-8"))
bl = json.load(open(os.path.join(BENCHMARKS, "hf_baseline", "benchmark_results_20260307_094621.json"), encoding="utf-8"))

bl_map = {r["name"]: r for r in bl["detailed_results"]}

rows = []
for r in ft["detailed_results"]:
    b = bl_map.get(r["name"], {})
    ft_ok = r["success"]
    bl_ok = b.get("success", False)
    ft_t = round(r["inference_time"], 1)
    bl_t = round(b.get("inference_time", 0), 1)
    pred = r.get("predicted") or {}
    name = pred.get("name", "") if isinstance(pred, dict) else ""
    diff = ""
    if ft_ok and not bl_ok:
        diff = "gained"
    elif not ft_ok and bl_ok:
        diff = "lost"
    elif not ft_ok and not bl_ok:
        diff = "fail-both"
    rows.append({"file": r["name"], "ft_ok": ft_ok, "bl_ok": bl_ok, "ft_t": ft_t, "bl_t": bl_t, "name": name, "diff": diff})

now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")


def badge(ok):
    cls = "ok" if ok else "fail"
    txt = "OK" if ok else "FAIL"
    return f'<span class="badge {cls}">{txt}</span>'


table_rows = ""
for r in rows:
    table_rows += (
        f'<tr class="{r["diff"]}">'
        f"<td>{r['file']}</td>"
        f"<td>{badge(r['ft_ok'])}</td>"
        f"<td>{badge(r['bl_ok'])}</td>"
        f"<td>{r['ft_t']}s</td>"
        f"<td>{r['bl_t']}s</td>"
        f'<td class="name">{r["name"]}</td>'
        "</tr>\n"
    )

ft_ok_count = sum(1 for r in ft["detailed_results"] if r["success"])
bl_ok_count = sum(1 for r in bl["detailed_results"] if r["success"])
ft_rate = round(ft_ok_count / ft["total_samples"] * 100, 1)
bl_rate = round(bl_ok_count / bl["total_samples"] * 100, 1)
ft_avg = round(ft["avg_inference_time_sec"], 1)
bl_avg = round(bl["avg_inference_time_sec"], 1)

loss_rows = [
    (10, 1.148, 0.11, 4),
    (20, 0.503, 0.22, 7),
    (50, 0.278, 0.56, 19),
    (88, 0.237, 1.00, 33),
    (100, 0.189, 1.11, 37),
    (150, 0.195, 1.67, 56),
    (200, 0.160, 2.22, 74),
    (250, 0.154, 2.78, 93),
    (270, 0.1527, 3.00, 100),
]
loss_table = ""
for step, loss, epoch, pct in loss_rows:
    bold = "b" if step == 270 else "span"
    loss_table += (
        f"<tr><td><{bold}>{step}</{bold}></td>"
        f"<td><{bold}>{loss}</{bold}></td>"
        f"<td><{bold}>{epoch:.2f}</{bold}></td>"
        f'<td><div class="progress-bar"><div class="progress-fill" style="width:{pct}%"></div></div></td></tr>\n'
    )

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QLoRA v1 Fine-tune Report</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e1e4e8; padding: 24px; }}
  h1 {{ font-size: 24px; font-weight: 700; margin-bottom: 4px; color: #58a6ff; }}
  .subtitle {{ color: #8b949e; font-size: 14px; margin-bottom: 28px; }}
  .section {{ margin-bottom: 36px; }}
  h2 {{ font-size: 16px; font-weight: 600; color: #c9d1d9; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #30363d; }}
  .cards {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin-bottom: 20px; }}
  .card {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }}
  .card-label {{ font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }}
  .card-value {{ font-size: 28px; font-weight: 700; color: #58a6ff; }}
  .card-value.green {{ color: #3fb950; }}
  .card-value.yellow {{ color: #d29922; }}
  .card-sub {{ font-size: 12px; color: #8b949e; margin-top: 4px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th {{ background: #21262d; color: #8b949e; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; padding: 8px 12px; text-align: left; }}
  td {{ padding: 8px 12px; border-bottom: 1px solid #21262d; }}
  tr:hover td {{ background: #161b22; }}
  tr.gained td {{ background: rgba(63,185,80,.1); }}
  tr.lost td {{ background: rgba(248,81,73,.1); }}
  tr.fail-both td {{ background: rgba(187,128,9,.08); }}
  .badge {{ padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }}
  .badge.ok {{ background: rgba(63,185,80,.2); color: #3fb950; }}
  .badge.fail {{ background: rgba(248,81,73,.2); color: #f85149; }}
  .name {{ color: #8b949e; font-size: 12px; }}
  .legend {{ display: flex; gap: 20px; margin-bottom: 12px; font-size: 12px; color: #8b949e; }}
  .legend-item {{ display: flex; align-items: center; gap: 6px; }}
  .dot {{ width: 10px; height: 10px; border-radius: 2px; }}
  .dot.green {{ background: rgba(63,185,80,.5); }}
  .dot.red {{ background: rgba(248,81,73,.5); }}
  .grid2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
  .block {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }}
  .block h3 {{ font-size: 13px; color: #8b949e; margin-bottom: 10px; font-weight: 600; }}
  .kv {{ display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #21262d; font-size: 13px; }}
  .kv:last-child {{ border: none; }}
  .kv-key {{ color: #8b949e; }}
  .kv-val {{ color: #c9d1d9; font-weight: 500; }}
  .progress-bar {{ height: 6px; background: #21262d; border-radius: 3px; margin-top: 6px; }}
  .progress-fill {{ height: 100%; border-radius: 3px; background: #3fb950; }}
  .note {{ background: #161b22; border-left: 3px solid #58a6ff; padding: 12px 16px; border-radius: 0 6px 6px 0; font-size: 13px; color: #8b949e; margin-top: 16px; line-height: 1.6; }}
  .verdict {{ display: flex; align-items: center; gap: 12px; background: rgba(63,185,80,.1); border: 1px solid rgba(63,185,80,.3); border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; }}
  .verdict-icon {{ font-size: 28px; }}
  .verdict-text {{ font-size: 14px; line-height: 1.6; }}
  .verdict-title {{ font-weight: 600; color: #3fb950; font-size: 16px; }}
</style>
</head>
<body>
<h1>QLoRA v1 Fine-tune Report</h1>
<p class="subtitle">PTCG Card Extraction &nbsp;&middot;&nbsp; Qwen2.5-VL-7B-Instruct &nbsp;&middot;&nbsp; Generated {now}</p>

<div class="section">
<div class="verdict">
  <div class="verdict-icon">&#x2714;&#xFE0E;</div>
  <div class="verdict-text">
    <div class="verdict-title">Training Successful &mdash; Accuracy Maintained</div>
    Fine-tuned model achieves <b>{ft_rate}%</b> (21/22) — matching baseline exactly. 
    The model gained 1 card the baseline missed and lost 1 different card, with net zero change in accuracy.
  </div>
</div>
</div>

<div class="section">
<h2>Summary Comparison</h2>
<div class="cards">
  <div class="card"><div class="card-label">Fine-tuned Accuracy</div><div class="card-value green">{ft_rate}%</div><div class="card-sub">21 / {ft['total_samples']} cards parsed</div></div>
  <div class="card"><div class="card-label">Baseline Accuracy</div><div class="card-value green">{bl_rate}%</div><div class="card-sub">21 / {bl['total_samples']} cards parsed</div></div>
  <div class="card"><div class="card-label">Fine-tuned Avg Time</div><div class="card-value yellow">{ft_avg}s</div><div class="card-sub">4-bit NF4 + LoRA (not merged)</div></div>
  <div class="card"><div class="card-label">Baseline Avg Time</div><div class="card-value">{bl_avg}s</div><div class="card-sub">bf16 full precision</div></div>
  <div class="card"><div class="card-label">Cards Regained</div><div class="card-value green">+1</div><div class="card-sub">1772619740614 (&#30339;&#30339;)</div></div>
  <div class="card"><div class="card-label">Cards Lost</div><div class="card-value yellow">&minus;1</div><div class="card-sub">hk00014014.png</div></div>
</div>
</div>

<div class="section">
<h2>Training Details</h2>
<div class="grid2">
  <div class="block">
    <h3>Model &amp; Config</h3>
    <div class="kv"><span class="kv-key">Base model</span><span class="kv-val">Qwen2.5-VL-7B-Instruct</span></div>
    <div class="kv"><span class="kv-key">Method</span><span class="kv-val">QLoRA (4-bit NF4)</span></div>
    <div class="kv"><span class="kv-key">LoRA rank / alpha</span><span class="kv-val">16 / 32</span></div>
    <div class="kv"><span class="kv-key">Adapter size</span><span class="kv-val">2.26 GB (safetensors)</span></div>
    <div class="kv"><span class="kv-key">Optimizer</span><span class="kv-val">AdamW (adamw_torch)</span></div>
    <div class="kv"><span class="kv-key">VRAM at inference</span><span class="kv-val">7.24 GB</span></div>
    <div class="kv"><span class="kv-key">GPU</span><span class="kv-val">RTX 5070 Ti 16.3 GB</span></div>
  </div>
  <div class="block">
    <h3>Training Run</h3>
    <div class="kv"><span class="kv-key">Training samples</span><span class="kv-val">1,437</span></div>
    <div class="kv"><span class="kv-key">Validation samples</span><span class="kv-val">176</span></div>
    <div class="kv"><span class="kv-key">Test samples</span><span class="kv-val">187</span></div>
    <div class="kv"><span class="kv-key">Languages</span><span class="kv-val">en-US, zh-HK, ja-JP</span></div>
    <div class="kv"><span class="kv-key">Epochs</span><span class="kv-val">3</span></div>
    <div class="kv"><span class="kv-key">Total steps</span><span class="kv-val">270 / 270 &#x2714;</span></div>
    <div class="kv"><span class="kv-key">Final loss</span><span class="kv-val">0.1527</span></div>
    <div class="kv"><span class="kv-key">Batch / grad accum</span><span class="kv-val">1 / 16 (eff. 16)</span></div>
  </div>
</div>
<div class="note">
  <b>Speed note:</b> Fine-tuned model runs at 194.6s/card (3&times; slower than baseline 65.8s/card). The LoRA adapter is <i>not yet merged</i> into the base model &mdash; 4-bit dequantization happens at every autoregressive step. 
  Merging LoRA weights and converting to GGUF for Ollama will bring inference time back to baseline or better.
</div>
</div>

<div class="section">
<h2>Per-Card Results</h2>
<div class="legend">
  <div class="legend-item"><div class="dot green"></div><span>Fine-tuned gained (baseline failed)</span></div>
  <div class="legend-item"><div class="dot red"></div><span>Fine-tuned lost (baseline passed)</span></div>
</div>
<table>
<thead><tr><th>Image</th><th>Fine-tuned</th><th>Baseline</th><th>FT Time</th><th>BL Time</th><th>Card Name (extracted)</th></tr></thead>
<tbody>
{table_rows}</tbody>
</table>
</div>

<div class="section">
<h2>Training Loss Curve</h2>
<table>
<thead><tr><th>Step</th><th>Loss</th><th>Epoch</th><th>Progress</th></tr></thead>
<tbody>
{loss_table}</tbody>
</table>
</div>

<div class="section">
<h2>Next Steps</h2>
<div class="grid2">
  <div class="block">
    <h3>&#x1F4E6; Merge &amp; Export (Recommended)</h3>
    <div class="kv"><span class="kv-key">1. Merge LoRA</span><span class="kv-val">peft.merge_and_unload()</span></div>
    <div class="kv"><span class="kv-key">2. Convert to GGUF</span><span class="kv-val">llama.cpp convert-hf-to-gguf.py</span></div>
    <div class="kv"><span class="kv-key">3. Quantize</span><span class="kv-val">Q4_K_M or Q8_0</span></div>
    <div class="kv"><span class="kv-key">4. Deploy</span><span class="kv-val">ollama create ptcg-card-reader</span></div>
  </div>
  <div class="block">
    <h3>&#x1F4CA; Potential Improvements</h3>
    <div class="kv"><span class="kv-key">More epochs (5-6)</span><span class="kv-val">May improve structured field accuracy</span></div>
    <div class="kv"><span class="kv-key">Higher LoRA rank (32)</span><span class="kv-val">More capacity for complex cards</span></div>
    <div class="kv"><span class="kv-key">Learning rate tuning</span><span class="kv-val">Current: 2e-4 (default)</span></div>
    <div class="kv"><span class="kv-key">Field-level eval</span><span class="kv-val">hp / attacks / rarity accuracy</span></div>
  </div>
</div>
</div>

</body>
</html>"""

out_path = os.path.join(BENCHMARKS, "finetuned_v1", "report_20260307.html")
with open(out_path, "w", encoding="utf-8") as f:
    f.write(html)
print(f"Report saved: {out_path}")
print(f"Size: {os.path.getsize(out_path) // 1024} KB")
