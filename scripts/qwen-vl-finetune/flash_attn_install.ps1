#!/usr/bin/env pwsh
# =============================================================================
# Flash Attention 2 Installation Guide for PTCG System
#
# PROBLEM: Current setup uses PyTorch nightly (cu128) which has no pre-built
#          flash-attn wheels and no nvcc (CUDA Toolkit) to build from source.
#
# SOLUTION: Switch to PyTorch stable (cu124) + install CUDA 12.4 Toolkit.
#
# EXPECTED RESULT: 21s → ~14s per image (+30% speed, same 99% accuracy)
#
# WARNING: This reinstalls PyTorch. Back up your venv or use a new one.
#          Run only after reading through all steps.
# =============================================================================

param(
    [switch]$DryRun,    # Print commands without executing
    [switch]$SkipCuda   # Skip CUDA Toolkit step (if already installed)
)

$VenvPy = "C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune\.venv312\Scripts\python.exe"
$VenvPip = "C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune\.venv312\Scripts\pip.exe"

function Write-Step { param([string]$Msg) Write-Host "`n>>> $Msg" -ForegroundColor Cyan }
function Exec {
    param([string]$Cmd)
    if ($DryRun) {
        Write-Host "    [DRY-RUN] $Cmd" -ForegroundColor DarkGray
    } else {
        Write-Host "    > $Cmd" -ForegroundColor White
        Invoke-Expression $Cmd
        if ($LASTEXITCODE -ne 0) {
            Write-Host "    [FAILED] exit $LASTEXITCODE" -ForegroundColor Red
            exit 1
        }
    }
}

# ── Step 0: Check current state ──────────────────────────────────────────────
Write-Step "Step 0: Current environment"
& $VenvPy -c "import torch; print('PyTorch:', torch.__version__, '| CUDA:', torch.version.cuda)"
& $VenvPy -c "import subprocess; r=subprocess.run(['nvcc','--version'],capture_output=True,text=True); print(r.stdout.strip() or 'nvcc NOT FOUND: ' + r.stderr.strip())"

Write-Host @"

REQUIRED BEFORE CONTINUING:
  1. Install CUDA 12.4 Toolkit (if nvcc not found above):
     Download: https://developer.nvidia.com/cuda-12-4-0-download-archive
     Install with 'Custom' option, check: Toolkit components (nvcc, libraries)
     UNCHECK: Driver (you already have RTX 5070 Ti driver)

  2. After install, verify nvcc is in PATH:
     nvcc --version   # should show "release 12.4"

  3. Set CUDA_HOME (may auto-set on restart):
     [System.Environment]::SetEnvironmentVariable('CUDA_HOME','C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4','Machine')

Press any key to continue once CUDA Toolkit is installed (or use -SkipCuda to proceed anyway)...
"@

if (-not $SkipCuda -and -not $DryRun) {
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# ── Step 1: Verify nvcc ──────────────────────────────────────────────────────
Write-Step "Step 1: Verify nvcc"
if (-not $DryRun) {
    $nvcc = & nvcc --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    [SKIP] nvcc still not found — cannot build flash-attn" -ForegroundColor Yellow
        Write-Host "    Install CUDA 12.4 Toolkit first, then re-run this script."
        exit 0
    }
    Write-Host "    [OK] $nvcc"
}

# ── Step 2: Reinstall PyTorch stable cu124 ───────────────────────────────────
Write-Step "Step 2: Reinstall PyTorch 2.4.1 (stable cu124)"
Write-Host "    Current nightly (cu128) will be replaced."
Write-Host "    This keeps all other packages intact."

Exec "& `"$VenvPip`" uninstall torch torchvision torchaudio -y"
Exec "& `"$VenvPip`" install torch==2.4.1+cu124 torchvision==0.19.1+cu124 torchaudio==2.4.1+cu124 --index-url https://download.pytorch.org/whl/cu124"

# Verify
Write-Step "Verifying PyTorch"
Exec "& `"$VenvPy`" -c `"import torch; assert torch.cuda.is_available(), 'CUDA not available!'; print('OK:', torch.__version__, '| CUDA:', torch.version.cuda)`""

# ── Step 3: Install flash-attn ────────────────────────────────────────────────
Write-Step "Step 3: Install flash-attn from source (~10-20 min compile)"
Write-Host "    Requires: nvcc 12.4, PyTorch 2.4.1+cu124"
Write-Host "    Uses --no-build-isolation to pick up installed torch headers"

$env:CUDA_HOME = (Get-Command nvcc -ErrorAction SilentlyContinue | Split-Path | Split-Path)
Write-Host "    CUDA_HOME = $env:CUDA_HOME"

Exec "& `"$VenvPip`" install flash-attn --no-build-isolation"

# ── Step 4: Update inference_service.py ──────────────────────────────────────
Write-Step "Step 4: Switch inference_service.py to flash_attention_2"

$svcPath = "C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune\inference_service.py"
if (-not $DryRun) {
    $content = Get-Content $svcPath -Raw
    if ($content -match 'attn_implementation="sdpa"') {
        $content = $content -replace 'attn_implementation="sdpa"', 'attn_implementation="flash_attention_2"'
        Set-Content $svcPath $content -NoNewline
        Write-Host "    [OK] Updated inference_service.py → flash_attention_2"
    } elseif ($content -match 'attn_implementation="flash_attention_2"') {
        Write-Host "    [OK] Already using flash_attention_2"
    } else {
        Write-Host "    [WARN] attn_implementation line not found — edit manually"
    }
} else {
    Write-Host "    [DRY-RUN] Would patch attn_implementation sdpa→flash_attention_2 in inference_service.py"
}

# ── Step 5: Quick benchmark ───────────────────────────────────────────────────
Write-Step "Step 5: Quick benchmark (3 samples to verify speed)"
if (-not $DryRun) {
    Write-Host "    Run this to measure speed improvement:"
}
Write-Host @"

    Set-Location 'C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune'
    & '$VenvPy' benchmark_bnb4bit_random.py --n-train 3 --n-db 0

    Expected: ~14s/image (was 21s) — if lower, flash_attn is working.
    If still 21s: restart the script to clear torch.compile cache.

"@

Write-Host "=== Flash Attention 2 installation complete ===" -ForegroundColor Green
Write-Host "Estimated speed: 21s → ~14s/image (+30%) at same 99% accuracy" -ForegroundColor Green
