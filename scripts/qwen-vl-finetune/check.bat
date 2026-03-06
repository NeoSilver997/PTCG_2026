@echo off
chcp 65001 >nul 2>&1
REM PTCG Qwen-VL Check Environment

echo ============================================================
echo PTCG Qwen-VL Environment Check
echo ============================================================
echo.

echo [1/4] Checking Python...
python --version 2>&1
if errorlevel 1 (
    echo ERROR: Python not found
    pause
    exit /b 1
)
echo OK
echo.

echo [2/4] Checking PyTorch...
python -c "import torch; print('Version:', torch.__version__); print('CUDA:', torch.cuda.is_available())" 2>&1
if errorlevel 1 (
    echo ERROR: PyTorch not installed
    echo Run: pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
    pause
    exit /b 1
)
echo OK
echo.

echo [3/4] Checking Model...
if exist ".\outputs\final" (
    echo OK: Model found
) else (
    echo ERROR: Model not found
    echo Run: python finetune_qwen_vl.py
    pause
    exit /b 1
)
echo.

echo [4/4] Checking Test Data...
if exist ".\datasets\test.jsonl" (
    echo OK: Test data found
) else (
    echo ERROR: Test data not found
    echo Run: python export_training_data.py --samples 1800
    pause
    exit /b 1
)
echo.

echo ============================================================
echo All checks passed!
echo ============================================================
echo.
echo Run: run_test.bat
echo.
pause
