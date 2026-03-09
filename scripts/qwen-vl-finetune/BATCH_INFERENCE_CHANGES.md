# Batch Inference Speedup — Changes Summary

**Date:** 2026-03-09  
**Model:** `qlora_v4/final` (Qwen2.5-VL-7B-Instruct + LoRA, BnB nf4 4-bit)  
**GPU:** RTX 5070 Ti (sm_120, Blackwell, 16 GB VRAM)

---

## Problem

The inference service processed cards **sequentially** — one image per `model.generate()` call. On Blackwell, BnB 4-bit in single-token GEMV mode achieves only **9.8–10.4 tok/s**, giving **~28s per card**.

### Root Cause

| Factor | Detail |
|--------|--------|
| GEMV mode (batch=1) | Underutilizes GPU memory bandwidth; TensorCores idle |
| BnB nf4 dequant overhead | sm_120 native CUDA 12.8 DLL present, but 4-bit GEMV is still slow |
| Profiling split (removed) | Extra `generate(max_new_tokens=1)` call added ~0.3–1.25s per card |

---

## Tested Options (All Rejected)

| Mode | tok/s | Decision |
|------|-------|----------|
| BnB INT8 (batch=1) | 6.3 | ❌ Slower than 4-bit |
| BnB 4-bit + `torch.compile` (batch=1) | 10.5 | ❌ BnB ops break compile graph |
| BF16 no-quant | n/a | ❌ OOM — 14 GB model > 11.4 GB available |
| flash-attn (WSL) | n/a | ❌ sm_120 not supported (requires sm_80/90) |

---

## Solution: True Batch Inference

Processing multiple images in a single `model.generate(batch_size=N)` call switches from GEMV → GEMM, engaging sm_120 TensorCores properly.

### Batch Speedup Results

| Batch Size | Time/Card | tok/s | Speedup vs Sequential |
|-----------|-----------|-------|----------------------|
| 1 (old)   | 28.1s     | 9.8   | 1× (baseline)        |
| 4         | 8.2s      | 28.0  | **3.4×**             |
| 8         | 4.6s      | 52.4  | **5.5×**             |
| 9         | 4.2s      | 57.2  | **6.7×**             |

---

## Code Changes — `inference_service.py`

### 1. `processor.tokenizer.padding_side = "left"` (in `load()`)
Required for correct batch generation with a causal LM — padding must be on the left so output tokens are always at the right end.

### 2. New method: `batch_predict(images: List[PIL.Image])`
Runs a single `model.generate()` call on N images simultaneously.

```python
def batch_predict(self, images, max_new_tokens=None):
    # Build conversations for all N images
    # Call processor.apply_chat_template(..., padding=True)
    # Single model.generate() → split output per image, trim at EOS
    # Returns List[(extraction, confidence, ms_per_card)]
```

### 3. `predict()` — removed double-run profiling overhead
Previously ran `generate(max_new_tokens=1)` first to measure prefill, adding ~0.3–1.25s per card. Removed.  
Profiling data collected (Mar 9): **prefill≈1.25s, decode≈23.7s, 10.4 tok/s**.

### 4. `/api/cards/batch-extract` endpoint updated
Now calls `batch_predict()` instead of looping `predict()` sequentially.  
Includes fallback to sequential `predict()` if `batch_predict()` raises an exception.

---

## Optimal Runtime Configuration

```powershell
$py = "C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune\.venv312\Scripts\python.exe"
Set-Location "C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune"
Start-Process -FilePath $py `
  -ArgumentList "inference_service.py --adapter ./outputs/qlora_v4/final --port 8000 --no-compile --quantize 4bit" `
  -RedirectStandardOutput ".\outputs\inference_service.log" `
  -RedirectStandardError  ".\outputs\inference_service_err.log" -NoNewWindow
```

- Use `--no-compile` — `torch.compile` does not improve decode speed for BnB models
- Use `--quantize 4bit` — INT8 is slower on sm_120
- POST **8 images per request** to `/api/cards/batch-extract` for optimal throughput

### Batch Request Format
```bash
curl -X POST http://localhost:8000/api/cards/batch-extract \
  -H "Content-Type: application/json" \
  -d '{"images": ["<base64_card_1>", "<base64_card_2>", ...]}'
```

---

## VRAM Budget

| State | VRAM Used |
|-------|-----------|
| No model (Windows baseline) | 4.6 GB |
| 4-bit model loaded | 6.13 GB |
| Batch=9 inference (peak) | ~8–9 GB (no OOM) |
| INT8 model loaded | 9.60 GB |
| BF16 model (not tested) | ~14 GB → OOM |

---

## Files Changed

| File | Change |
|------|--------|
| `inference_service.py` | `padding_side="left"`, `batch_predict()`, removed double-run, updated `/api/cards/batch-extract` |
| `batch_speedtest.py` | New — standalone batch benchmark (batch=1/2/4/8) |
| `count_tokens.py` | New — token counting diagnostic (avg 198 output tokens, ~21.7s, sequential) |
