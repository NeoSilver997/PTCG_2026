@echo off
chcp 65001 >nul 2>&1
REM PTCG Qwen-VL Run 50 Cards Test

echo ============================================================
echo PTCG Qwen-VL 50 Cards Benchmark
echo ============================================================
echo.

REM Check dependencies
python -c "import torch, transformers, PIL" 2>&1
if errorlevel 1 (
    echo ERROR: Missing dependencies
    echo Run: pip install torch torchvision torchaudio transformers Pillow
    pause
    exit /b 1
)

REM Check model
if not exist ".\outputs\final" (
    echo ERROR: Model not found at .\outputs\final
    echo Please train model first:
    echo   python finetune_qwen_vl.py --data-dir ./datasets --output-dir ./outputs
    pause
    exit /b 1
)

REM Check test data
if not exist ".\datasets\test.jsonl" (
    echo ERROR: Test data not found
    echo Please export data:
    echo   python export_training_data.py --samples 1800
    pause
    exit /b 1
)

echo Starting benchmark test...
echo.

python benchmark_simple.py ^
    --model-path .\outputs\final ^
    --test-data .\datasets\test.jsonl ^
    --samples 50 ^
    --language zh-HK ^
    --output-dir .\benchmarks

if errorlevel 1 (
    echo.
    echo TEST FAILED
    pause
    exit /b 1
)

echo.
echo ============================================================
echo TEST COMPLETE
echo ============================================================
echo.
echo Results saved to: .\benchmarks
echo.
pause
