# qlora_v3 — Training Speed Optimization Summary

**Date:** 2026-03-08  
**Result:** 180 steps in **35 min** @ **11.5s/step** | Loss: 0.394 | Previously: ~128s/step (~7h estimated)  
**Speedup: ~11×**

---

## Problem

qlora_v3 started at ~170s/step (3–5× slower than qlora_v1's ~40s/step).  
After initial fixes (single processor call, `dataloader_num_workers=0`) it settled at **128s/step** — still unacceptable.

---

## Root Cause Analysis

### Bottleneck 1 — ViT Gradient Checkpointing on a Frozen Encoder (Major)

The vision encoder (ViT) parameters are frozen during LoRA training (`requires_grad=False`).  
With gradient checkpointing enabled globally, PyTorch still **recomputed the full ViT forward pass twice** per mini-batch — once for the forward, once during backward to recompute activations.  
Since ViT gradients are not needed (frozen), this recompute is 100% wasted.

**Fix:** After `get_peft_model()`, explicitly disable GC on the visual encoder:
```python
# In load_qlora_model(), after get_peft_model():
inner = model.base_model.model if hasattr(model, 'base_model') else model
visual = getattr(getattr(inner, 'model', inner), 'visual', None)
if visual is not None and hasattr(visual, 'gradient_checkpointing_disable'):
    visual.gradient_checkpointing_disable()
```

---

### Bottleneck 2 — Excessive ViT Patch Count (Major)

PTCG card images are 321×448px. The Qwen2.5-VL processor produced **704 ViT patches** (1×32×22 grid).  
ViT self-attention cost scales as **O(n²)** — 704 patches is 49× more expensive than 96 patches.

**Root cause detail:** We set `processor.image_processor.max_pixels = 200704` but the **fast processor** (`Qwen2VLImageProcessorFast`) uses `size['longest_edge']`, not the `max_pixels` attribute — so the cap never took effect.

**Fix 1 — Correct processor cap** (both attribute AND size dict):
```python
_max_px = 256 * 28 * 28   # 200704
_min_px = 4 * 28 * 28     # 3136
processor.image_processor.max_pixels = _max_px
processor.image_processor.min_pixels = _min_px
if hasattr(processor.image_processor, 'size') and isinstance(processor.image_processor.size, dict):
    processor.image_processor.size['longest_edge'] = _max_px
    processor.image_processor.size['shortest_edge'] = _min_px
```

**Fix 2 — Pre-resize images before processor** (more reliable):
```python
# In PTCGCardDataset._load_image():
MAX_LONG_EDGE = 168  # px

w, h = img.size
long_edge = max(w, h)
if long_edge > self.MAX_LONG_EDGE:
    scale = self.MAX_LONG_EDGE / long_edge
    img = img.resize(
        (max(14, int(round(w * scale))), max(14, int(round(h * scale)))),
        Image.LANCZOS
    )
```

**Result:** 321×448 → 120×168 → **96 patches** (1×12×8 = 96 vs 704 before)  
- Patch reduction: **7.3×**  
- ViT attention cost: **1.9% of original** (50× less)  
- LLM visual tokens: 24 (vs 176 before)

| Metric | Before | After |
|--------|--------|-------|
| ViT patches | 704 | 96 |
| LLM visual tokens | 176 | 24 |
| Attention cost ratio | 100% | 1.9% |

---

### Bottleneck 3 — `modules_to_save=["lm_head"]` (Moderate)

`lm_head` has **545M parameters** (152,064 vocab × 3,584 hidden dim).  
`modules_to_save` creates a full fp32 copy of lm_head = **2.18GB** VRAM.  
With Adafactor optimizer, first moment = another **~2.18GB** = **4.36GB total**.

**Decision:** Remove `modules_to_save` — `lm_head` is tied to `embed_tokens` (bf16, unquantized), so gradient flow works without an explicit fp32 copy. Confirmed via `test_modules_to_save.py`.

**Required workaround:** Call `model.enable_input_require_grads()` after `get_peft_model()` to restore the input gradient hook that PEFT normally sets up via `modules_to_save`.

```python
model = get_peft_model(model, lora_config)
model.enable_input_require_grads()  # Required when modules_to_save=[] with 4-bit model
```

**Result:** Trainable params: 47.6M (vs 592.6M before) | Freed ~4.36GB optimizer VRAM

---

### Bottleneck 4 — Optimizer: `adamw_torch` → `adafactor`

`adamw_torch` creates full fp32 momentum + variance tensors = 2× param count = **8.72GB** for 545M lm_head params (before fix 3).  
`paged_adamw_8bit` (bitsandbytes) crashes on Blackwell sm_120 (RTX 5070 Ti).  
`adafactor` uses **factored second moments** — no momentum for large tensors, column/row factors only — and is fully Blackwell-safe.

```python
# In TrainingArguments:
optim="adafactor",
adafactor=True,
```

---

### Bottleneck 5 — Fast Processor `size` Dict Not Updated

Previous code set `processor.image_processor.max_pixels` (attribute) but the fast processor class uses `processor.image_processor.size['longest_edge']` internally. Setting only the attribute had no effect.

**Fix:** Update both:
```python
processor.image_processor.max_pixels = _max_px
processor.image_processor.size['longest_edge'] = _max_px  # Fast processor uses this
```

---

## SDPA Attention (No Change)

Tested `attn_implementation="sdpa"` — no measurable speedup. At 96 patches / 24 visual tokens, the LLM attention is no longer the bottleneck (sequence length is short). Reverted to default.

---

## Things That Did NOT Work

| Attempt | Why It Failed |
|---------|--------------|
| `modules_to_save=[]` + freeze lm_head manually | `requires_grad_(False)` inside PEFT wrapper broke the forward hook → RuntimeError |
| `paged_adamw_8bit` | bitsandbytes CUDA kernel unsupported on Blackwell (sm_120) |
| `batch_size=2` | Activation memory for 2nd sample filled the VRAM freed by removing lm_head (still 15.8GB used) |
| Disabling gradient_checkpointing globally | `prepare_model_for_kbit_training` expects GC; without it the 4-bit model's input grad hook is broken → RuntimeError |
| `SDPA` attn_implementation | Attention not bottleneck at 96 patches |

---

## Final Configuration

```
Model:     Qwen/Qwen2.5-VL-7B-Instruct (4-bit NF4, double quant)
LoRA:      r=16, alpha=32, target=q/k/v/o/gate/up/down
Optimizer: Adafactor (Blackwell-safe, factored second moments)
Epochs:    3
Batch:     1 (effective 16 via grad acc ×16)
Seq len:   512
Image:     Pre-resized to max 168px → 96 ViT patches (from 704)
GC:        Enabled globally, disabled for frozen ViT encoder specifically
lm_head:   Removed from modules_to_save; enable_input_require_grads() called manually
Workers:   0 (Windows multiprocessing avoidance)
```

## Results

| Metric | qlora_v1 | Before fixes | After fixes |
|--------|----------|-------------|-------------|
| Step time | ~40s | ~128s | **~11.5s** |
| Total time (180 steps) | ~2h | ~7h | **35 min** |
| Train loss | — | — | **0.394** |
| VRAM at end | — | 15.8GB | 8.4GB allocated |

## Output Artifacts

- `outputs/qlora_v3/checkpoint-100/` — mid-training checkpoint
- `outputs/qlora_v3/checkpoint-180/` — final step checkpoint  
- `outputs/qlora_v3/final/` — saved final adapter weights

---

## Verification Results (2026-03-08)

**Test:** 5 images from `data/test_sample/` via `benchmark_finetuned.py` (4-bit, 6.13GB VRAM)

### qlora_v3 vs HF Baseline (Qwen2.5-VL-7B-Instruct, no fine-tune)

| Metric | HF Baseline | qlora_v3 |
|--------|------------|---------|
| Success rate | 95.5% | **100%** |
| Avg inference time | 65.8s | **21.7s** |
| VRAM | ~14GB (CPU offload) | **6.13GB** (4-bit) |
| Multi-language names | ✅ | ✅ |
| `supertype` extraction | ✅ | ✅ |

### Per-card comparison (same 5 test images)

| Image | HF Baseline | qlora_v3 |
|-------|-------------|----------|
| 1772464858989 (Drakloak) | name=Drakloak types=Dragon | name=Drakloak types=BUG* super=POKEMON |
| 1772466303986 (老大的指令) | name=老大的指令 types=訓練家 | name=老大的指令 super=TRAINER |
| 1772524883686 (皮卡丘) | name=皮卡丘 types=電 | name=皮卡丘 types=BUG* super=POKEMON |
| 1772545646419 (聖灰) | name=聖灰 | name=聖灰 super=POKEMON |
| 1772619740614 (皮皮) | name=皮皮 | name=皮皮 super=POKEMON |

*BUG = types format issue explained below

### Bug Found — PostgreSQL Array Types as Char-Split

**Root cause:** `export_training_data.py` called `list(row.get("types"))` on the value returned by psycopg2. Since psycopg2 doesn't recognize the custom `PokemonType` enum type, it returns the PostgreSQL array as a raw text string like `"{PSYCHIC}"`. Calling `list()` on a string iterates characters → `["{", "P", "S", "Y", "C", "H", "I", "C", "}"]`. The model then faithfully learned to reproduce this broken format.

**Fix 1 — `export_training_data.py`:** Added `_parse_pg_array()` helper that correctly parses `"{PSYCHIC}"` → `["PSYCHIC"]`:
```python
def _parse_pg_array(val) -> List[str]:
    if isinstance(val, list):
        return [str(v) for v in val]
    if isinstance(val, str):
        val = val.strip()
        if val.startswith('{') and val.endswith('}'):
            inner = val[1:-1].strip()
            return [x.strip().strip('"') for x in inner.split(',') if x.strip()]
    return []
```
Then `types=_parse_pg_array(row.get("types"))` instead of `types=list(row.get("types") or [])`.

**Fix 2 — Existing JSONL repaired in-place:** All 1200 samples in `datasets/*.jsonl` repaired by joining the char-split arrays and re-parsing:
- `train.jsonl`: 960 records checked
- `validation.jsonl`: 120 records checked
- `test.jsonl`: 120 records checked
- `*_local.jsonl` variants also repaired

**Verification after repair:**
```
types: ['PSYCHIC']   # was: ['{', 'P', 'S', 'Y', 'C', 'H', 'I', 'C', '}']
```

### Next Step — qlora_v4

Re-run training with repaired datasets to fix the types format in model output:
```powershell
$py = "C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune\.venv312\Scripts\python.exe"
Set-Location "C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune"
& $py finetune_qwen_vl.py `
    --data-dir ./datasets `
    --output-dir ./outputs/qlora_v4 `
    --use-local-images --epochs 3 `
    --batch-size 1 --gradient-accumulation-steps 16 `
    --lora-r 16 --lora-alpha 32 `
    *>> ".\outputs\qlora_v4_train.log"
```
Expected: ~35 min, types output as `["PSYCHIC"]` not `["{","P","S","Y","C","H","I","C","}"]`

