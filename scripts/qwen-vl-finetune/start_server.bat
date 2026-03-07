@echo off
:: Launch llama-server with Vulkan GPU support for PTCG vision inference
:: Pre-built from: https://github.com/ggml-org/llama.cpp/releases/tag/b8224
:: RTX 5070 Ti via Vulkan 1.4 - ~5s per card (vs 165s CPU)
::
:: Speed: CPU 165s/card -> Vulkan GPU 5s/card at 140+ t/s

set "BASE=C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune"
set "SERVER=%BASE%\llama-prebuilt\llama-server.exe"
set "MODEL=%BASE%\outputs\qlora_v1\gguf\ptcg-card-reader-Q4_K_M.gguf"
set "MMPROJ=%BASE%\outputs\qlora_v1\gguf\mmproj-ptcg-f16.gguf"

echo Starting PTCG Card Reader Vision Server (Vulkan GPU)...
echo Model:  %MODEL%
echo Mmproj: %MMPROJ%
echo URL:    http://localhost:8080

"%SERVER%" ^
  --model "%MODEL%" ^
  --mmproj "%MMPROJ%" ^
  --host 0.0.0.0 ^
  --port 8080 ^
  --ctx-size 3500 ^
  --parallel 1 ^
  --n-gpu-layers 99 ^
  --chat-template chatml