# PTCG Qwen-VL - 50 Cards Test (UPDATED)

## Quick Start

### Step 1: Check Environment

```batch
check.bat
```

### Step 2: Run Test

```batch
run_test.bat
```

---

## Prerequisites

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Export Data (if not exists)

**IMPORTANT**: You need to fix the Prisma issue first. See `DATA_EXPORT_FIX.md`

```bash
# Fix Prisma client
cd c:\AI_Server\Coding\PTCG_2026\packages\database
pnpm exec prisma generate

# Then export data
cd c:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune
python export_training_data.py --samples 1800 --output-dir ./datasets
```

### 3. Train Model (if not exists)

```bash
python finetune_qwen_vl.py --data-dir ./datasets --output-dir ./outputs --epochs 3
```

### 4. Run Test

```bash
python benchmark_simple.py --model-path ./outputs/final --samples 50 --language zh-HK
```

---

## Files

| File | Description |
|------|-------------|
| `check.bat` | Check environment |
| `run_test.bat` | Run 50 cards test |
| `benchmark_simple.py` | Benchmark script (English, no encoding issues) |
| `DATA_EXPORT_FIX.md` | Fix data export issues |
| `QUICK_START.md` | Quick start guide |

---

## Expected Output

```
============================================================
PTCG Qwen-VL 50 Cards Benchmark
============================================================
Starting benchmark test...

Loading model: .\outputs\final...
OK: Model loaded successfully

Loading test data: .\datasets\test.jsonl...
OK: Found 180 zh-HK cards

Starting test: 50 cards...
------------------------------------------------------------
[  1/50] OK   Card Name            - 0.65s
[  2/50] OK   Card Name            - 0.58s
...

============================================================
TEST RESULTS
============================================================

Summary:
  Total samples: 50
  Success: 47
  Failed: 3
  Success rate: 94.0%
  Average inference: 650ms

Results saved to: .\benchmarks
```

---

## Troubleshooting

### Error: Prisma client not generated

See `DATA_EXPORT_FIX.md` for detailed solutions.

Quick fix:
```bash
cd c:\AI_Server\Coding\PTCG_2026\packages\database
pnpm exec prisma generate
```

### Error: Test data not found

```bash
python export_training_data.py --samples 1800 --output-dir ./datasets
```

### Error: Model not found

```bash
python finetune_qwen_vl.py --data-dir ./datasets --output-dir ./outputs --epochs 3
```

### Error: Missing dependencies

```bash
pip install torch torchvision torchaudio transformers Pillow
```

---

## Performance Benchmarks (RTX 5070 Ti 16GB)

| Metric | Target |
|--------|--------|
| Average inference time | 500-800ms |
| Success rate | >90% |
| Name accuracy | >95% |
| HP accuracy | >95% |

---

## Support Documents

- `DATA_EXPORT_FIX.md` - Fix Prisma and data export issues
- `QUICK_START.md` - Quick start guide
- `BENCHMARK_GUIDE.md` - Complete benchmark guide
- `TEST_FIXES.md` - Troubleshooting guide
- `README.md` - Project overview
