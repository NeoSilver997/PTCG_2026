#!/usr/bin/env pwsh
# =============================================================================
# PTCG Card Reader — Docker One-Click Deploy
# Usage:  .\docker-deploy.ps1 [build|run|stop|logs|status]
# =============================================================================

param(
    [ValidateSet("build","run","stop","logs","status","rebuild","test")]
    [string]$Action = "run",
    [string]$AdapterPath = "C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune\outputs\qlora_v4\final",
    [int]$Port = 8000,
    [string]$ImageTag = "ptcg-card-reader:latest",
    [string]$ContainerName = "ptcg-card-reader"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Write-Step { param([string]$Msg) Write-Host "`n>>> $Msg" -ForegroundColor Cyan }
function Write-OK   { param([string]$Msg) Write-Host "    [OK] $Msg" -ForegroundColor Green }
function Write-ERR  { param([string]$Msg) Write-Host "    [!!] $Msg" -ForegroundColor Red }

# ── Prerequisite checks ──────────────────────────────────────────────────────
function Test-Prerequisites {
    Write-Step "Checking prerequisites"

    # Docker
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-ERR "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
        exit 1
    }
    Write-OK "Docker: $(docker --version)"

    # nvidia-container-toolkit
    $gpuOk = docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 `
             nvidia-smi --query-gpu=name --format=csv,noheader 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-ERR "nvidia-container-toolkit not working. Install: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html"
        exit 1
    }
    Write-OK "GPU in Docker: $($gpuOk.Trim())"

    # Adapter
    if (-not (Test-Path $AdapterPath)) {
        Write-ERR "Adapter not found: $AdapterPath"
        Write-ERR "Train qlora_v4 first, or set -AdapterPath to correct path."
        exit 1
    }
    $adapterFiles = Get-ChildItem $AdapterPath | Measure-Object | Select-Object -ExpandProperty Count
    Write-OK "Adapter ($adapterFiles files): $AdapterPath"
}

# ── Build ────────────────────────────────────────────────────────────────────
function Invoke-Build {
    Write-Step "Building Docker image → $ImageTag"
    docker build `
        --file Dockerfile.production `
        --tag $ImageTag `
        --progress plain `
        .
    if ($LASTEXITCODE -ne 0) { Write-ERR "Build failed"; exit 1 }
    Write-OK "Image built: $ImageTag"
}

# ── Run ──────────────────────────────────────────────────────────────────────
function Invoke-Run {
    # Stop existing container if running
    $existing = docker ps -q --filter "name=$ContainerName" 2>$null
    if ($existing) {
        Write-Step "Stopping existing container"
        docker stop $ContainerName | Out-Null
        docker rm   $ContainerName | Out-Null
    }

    Write-Step "Starting container: $ContainerName"
    Write-Host "    Adapter: $AdapterPath"
    Write-Host "    Port:    $Port"

    # Convert Windows path to Docker-compatible path
    $adapterMount = $AdapterPath.Replace("\", "/")

    docker run -d `
        --gpus all `
        --name $ContainerName `
        --restart unless-stopped `
        -p "${Port}:8000" `
        -v "${adapterMount}:/adapter:ro" `
        -e ADAPTER_PATH=/adapter `
        -e TORCH_COMPILE=0 `
        --shm-size=2g `
        $ImageTag

    if ($LASTEXITCODE -ne 0) { Write-ERR "Container failed to start"; exit 1 }

    Write-Step "Waiting for service to be ready (model load ~60s)..."
    $ready = $false
    for ($i = 0; $i -lt 24; $i++) {
        Start-Sleep 5
        try {
            $resp = Invoke-RestMethod "http://localhost:$Port/health" -TimeoutSec 3 -ErrorAction Stop
            if ($resp.status -eq "healthy") { $ready = $true; break }
        } catch {}
        Write-Host "    Waiting... ($([int]($i*5+5))s)" -NoNewline
        Write-Host ""
    }

    if ($ready) {
        Write-OK "Service ready at http://localhost:$Port"
        Write-Host ""
        Write-Host "  API Docs:   http://localhost:$Port/docs" -ForegroundColor Yellow
        Write-Host "  Health:     http://localhost:$Port/health" -ForegroundColor Yellow
        Write-Host "  Extract:    POST http://localhost:$Port/api/cards/extract-from-image" -ForegroundColor Yellow
    } else {
        Write-ERR "Service did not respond in 120s. Check logs: .\docker-deploy.ps1 logs"
    }
}

# ── Stop ─────────────────────────────────────────────────────────────────────
function Invoke-Stop {
    Write-Step "Stopping $ContainerName"
    docker stop $ContainerName 2>$null | Out-Null
    docker rm   $ContainerName 2>$null | Out-Null
    Write-OK "Stopped"
}

# ── Logs ─────────────────────────────────────────────────────────────────────
function Invoke-Logs {
    docker logs --tail 50 -f $ContainerName
}

# ── Status ───────────────────────────────────────────────────────────────────
function Invoke-Status {
    Write-Step "Container status"
    docker ps --filter "name=$ContainerName" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

    Write-Step "Health check"
    try {
        $h = Invoke-RestMethod "http://localhost:$Port/health" -TimeoutSec 5
        Write-OK "Service healthy: $($h | ConvertTo-Json -Compress)"
    } catch {
        Write-ERR "Service not responding on port $Port"
    }

    Write-Step "GPU usage"
    docker exec $ContainerName nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu `
        --format=csv,noheader,nounits 2>$null | ForEach-Object {
        $parts = $_ -split ','
        Write-Host "    GPU: $($parts[0].Trim())  VRAM: $($parts[1].Trim())/$($parts[2].Trim()) MiB  Load: $($parts[3].Trim())%"
    }
}

# ── Quick API test ────────────────────────────────────────────────────────────
function Invoke-Test {
    Write-Step "Quick API test"
    $testImg = Get-ChildItem "$AdapterPath\..\..\..\image_cache" -Filter "*.jpg" -ErrorAction SilentlyContinue |
               Select-Object -First 1

    if (-not $testImg) {
        Write-ERR "No test image found in image_cache. Place a .jpg there or test manually."
        return
    }

    Write-Host "    Using: $($testImg.Name)"
    $resp = curl.exe -s -X POST "http://localhost:$Port/api/cards/extract-from-image" `
                -F "image=@$($testImg.FullName)" | ConvertFrom-Json

    if ($resp.success) {
        Write-OK "Extraction succeeded!"
        Write-Host "    Name:       $($resp.data.name)"
        Write-Host "    HP:         $($resp.data.hp)"
        Write-Host "    Types:      $($resp.data.types -join ', ')"
        Write-Host "    Confidence: $([math]::Round($resp.confidence, 3))"
        Write-Host "    Time:       $([math]::Round($resp.inference_time_ms))ms"
    } else {
        Write-ERR "Extraction failed: $($resp.error)"
    }
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
switch ($Action) {
    "build"   { Test-Prerequisites; Invoke-Build }
    "run"     { Test-Prerequisites; Invoke-Run }
    "rebuild" { Test-Prerequisites; Invoke-Build; Invoke-Run }
    "stop"    { Invoke-Stop }
    "logs"    { Invoke-Logs }
    "status"  { Invoke-Status }
    "test"    { Invoke-Test }
}
