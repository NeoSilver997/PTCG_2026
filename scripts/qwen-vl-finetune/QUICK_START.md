# PTCG Qwen-VL Quick Start Guide (50 Cards Test)

## Quick Start (Windows)

### Step 1: Check Environment

```batch
cd scripts\qwen-vl-finetune
check.bat
```

This will verify:
- Python installation
- PyTorch and CUDA
- Required dependencies
- Model files
- Test data

### Step 2: Run Test

If all checks pass:

```batch
run_test.bat
```

This will:
- Load the fine-tuned model
- Test 50 Chinese (zh-HK) cards
- Measure inference speed
- Calculate accuracy
- Save results to `.\benchmarks\`

---

## Manual Commands

### Export Data (if needed)

```bash
python export_training_data.py --samples 1800 --output-dir ./datasets
```

### Train Model (if needed)

```bash
python finetune_qwen_vl.py --data-dir ./datasets --output-dir ./outputs --epochs 3
```

### Run Benchmark

```bash
python benchmark_simple.py \
    --model-path ./outputs/final \
    --test-data ./datasets/test.jsonl \
    --samples 50 \
    --language zh-HK
```

---

## Expected Output

```
============================================================
PTCG Qwen-VL 50 Cards Benchmark Test
============================================================
OK: PyTorch 2.1.0
OK: CUDA available = True
OK: GPU = NVIDIA GeForce RTX 5070 Ti

Loading model: .\outputs\final...
OK: Model loaded successfully

Loading test data: .\datasets\test.jsonl...
OK: Found 180 zh-HK cards

Starting test: 50 cards...
------------------------------------------------------------
[  1/50] OK   皮卡丘 ex             - 0.65s
[  2/50] OK   噴火龍 ex             - 0.58s
...

============================================================
TEST RESULTS
============================================================

Summary:
  Total samples: 50
  Success: 47
  Failed: 3
  Success rate: 94.0%
  Total time: 32.5s (0.5 minutes)
  Average inference: 650ms
  Min: 420ms
  Max: 1250ms

Results saved to: .\benchmarks
  - benchmark_results.json
  - benchmark_report.txt
```

---

## Performance Benchmarks (RTX 5070 Ti 16GB)

| Metric | Target |
|--------|--------|
| Average inference | 500-800ms |
| Success rate | >90% |
| Name accuracy | >95% |
| HP accuracy | >95% |
| Overall accuracy | >85% |

---

## Troubleshooting

### Error: Model not found

```bash
# Complete training first
python finetune_qwen_vl.py --data-dir ./datasets --output-dir ./outputs --epochs 3
```

### Error: Test data not found

```bash
# Export data
python export_training_data.py --samples 1800 --output-dir ./datasets
```

### Error: PyTorch not installed

```bash
# Install PyTorch with CUDA 12.1
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### Error: CUDA Out of Memory

Close other GPU applications or use CPU mode:

```bash
python benchmark_simple.py --model-path ./outputs/final --device cpu
```

---

## Files Created

After successful test:

```
benchmarks/
├── benchmark_results.json    # Detailed JSON results
└── benchmark_report.txt      # Text summary
```

---

## Next Steps

1. Review results in `benchmark_report.txt`
2. If accuracy < 85%, consider:
   - More training data
   - More training epochs
   - Adjust LoRA parameters
3. Deploy to production if results are satisfactory

---

## Support

For detailed troubleshooting, see:
- `TEST_FIXES.md` - Common issues and solutions
- `BENCHMARK_GUIDE.md` - Complete benchmark guide
- `README.md` - Project overview
