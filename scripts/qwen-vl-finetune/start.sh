#!/bin/bash
# PTCG Qwen-VL 快速启动脚本
# 用于一键启动推理服务和 NestJS API

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
API_DIR="$ROOT_DIR/apps/api"

echo "============================================================"
echo "PTCG Qwen-VL 快速启动"
echo "============================================================"

# 检查 Python 环境
echo ""
echo "检查 Python 环境..."
if ! command -v python &> /dev/null; then
    echo "错误：未找到 Python，请安装 Python 3.10+"
    exit 1
fi

PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
echo "✓ Python 版本：$PYTHON_VERSION"

# 检查 CUDA
echo ""
echo "检查 CUDA..."
if command -v nvidia-smi &> /dev/null; then
    GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits)
    echo "✓ GPU: $GPU_INFO"
else
    echo "⚠ 未检测到 NVIDIA GPU，将使用 CPU 模式（速度慢）"
fi

# 检查依赖
echo ""
echo "检查 Python 依赖..."
cd "$SCRIPT_DIR"
if ! python -c "import torch" 2>/dev/null; then
    echo "⚠ PyTorch 未安装，正在安装..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
fi

if ! python -c "import transformers" 2>/dev/null; then
    echo "⚠ transformers 未安装，正在安装..."
    pip install transformers datasets trl peft
fi

if ! python -c "import fastapi" 2>/dev/null; then
    echo "⚠ FastAPI 未安装，正在安装..."
    pip install fastapi uvicorn python-multipart pydantic
fi

echo "✓ Python 依赖检查完成"

# 检查模型
echo ""
echo "检查模型..."
MODEL_PATH="$SCRIPT_DIR/outputs/final"
if [ -d "$MODEL_PATH" ]; then
    echo "✓ 模型已存在：$MODEL_PATH"
else
    echo "⚠ 模型不存在，需要先进行训练"
    echo "   运行：python finetune_qwen_vl.py --data-dir ./datasets --output-dir ./outputs"
fi

# 启动推理服务
echo ""
echo "============================================================"
echo "启动推理服务..."
echo "============================================================"

cd "$SCRIPT_DIR"
python inference_service.py --model-path "$MODEL_PATH" --port 8000 &
INFERENCE_PID=$!

echo "推理服务已启动 (PID: $INFERENCE_PID)"

# 等待推理服务就绪
echo "等待推理服务就绪..."
sleep 5

for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "✓ 推理服务已就绪"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "⚠ 推理服务启动超时，继续启动 API..."
    fi
    sleep 1
done

# 启动 NestJS API
echo ""
echo "============================================================"
echo "启动 NestJS API..."
echo "============================================================"

cd "$API_DIR"

# 检查 Node.js 依赖
if [ ! -d "node_modules" ]; then
    echo "安装 Node.js 依赖..."
    pnpm install
fi

# 设置环境变量
export QWEN_VL_INFERENCE_URL=http://localhost:8000
export QWEN_VL_CONFIDENCE_THRESHOLD=0.7

# 启动 API
pnpm run start:dev &
API_PID=$!

echo "NestJS API 已启动 (PID: $API_PID)"

# 等待 API 就绪
echo "等待 API 就绪..."
sleep 10

echo ""
echo "============================================================"
echo "✅ 所有服务已启动!"
echo "============================================================"
echo ""
echo "服务地址:"
echo "  - 推理服务：http://localhost:8000"
echo "  - NestJS API: http://localhost:3000"
echo "  - Swagger 文档：http://localhost:3000/api/docs"
echo ""
echo "API 端点:"
echo "  - POST /api/cards/vl/extract - 从图像提取卡牌信息"
echo "  - GET  /api/cards/vl/health - 健康检查"
echo ""
echo "停止服务:"
echo "  kill $INFERENCE_PID $API_PID"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo "============================================================"

# 等待用户中断
wait
