#!/bin/bash
# WSL Inference Service Launcher with Flash Attention 2
export PATH=/usr/local/cuda-12.6/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export CUDA_HOME=/usr/local/cuda-12.6

VENV=/home/silver/ptcg_venv
SERVICE_DIR=/mnt/c/AI_Server/Coding/PTCG_2026/scripts/qwen-vl-finetune

echo "Starting WSL Flash-Attn inference service on port 8001..."
echo "Flash attention 2 enabled"
cd $SERVICE_DIR

exec $VENV/bin/python inference_service.py \
    --adapter outputs/qlora_v4/final \
    --port 8001 \
    --no-compile \
    --flash-attn 2>&1
