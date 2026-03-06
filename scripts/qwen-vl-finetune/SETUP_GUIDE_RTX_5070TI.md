# PTCG Qwen-VL 微调指南 - RTX 5070 Ti 16GB 优化版

## 📋 硬件配置

| 组件 | 规格 |
|------|------|
| **GPU** | NVIDIA RTX 5070 Ti |
| **VRAM** | 16GB GDDR7 |
| **CUDA Cores** | 8,960 |
| **架构** | NVIDIA Blackwell |
| **系统 RAM** | 64GB |
| **CUDA 版本** | 12.1+ |

## 🎯 优化策略

针对 16GB VRAM 的内存优化配置：

| 技术 | 显存节省 | 说明 |
|------|----------|------|
| **4-bit QLoRA** | ~70% | 7B 模型从 28GB 降至~4GB |
| **LoRA** | ~90% | 仅训练 0.1% 参数 |
| **Gradient Checkpointing** | ~40% | 用计算换内存 |
| **图像预处理** | ~50% | 512x512 替代原始尺寸 |
| **小 Batch Size** | 可变 | batch_size=1 |
| **梯度累积** | - | 补偿小 batch 的梯度更新 |

## 📦 安装步骤

### 1. 创建虚拟环境（推荐）

```bash
# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Linux/Mac
python3 -m venv .venv
source .venv/bin/activate
```

### 2. 安装 PyTorch with CUDA 12.1

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### 3. 安装其他依赖

```bash
pip install -r requirements.txt
```

### 4. （可选）安装 Flash Attention 2

RTX 5070 Ti 支持 Flash Attention 2，可加速训练 30-50%：

```bash
pip install flash-attn --no-build-isolation
```

### 5. 验证安装

```bash
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"
python -c "import torch; print(f'GPU: {torch.cuda.get_device_name(0)}')"
```

## 🚀 快速开始

### Phase 1: 数据准备

```bash
cd scripts/qwen-vl-finetune

# 导出 1800 张卡牌（启用图像预处理）
python export_training_data.py \
    --samples 1800 \
    --output-dir ./datasets \
    --preprocess-images \
    --data-dir ../../data
```

**参数说明:**
- `--preprocess-images`: 将图像缩放到 512x512，减少显存占用
- `--data-dir`: 卡牌图像目录

### Phase 2: 验证数据集

```bash
python validate_dataset.py \
    --dataset-dir ./datasets \
    --output-report ./datasets/validation_report.txt
```

### Phase 3: 启动训练

```bash
# 基础配置（batch_size=1, 最安全）
python finetune_qwen_vl.py \
    --data-dir ./datasets \
    --output-dir ./outputs \
    --epochs 3 \
    --batch-size 1 \
    --gradient-accumulation-steps 16

# 如果显存有富余，可以尝试 batch_size=2
python finetune_qwen_vl.py \
    --data-dir ./datasets \
    --output-dir ./outputs \
    --epochs 3 \
    --batch-size 2 \
    --gradient-accumulation-steps 8
```

### Phase 4: 监控训练

```bash
# 启动 TensorBoard
tensorboard --logdir ./outputs/runs

# 查看训练日志
tail -f training.log
```

### Phase 5: 评估模型

```bash
python evaluate_qwen_vl.py \
    --model-path ./outputs/final \
    --test-data ./datasets/test.jsonl \
    --output-dir ./evaluations
```

## ⚙️ 配置调优

### 显存不足 (OOM) 时

```bash
# 方案 1: 减小序列长度
python finetune_qwen_vl.py --max-seq-length 768

# 方案 2: 减小 LoRA rank
python finetune_qwen_vl.py --lora-r 8 --lora-alpha 16

# 方案 3: 减小 batch size（已经是最小值 1）

# 方案 4: 关闭 Flash Attention（如果启用）
# 修改 finetune_qwen_vl.py，设置 attn_implementation=None
```

### 训练速度过慢时

```bash
# 方案 1: 确保 Flash Attention 2 已安装
pip install flash-attn --no-build-isolation

# 方案 2: 增加 batch size（如果有足够显存）
python finetune_qwen_vl.py --batch-size 2

# 方案 3: 减少梯度累积步数
python finetune_qwen_vl.py --gradient-accumulation-steps 8

# 方案 4: 增加数据加载 worker
python finetune_qwen_vl.py --dataloader-workers 4
```

### 提高模型质量

```bash
# 方案 1: 增加训练轮数
python finetune_qwen_vl.py --epochs 5

# 方案 2: 增加 LoRA rank
python finetune_qwen_vl.py --lora-r 32 --lora-alpha 64

# 方案 3: 增加样本数
python export_training_data.py --samples 2500

# 方案 4: 调整学习率
python finetune_qwen_vl.py --learning-rate 1e-4
```

## 📊 预期性能

### 训练时间（RTX 5070 Ti 16GB）

| 配置 | 时间 |
|------|------|
| 1800 样本，3 epochs | ~6-8 小时 |
| 1800 样本，5 epochs | ~10-12 小时 |

### 显存使用

| 阶段 | 显存占用 |
|------|----------|
| 模型加载 | ~4.5 GB |
| 训练峰值 | ~12-14 GB |
| 推理 | ~6-8 GB |

### 推理性能

| 指标 | 值 |
|------|-----|
| 单张延迟 | ~500-800ms |
| 批量处理 | ~300ms/张 |

## 🔍 故障排除

### 问题 1: CUDA Out of Memory

**错误:**
```
torch.cuda.OutOfMemoryError: CUDA out of memory.
```

**解决:**
```bash
# 使用最保守的配置
python finetune_qwen_vl.py \
    --batch-size 1 \
    --gradient-accumulation-steps 32 \
    --max-seq-length 768 \
    --lora-r 8
```

### 问题 2: 图像加载失败

**错误:**
```
FileNotFoundError: [Errno 2] No such file or directory
```

**解决:**
```bash
# 检查图像路径
python -c "
import os
from pathlib import Path

data_dir = Path('../../data/cards')
if data_dir.exists():
    print(f'图像目录存在：{data_dir}')
    print(f'图像数量：{len(list(data_dir.glob(\"*.jpg\")))}')
else:
    print('图像目录不存在')
"
```

### 问题 3: 模型下载失败

**错误:**
```
OSError: Can't load the configuration of ...
```

**解决:**
```bash
# 手动下载模型
python -c "
from transformers import AutoModelForVision2Seq, AutoProcessor

model = AutoModelForVision2Seq.from_pretrained('Qwen/Qwen2.5-VL-7B-Instruct')
processor = AutoProcessor.from_pretrained('Qwen/Qwen2.5-VL-7B-Instruct')
"

# 或使用镜像
export HF_ENDPOINT=https://hf-mirror.com
```

## 📈 训练监控

### 关键指标

在 TensorBoard 中监控以下指标：

1. **train/loss**: 训练损失（应逐渐下降）
2. **eval/loss**: 验证损失（不应大幅上升）
3. **train/grad_norm**: 梯度范数（应 < 1.0）
4. **train/learning_rate**: 学习率（按调度器变化）
5. **train/epoch**: 当前训练轮数

### 显存监控

```bash
# 实时监控显存
watch -n 1 nvidia-smi

# 或使用 Python 脚本
python -c "
import torch
import time

for i in range(10):
    allocated = torch.cuda.memory_allocated(0) / 1e9
    reserved = torch.cuda.memory_reserved(0) / 1e9
    print(f'Allocated: {allocated:.2f} GB, Reserved: {reserved:.2f} GB')
    time.sleep(1)
"
```

## 🎯 最佳实践

### 1. 数据准备

- ✅ 使用 `--preprocess-images` 缩小图像
- ✅ 确保语言平衡（各 500+ 样本）
- ✅ 包含不同复杂度的卡牌

### 2. 训练配置

- ✅ 从保守配置开始（batch_size=1）
- ✅ 使用梯度累积补偿小 batch
- ✅ 启用 gradient checkpointing

### 3. 模型保存

- ✅ 频繁保存 checkpoint（每 100 步）
- ✅ 保留最后 3 个 checkpoint
- ✅ 保存训练指标

### 4. 推理优化

- ✅ 使用 4-bit 量化推理
- ✅ 批量处理多个请求
- ✅ 启用 CUDA Graph（如果支持）

## 📝 训练日志示例

```
2024-01-01 10:00:00 - INFO - 检测到 GPU: NVIDIA GeForce RTX 5070 Ti (16.0 GB)
2024-01-01 10:00:01 - INFO - ✓ NVIDIA Blackwell 架构检测到，启用优化
2024-01-01 10:00:05 - INFO - 加载模型：Qwen/Qwen2.5-VL-7B-Instruct
2024-01-01 10:00:30 - INFO - 可训练参数：12,582,912 / 7,642,509,312 (0.16%)
2024-01-01 10:00:31 - INFO - 当前显存使用：4.52 GB (分配), 5.10 GB (保留)
2024-01-01 10:00:35 - INFO - 开始训练...
2024-01-01 10:00:35 - INFO - 训练样本：1440
2024-01-01 10:00:35 - INFO - Batch size: 1
2024-01-01 10:00:35 - INFO - 梯度累积：16 步
2024-01-01 10:05:00 - INFO - Step 100/270, loss=0.823, lr=1.8e-4
2024-01-01 10:10:00 - INFO - Step 200/270, loss=0.654, lr=1.5e-4
...
2024-01-01 18:00:00 - INFO - 训练完成！
```

## 📚 参考资料

- [Qwen2.5-VL 文档](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct)
- [QLoRA 论文](https://arxiv.org/abs/2305.14314)
- [Unsloth GitHub](https://github.com/unslothai/unsloth)
- [Flash Attention 2](https://github.com/Dao-AILab/flash-attention)
