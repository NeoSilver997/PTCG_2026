# PTCG Qwen-VL 宝可梦卡牌文本提取系统

基于 Qwen2.5-VL-7B 的宝可梦卡牌图像文本提取系统，使用 QLoRA 4-bit 量化微调技术。

**针对 RTX 5070 Ti 16GB VRAM 优化**

## 📋 目录

- [系统概述](#系统概述)
- [硬件要求](#硬件要求)
- [快速开始](#快速开始)
- [Phase 1: 数据准备](#phase-1-数据准备)
- [Phase 2: 环境设置](#phase-2-环境设置)
- [Phase 3: 模型微调](#phase-3-模型微调)
- [Phase 4: 模型评估](#phase-4-模型评估)
- [Phase 5: 服务部署](#phase-5-服务部署)
- [故障排除](#故障排除)

## 系统概述

### 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PTCG Card Extraction System                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌─────────────────────┐    │
│  │   Next.js    │───▶│   NestJS     │───▶│  Ollama (Primary)   │    │
│  │   Frontend   │    │   Backend    │    │  qwen3-vl:latest    │    │
│  │              │    │              │    │  CPU/GPU Inference  │    │
│  └──────────────┘    └─────┬────────┘    └─────────────────────┘    │
│                            │                                         │
│                            │             ┌─────────────────────┐    │
│                            ├────────────▶│  Fine-tuned Qwen-VL │    │
│                            │             │  QLoRA 4bit (HTTP)  │    │
│                            │             │  RTX 5070 Ti 16GB   │    │
│                            │             └─────────────────────┘    │
│                            │                                         │
│                            ▼                                         │
│                     ┌──────────────┐                                 │
│                     │  PostgreSQL  │                                 │
│                     │   Database   │                                 │
│                     └──────────────┘                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 支持的语言

- 🇯🇵 日语 (ja-JP)
- 🇭🇰 繁体中文 (zh-HK)
- 🇺🇸 英语 (en-US)

### 提取字段

| 字段 | 说明 | 准确率目标 |
|------|------|-----------|
| name | 卡牌名称 | >95% |
| hp | 生命值 | >95% |
| type/types | 属性 | >95% |
| abilities | 特性/能力 | >85% |
| attacks | 攻击 | >85% |
| rarity | 稀有度 | >90% |
| artist | 画师 | >85% |
| setCode | 系列代码 | >90% |
| cardNumber | 卡牌编号 | >90% |

## 硬件要求

### 最低配置

| 组件 | 要求 |
|------|------|
| **GPU** | NVIDIA RTX 3090 (24GB) |
| **VRAM** | 24GB |
| **RAM** | 32GB |
| **存储** | 50GB 可用空间 |

### 推荐配置 (本项目优化目标)

| 组件 | 要求 |
|------|------|
| **GPU** | NVIDIA RTX 5070 Ti (16GB) |
| **VRAM** | 16GB GDDR7 |
| **RAM** | 64GB |
| **存储** | 100GB SSD |

### 云端替代方案

| 平台 | 实例 | 价格 |
|------|------|------|
| RunPod | RTX 4090 | $0.69/小时 |
| Lambda Labs | RTX A6000 | $0.80/小时 |
| Vast.ai | RTX 3090 | $0.25/小时 |

## 📊 基准测试结果汇总

### 阶段一：单模型基本测试（5 张本地卡牌）

在微调之前，我们对所有本地 Ollama 视觉模型做了基准测试，用 5 张真实卡牌图片（含 zh-HK、ja-JP 三个系列）验证 JSON 提取成功率。

| 模型 | 大小 | 成功率 | 平均时间/张 | 推荐 |
|------|------|--------|------------|------|
| `qwen3-vl:latest` | 6.1 GB | **5/5 (100%)** | 6.6s | ✅ 首选，提取最准确 |
| `llava:13b` | 8.0 GB | **5/5 (100%)** | 2.1s | ✅ 更快，但名称有时幻觉 |
| `llama3.2-vision:latest` | 7.8 GB | 2/5 (40%) | 24.5s | ⚠️ JP 古典卡牌超时 |
| `glm-ocr:latest` | 2.2 GB | 2/5 (40%) | 1.2s | ⚠️ 纯 OCR，结构不完整 |
| `deepseek-ocr:latest` | 6.7 GB | 0/5 (0%) | 17.7s | ❌ 非 JSON 输出 |

### 阶段二：多 Prompt 对比测试（22 张 test_sample）

对 top 3 模型分别用 3 种 prompt 风格（双语、英文、详细步骤）进行 3×3×22 全面测试：

| 排名 | 模型 | Prompt 风格 | 成功率 | 平均时间 | 说明 |
|------|------|------------|--------|---------|------|
| ★1 | `llava:13b` | prompt_c_detailed | 22/22 (100%) | 0.8s | ⚠️ 常返回虚构名称 |
| 2 | `llava:13b` | prompt_a_mixed | 22/22 (100%) | 1.1s | ⚠️ 同上 |
| 3 | `qwen3-vl:latest` | prompt_a_mixed (双语) | 19/22 (86%) | 7.3s | ✅ 名称准确，推荐 |
| 4 | `glm-ocr:latest` | prompt_c_detailed | 18/22 (82%) | 1.9s | 适合 Stage 1 探测 |

**关键发现**：llava JSON 格式正确率 100%，但经常幻觉卡牌名称；qwen3-vl 慢但提取内容真实可信。

### 阶段三：三阶段流水线（22 张 test_sample，最终结果）

```
Stage 1: glm-ocr:latest  (8s)  → 探测卡牌数量、位置、名称/编号提示
Stage 2: qwen3-vl:latest (30s) → 主提取（带 Stage 1 提示和语言 hint）
Stage 3: llava:13b        (15s) → fallback（qwen3-vl 超时/占位符时）
Stage 4: glm-ocr:latest  (16s) → OCR detail fallback（Stage 3 仍失败时）
```

| 运行时间 | 总成功率 | qwen3-vl (主) | llava (fallback) | glm-ocr detail | 失败 |
|----------|---------|--------------|-----------------|----------------|------|
| 2026-03-07 | **20/22 (91%)** | 14 | 2 | 4 | 2 |

**各图片识别结果（最新运行）：**

| 图片 | 识别结果 | 模型 | 语言 |
|------|---------|------|------|
| `1772464858989_media.jpg` | Drakloak / 248/217 / ★ | qwen3-vl | en-US |
| `1772466303986_media.jpg` | **老大的指令** / 750/742 | qwen3-vl | zh-HK |
| `1772524883686_media.jpg` | Pikachu / 001/100 | llava | en-US |
| `1772545646419_media.jpg` | ❌ 失败（多卡图，模型误判1张） | — | — |
| `1772619740614_media.jpg` | 皮皮 / 001/100（实为 3 张同卡） | qwen3-vl | zh-HK |
| `1772629973487_media.jpg` | Iono / 254/193 / ★ | qwen3-vl | en-US |
| `1772629977858_media.jpg` | Iono / 124 | qwen3-vl | en-US |
| `1772632811566_media.jpg` | 吉雉雞ex（HK card） | glm-ocr detail | zh-HK |
| `1772668182692_media.jpg` | 白薔雅 / 120/102 / H | qwen3-vl | zh-HK |
| `1772815817120_media.jpg` | 夜巡靈 / 056/056 / AR | qwen3-vl | ja-JP |
| `1772816972248_media.jpg` | 超级喷火龙X / 223/193 / EX | qwen3-vl | zh-HK |
| `hk00014014.png` | 鬥子 / 166/086 / SR | qwen3-vl | zh-HK ✓hint |
| `hk00014015.png` | 風妖精ex / 167/086 | qwen3-vl | zh-HK ✓hint |
| `hk00014016.png` | 萊希拉姆ex | glm-ocr detail | zh-HK ✓hint |
| `hk00014017.png` | 凱路迪歐ex / 169/086 / EX | qwen3-vl | zh-HK ✓hint |
| `hk00014018.png` | 胖嘟嘟ex / 170/086 | qwen3-vl | zh-HK ✓hint |
| `hk00014098.png` | 泡沫栗鼠 / 077/086 / ★ | qwen3-vl | zh-HK ✓hint |
| `hk00014099.png` | 奇諾栗鼠 | glm-ocr detail | zh-HK ✓hint |
| `hk00014100.png` | 能量硬幣 / 079/086 / U | qwen3-vl | zh-HK ✓hint |
| `jpn47290.png` | ❌ 失败（三模型均超时/占位符） | — | ja-JP |
| `jpn47291.png` | ダイゴのダンパル | glm-ocr detail | ja-JP ✓hint |
| `jpn47295.png` | メタグラー / 001/260 / R | llava | ja-JP ✓hint |

**已知难点：**
- `1772545646419`：多张 SR 卡片叠放，glm-ocr 误判为 1 张，所有模型均失败
- 部分 ja-JP 老卡图片：qwen3-vl 思考链 + 30s 仍超时

### 运行基准测试 / 流水线

```powershell
cd scripts/qwen-vl-finetune

# 测试所有本地视觉模型（5 张本地卡牌图片）
.venv312\Scripts\python.exe benchmark_all_models.py

# 多模型 × 多 prompt 对比（22 张 test_sample）
.venv312\Scripts\python.exe benchmark_prompts.py

# 三阶段流水线（生成 HTML 报告，不覆盖旧结果）
.venv312\Scripts\python.exe pipeline_two_stage.py
# 报告位于 benchmarks/two_stage/report_YYYYMMDD_HHMMSS.html
```

> **注意**：Ollama 在 Windows 上使用 `127.0.0.1`，不使用 `localhost`（后者在 WSL 环境下解析为 `::1`）

---

## 🔧 可微调模型推荐

### 哪些模型可以用我们的卡牌 DB 微调？

以下已安装模型中，支持对视觉-语言任务进行 LoRA/QLoRA 微调（需 HuggingFace 权重，非 GGUF）：

| 模型 | HF 模型 ID | VRAM (4bit) | 微调难度 | 推荐度 | 说明 |
|------|-----------|------------|---------|-------|------|
| **Qwen2.5-VL-7B** | `Qwen/Qwen2.5-VL-7B-Instruct` | ~6GB | ⭐ 容易 | **✅ 首选** | 已有 finetune_qwen_vl.py，本项目主要目标 |
| **Qwen2-VL-7B** | `Qwen/Qwen2-VL-7B-Instruct` | ~6GB | ⭐ 容易 | ✅ 备选 | 与 2.5 相似，更成熟 |
| **LLaVA-1.6 (Mistral 7B)** | `llava-hf/llava-v1.6-mistral-7b-hf` | ~8GB | ⭐⭐ 中等 | ✅ 可行 | llava:13b 对应 HF 版本 |
| **Llama-3.2-Vision 11B** | `meta-llama/Llama-3.2-11B-Vision-Instruct` | ~8GB | ⭐⭐ 中等 | ✅ 可行 | 需 Meta 授权 |
| **GLM-4V-9B** | `THUDM/glm-4v-9b` | ~7GB | ⭐⭐ 中等 | ✅ 可行 | glm4 对应 HF 版本 |

> **Ollama GGUF 模型无法直接微调**，需要从 HuggingFace 下载 FP16/BF16 原始权重，用 QLoRA 训练后可再量化为 GGUF 回传 Ollama。

### 推荐优先顺序

```
1. Qwen2.5-VL-7B-Instruct  ← 本项目已配置 finetune_qwen_vl.py（优先）
2. Qwen2-VL-7B-Instruct    ← 同框架，swap model_id 即可
3. GLM-4V-9B               ← glm-ocr 底层模型，Stage 1 detect 可受益
4. LLaVA-1.6-Mistral-7B   ← llava:13b 对应版本，Stage 3 fallback 可受益
```

### 微调数据集概况（已就绪）

| 集合 | 样本数 | 语言分布 |
|------|--------|---------|
| train.jsonl | 1,437 | ja-JP / zh-HK / en-US |
| validation.jsonl | 176 | ja-JP / zh-HK / en-US |
| test.jsonl | 187 | ja-JP / zh-HK / en-US |
| **合计** | **1,800** | 三语言均衡 |

### 快速启动微调（Qwen2.5-VL）

```powershell
cd scripts/qwen-vl-finetune
# 确保 .venv312 已激活（Python 3.12 + PyTorch nightly cu128）
.venv312\Scripts\python.exe finetune_qwen_vl.py `
  --data-dir ./datasets `
  --output-dir ./outputs `
  --epochs 3 `
  --batch-size 1 `
  --gradient-accumulation-steps 16 `
  --lora-r 16 `
  --lora-alpha 32
```

⚠️ **已知问题**：transformers 5.x 将 `AutoModelForVision2Seq` 改名为 `AutoModelForImageTextToText`，运行前请检查 `finetune_qwen_vl.py` 的导入。

---

## 🚀 Ollama 快速推理（无需微调）

如果只需要立即可用的卡牌提取功能，可先用 Ollama + qwen3-vl 作为基础后端，待微调完成后再切换到 fine-tuned 模型。

### 安装 Ollama 模型

```powershell
# 安装推荐模型
ollama pull qwen3-vl:latest

# 验证可用模型
ollama list
```

### 配置 NestJS API 使用 Ollama

在 `apps/api/.env` 中添加：

```env
# Ollama 后端（优先于 Python HTTP 服务）
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3-vl:latest
```

启动后，`/api/cards/vl/health` 会返回：
```json
{
  "status": "ok",
  "backend": "ollama:qwen3-vl:latest",
  "ollamaAvailable": true
}
```

### 测试提取接口

```bash
# 上传图片提取
curl -X POST http://localhost:4000/api/cards/vl/extract \
  -F "image=@card.png" \
  -F "language=ja-JP"

# Base64 提取
curl -X POST http://localhost:4000/api/cards/vl/extract/base64 \
  -H "Content-Type: application/json" \
  -d '{"imageBase64":"...","language":"zh-HK"}'
```

---

## 快速开始

### 1. 安装依赖

```bash
cd scripts/qwen-vl-finetune

# Windows
install.bat

# Linux/Mac
pip install -r requirements.txt
```

### 2. 导出训练数据

```bash
python export_training_data.py \
    --samples 1800 \
    --preprocess-images \
    --output-dir ./datasets
```

### 3. 验证数据集

```bash
python validate_dataset.py \
    --dataset-dir ./datasets \
    --output-report ./datasets/validation_report.txt
```

### 4. 开始微调

```bash
python finetune_qwen_vl.py \
    --data-dir ./datasets \
    --output-dir ./outputs \
    --epochs 3 \
    --batch-size 1 \
    --gradient-accumulation-steps 16
```

### 5. 评估模型

```bash
python evaluate_qwen_vl.py \
    --model-path ./outputs/final \
    --test-data ./datasets/test.jsonl \
    --output-dir ./evaluations
```

## Phase 1: 数据准备

### 命令

```bash
python export_training_data.py --samples 1800 --preprocess-images
```

### 输出

```
datasets/
├── train.jsonl (1440 样本)
├── validation.jsonl (180 样本)
├── test.jsonl (180 样本)
├── dataset_info.json
└── preprocessed_images/
```

### 详细文档

[DATA_PREPARATION_GUIDE.md](DATA_PREPARATION_GUIDE.md)

## Phase 2: 环境设置

### 安装 PyTorch with CUDA 12.1

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### 安装其他依赖

```bash
pip install -r requirements.txt
```

### 验证安装

```bash
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"
python -c "import torch; print(f'GPU: {torch.cuda.get_device_name(0)}')"
```

### 详细文档

[SETUP_GUIDE_RTX_5070TI.md](SETUP_GUIDE_RTX_5070TI.md)

## Phase 3: 模型微调

### QLoRA 4-bit 配置（16GB VRAM 优化）

| 参数 | 值 | 说明 |
|------|-----|------|
| **量化** | 4-bit NF4 | 7B 模型 ~4GB |
| **LoRA r** | 16 | 低 rank 适配器 |
| **LoRA alpha** | 32 | alpha = 2r |
| **Batch size** | 1 | 16GB VRAM 安全值 |
| **Gradient accumulation** | 16 | 有效 batch=16 |
| **Max seq length** | 1024 | 减少显存 |
| **Gradient checkpointing** | ✓ | 节省 40% 显存 |

### 训练命令

```bash
python finetune_qwen_vl.py \
    --data-dir ./datasets \
    --output-dir ./outputs \
    --epochs 3 \
    --batch-size 1 \
    --gradient-accumulation-steps 16 \
    --lora-r 16 \
    --lora-alpha 32
```

### 训练时间（RTX 5070 Ti）

| 样本数 | Epochs | 时间 |
|--------|--------|------|
| 1800 | 3 | ~6-8 小时 |
| 1800 | 5 | ~10-12 小时 |

### 显存使用

| 阶段 | 显存 |
|------|------|
| 模型加载 | ~4.5 GB |
| 训练峰值 | ~12-14 GB |

## Phase 4: 模型评估

### 运行评估

```bash
python evaluate_qwen_vl.py \
    --model-path ./outputs/final \
    --test-data ./datasets/test.jsonl
```

### 预期指标

| 指标 | 目标值 |
|------|--------|
| 完全匹配准确率 | >85% |
| 名称准确率 | >95% |
| HP 准确率 | >95% |
| 攻击准确率 | >85% |
| 平均推理时间 | <800ms |

## Phase 5: 服务部署

### 启动推理服务

```bash
python inference_service.py \
    --model-path ./outputs/final \
    --port 8000
```

### 启动 NestJS API

```bash
cd apps/api
pnpm run start:dev
```

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/cards/vl/extract` | POST | 图像上传提取 |
| `/api/cards/vl/extract/base64` | POST | Base64 提取 |
| `/api/cards/vl/extract/batch` | POST | 批量提取 |
| `/api/cards/vl/health` | GET | 健康检查 |

### 示例请求

```bash
curl -X POST http://localhost:3000/api/cards/vl/extract \
  -F "image=@card.jpg" \
  -F "language=ja-JP"
```

## 故障排除

### CUDA Out of Memory

```bash
# 使用最保守的配置
python finetune_qwen_vl.py \
    --batch-size 1 \
    --gradient-accumulation-steps 32 \
    --max-seq-length 768 \
    --lora-r 8
```

### 训练速度过慢

```bash
# 安装 Flash Attention 2
pip install flash-attn --no-build-isolation

# 增加 batch size（如果显存允许）
python finetune_qwen_vl.py --batch-size 2
```

### 详细故障排除

[TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## 📚 详细文档

| 文档 | 说明 |
|------|------|
| [SETUP_GUIDE_RTX_5070TI.md](SETUP_GUIDE_RTX_5070TI.md) | 硬件配置和安装指南 |
| [DATA_PREPARATION_GUIDE.md](DATA_PREPARATION_GUIDE.md) | 数据准备完整指南 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 故障排除指南 |

## 📊 性能基准

### RTX 5070 Ti 16GB

| 任务 | 性能 |
|------|------|
| 训练 (1800 样本，3 epochs) | 6-8 小时 |
| 推理 (单张卡牌) | 500-800ms |
| 批量推理 (10 张) | ~300ms/张 |

### 显存优化效果

| 技术 | 显存节省 |
|------|----------|
| 4-bit QLoRA | ~70% |
| 图像预处理 (512x512) | ~50% |
| Gradient Checkpointing | ~40% |

## 🎯 最佳实践

### 数据准备

- ✅ 启用 `--preprocess-images` 缩小图像
- ✅ 确保语言平衡（各 500+ 样本）
- ✅ 验证数据集质量

### 训练配置

- ✅ 从保守配置开始（batch_size=1）
- ✅ 使用梯度累积补偿小 batch
- ✅ 频繁保存 checkpoint

### 推理优化

- ✅ 使用 4-bit 量化推理
- ✅ 批量处理多个请求
- ✅ 设置置信度阈值

## 📝 更新日志

### 2026-06 (当前)

- ✅ Ollama 后端集成（`qwen3-vl:latest` 主推理路径）
- ✅ 5 模型基准测试：qwen3-vl 100% / llava 100% / llama3.2-vision 40%
- ✅ NestJS `qwen-vl.service.ts` Ollama 路由（`extractViaOllama()`）
- ✅ `<think>` 输出剥离 + 多策略 JSON 解析
- ✅ `benchmark_all_models.py` 自动检测并测试所有本地视觉模型
- ✅ 1800 条训练样本导出（train 1437 / val 176 / test 187）
- ✅ Python 3.12 venv `.venv312`（PyTorch nightly cu128，sm_120 Blackwell）

### 2026-03-06

- ✅ 针对 RTX 5070 Ti 16GB 优化
- ✅ QLoRA 4-bit 量化支持
- ✅ 图像预处理（512x512）
- ✅ 内存优化数据加载
- ✅ 增强的数据验证

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
