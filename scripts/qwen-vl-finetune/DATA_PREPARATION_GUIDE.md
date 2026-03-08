# PTCG Qwen-VL 数据准备完整指南

## 📋 概述

数据准备流程包含以下步骤：
1. 从数据库导出卡牌数据
2. 图像预处理（缩放到 512x512）
3. 转换为 Qwen-VL 训练格式
4. 分割为训练/验证/测试集
5. 验证数据质量

> **当前状态**：已完成初次训练（1800 样本，1 轮）。如果需要增加更多卡牌重新训练，请直接跳到 [➕ 扩展训练数据（添加更多卡牌）](#-扩展训练数据添加更多卡牌) 章节。

## 🚀 快速开始

### 基础命令

```bash
cd scripts/qwen-vl-finetune

# 导出 1800 张卡牌（推荐配置）
python export_training_data.py \
    --samples 1800 \
    --output-dir ./datasets \
    --preprocess-images \
    --data-dir ../../data
```

### 完整流程

```bash
# 1. 导出数据
python export_training_data.py --samples 1800 --preprocess-images

# 2. 验证数据集
python validate_dataset.py --dataset-dir ./datasets

# 3. 查看数据集信息
cat ./datasets/dataset_info.json
```

## 📖 参数详解

### export_training_data.py

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--output-dir` | `./datasets` | 输出目录 |
| `--samples` | `1800` | 目标样本数量 |
| `--skip-db` | `False` | 跳过数据库查询 |
| `--preprocess-images` | `False` | 预处理图像（推荐启用） |
| `--data-dir` | `../data` | 数据目录（包含卡牌图像） |

### validate_dataset.py

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--dataset-dir` | `./datasets` | 数据集目录 |
| `--output-report` | `None` | 输出报告路径 |

## 📊 数据格式

### 输出文件结构

```
datasets/
├── train.jsonl              # 训练集（80%）
├── validation.jsonl         # 验证集（10%）
├── test.jsonl               # 测试集（10%）
├── dataset_info.json        # 数据集信息
├── validation_report.txt    # 验证报告
└── preprocessed_images/     # 预处理后的图像（如果启用）
```

### JSONL 格式示例

```jsonl
{"messages":[{"role":"user","content":[{"type":"image","image":"path/to/card.jpg"},{"type":"text","text":"Extract all card information..."}]},{"role":"assistant","content":[{"type":"text","text":"{\"name\": \"リザードン\", \"hp\": 150, ...}"}]}],"metadata":{"webCardId":"sv1a-001","language":"ja-JP","complexity":"medium"}}
```

### 数据集信息 (dataset_info.json)

```json
{
  "total_samples": 1800,
  "train_samples": 1440,
  "val_samples": 180,
  "test_samples": 180,
  "language_distribution": {
    "ja-JP": {"simple": 200, "medium": 250, "complex": 150},
    "zh-HK": {"simple": 190, "medium": 240, "complex": 140},
    "en-US": {"simple": 180, "medium": 230, "complex": 130}
  },
  "split_ratios": [0.8, 0.1, 0.1],
  "created_at": "2024-01-01T10:00:00",
  "image_config": {
    "max_size": 512,
    "quality": 95,
    "format": "JPEG"
  }
}
```

## 🎯 采样策略

### 语言平衡

脚本会自动平衡三种语言的样本数量：

- **ja-JP (日语)**: 500-700 张
- **zh-HK (繁体中文)**: 500-700 张
- **en-US (英语)**: 500-700 张

### 复杂度平衡

按复杂度分层采样，确保训练集多样性：

| 复杂度 | 比例 | 说明 |
|--------|------|------|
| **simple** | 40% | 基础宝可梦，1-2 个攻击 |
| **medium** | 40% | 1 进化，1-2 个能力 |
| **complex** | 20% | 2 进化，2+ 能力，特殊机制 |

### 卡牌类型

优先采样宝可梦卡（POKEMON），如果数量不足则补充训练师卡（TRAINER）。

## 🖼️ 图像预处理

### 预处理选项

```bash
# 启用预处理（推荐）
python export_training_data.py --preprocess-images

# 自定义预处理配置
# 修改 export_training_data.py 中的 IMAGE_CONFIG
IMAGE_CONFIG = {
    "max_size": 512,      # 最大边长
    "quality": 95,        # JPEG 质量
    "format": "JPEG"      # 输出格式
}
```

### 预处理效果

| 原始尺寸 | 预处理后 | 显存节省 |
|----------|----------|----------|
| 1024x1024 | 512x512 | ~75% |
| 2048x2048 | 512x512 | ~94% |

### 预处理图像位置

```
datasets/
└── preprocessed_images/
    ├── preprocessed_sv1a-001.jpg
    ├── preprocessed_sv1a-002.jpg
    └── ...
```

## 📈 数据验证

### 验证内容

`validate_dataset.py` 会检查：

1. ✅ JSON 格式有效性
2. ✅ 必需字段存在性
3. ✅ 图像文件可访问性
4. ✅ 重复卡牌检测
5. ✅ 语言分布平衡
6. ✅ 复杂度分布平衡

### 验证报告示例

```
============================================================
PTCG 数据集验证报告
============================================================

📊 总体统计:
  总样本数：1800
  训练集：1440 样本
  验证集：180 样本
  测试集：180 样本

🌍 语言分布:
  train:
    ja-JP: 480
    zh-HK: 480
    en-US: 480
  validation:
    ja-JP: 60
    zh-HK: 60
    en-US: 60
  test:
    ja-JP: 60
    zh-HK: 60
    en-US: 60

📈 复杂度分布:
  train:
    simple: 576
    medium: 576
    complex: 288

⚠️  数据质量:
  缺失图像：0
  无效 JSON: 0
  重复卡牌：0

✅ 验证结论:
  ✅ 验证通过，数据集质量良好
```

## 🔧 常见问题

### 问题 1: 数据库连接失败

**错误:**
```
✗ 数据库连接失败：connection refused
```

**解决:**
```bash
# 检查 DATABASE_URL 环境变量
echo $DATABASE_URL  # Linux/Mac
echo %DATABASE_URL%  # Windows

# 或使用 --skip-db 模式
python export_training_data.py --skip-db
```

### 问题 2: 图像文件不存在

**警告:**
```
⚠ 图像不存在：path/to/card.jpg
```

**解决:**
```bash
# 检查数据目录
ls ../../data/cards/*.jpg  # Linux/Mac
dir ..\..\data\cards\*.jpg  # Windows

# 或跳过图像检查
python export_training_data.py --skip-db
```

### 问题 3: 样本数量不足

**警告:**
```
⚠ 样本数不足 (1200 < 1500)
```

**解决:**
```bash
# 增加查询限制
# 修改 export_training_data.py 中的 limit 参数
limit=samples_per_language + 500  # 增加缓冲

# 或降低目标样本数
python export_training_data.py --samples 1200
```

## 📝 最佳实践

### 1. 数据导出

```bash
# 推荐配置
python export_training_data.py \
    --samples 1800 \
    --preprocess-images \
    --data-dir ../../data
```

### 2. 数据验证

```bash
# 每次导出后验证
python validate_dataset.py \
    --dataset-dir ./datasets \
    --output-report ./datasets/validation_report.txt
```

### 3. 数据检查

```bash
# 查看数据集信息
cat ./datasets/dataset_info.json | python -m json.tool

# 统计各语言样本数
python -c "
import json
with open('./datasets/dataset_info.json') as f:
    info = json.load(f)
print(f'总样本：{info[\"total_samples\"]}')
for lang, dist in info['language_distribution'].items():
    total = sum(dist.values())
    print(f'{lang}: {total}')
"
```

### 4. 数据备份

```bash
# 备份数据集
cp -r ./datasets ./datasets_backup_$(date +%Y%m%d)

# 或压缩
tar -czf datasets_$(date +%Y%m%d).tar.gz ./datasets
```

## 🎯 下一步

数据准备完成后，可以开始微调：

```bash
# 开始微调
python finetune_qwen_vl.py \
    --data-dir ./datasets \
    --output-dir ./outputs \
    --epochs 3
```

## ➕ 扩展训练数据（添加更多卡牌）

当数据库中导入了新系列卡牌，或需要提升模型对特定语言/稀有度的识别准确率时，可按以下步骤增加训练数据。

### 当前数据状态

```powershell
# 查看当前数据集大小
Get-Content .\datasets\dataset_info.json | ConvertFrom-Json | `
    Select-Object total_samples, train_samples, val_samples, test_samples
```

当前：**1800 样本**（train 1437 / val 176 / test 187）

### 决定目标样本数

| 数据库卡牌数量 | 推荐 --samples | 效果提升 |
|--------------|---------------|--------|
| 2000-4000 张 | **3000** | +中等，覆盖更多系列 |
| 4000-8000 张 | **5000** | +显著，跨系列泛化 |
| > 8000 张 | **8000** | +大幅，接近饱和 |

### 导出新训练集

```powershell
cd scripts/qwen-vl-finetune

# 备份旧数据集（可选）
Copy-Item -Recurse .\datasets .\datasets_backup_1800

# 导出更多样本（以 3000 为例）
.venv312\Scripts\python.exe export_training_data.py `
    --samples 3000 `
    --preprocess-images `
    --output-dir ./datasets
```

**常见问题**：若某语言图像数量不足，脚本会输出警告并用其他类型卡牌补充。
可以先检查各语言状态：

```powershell
# 按语言统计数据库中有图像的卡牌数量（需 DATABASE_URL 已设置）
.venv312\Scripts\python.exe -c "
import os, psycopg2
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
cur.execute(\"\"\"
    SELECT language, COUNT(*) FROM cards
    WHERE image_url IS NOT NULL
    GROUP BY language ORDER BY language
\"\"\")
for row in cur.fetchall():
    print(f'{row[0]}: {row[1]}')
conn.close()
"
```

### 下载缺失的图像（如有需要）

```powershell
# 为新导入的卡牌下载图像
.venv312\Scripts\python.exe download_training_images.py `
    --dataset-dir ./datasets `
    --output-dir ./image_cache

# 若只需补充特定系列
.venv312\Scripts\python.exe download_training_images.py `
    --expansion SV9 `
    --output-dir ./image_cache
```

### 验证扩展后的数据集

```powershell
.venv312\Scripts\python.exe validate_dataset.py `
    --dataset-dir ./datasets `
    --output-report ./datasets/validation_report.txt

# 确认样本数增加
Get-Content .\datasets\dataset_info.json | ConvertFrom-Json | `
    Select-Object total_samples, train_samples
```

### 选择训练策略

**策略 A（推荐）：重新完整训练**
- 适合：数据增加了 50% 以上，或新增了全新语言区域
- 优点：避免遗忘旧数据，收敛更稳定

```powershell
Copy-Item -Recurse .\outputs\qlora_v1 .\outputs\qlora_v1_backup
.venv312\Scripts\python.exe finetune_qwen_vl.py `
    --data-dir ./datasets `
    --output-dir ./outputs/qlora_v2 `
    --epochs 3 `
    --batch-size 1 `
    --gradient-accumulation-steps 16 `
    --lora-r 16 `
    --lora-alpha 32
```

**策略 B：从检查点继续训练**
- 适合：仅增加了 10-30% 样本，希望快速迭代

```powershell
# 找到最后一个 checkpoint
Get-ChildItem .\outputs\qlora_v1\checkpoint-* | Sort-Object Name | Select-Object -Last 1

.venv312\Scripts\python.exe finetune_qwen_vl.py `
    --data-dir ./datasets `
    --output-dir ./outputs/qlora_v1 `
    --resume-from-checkpoint ./outputs/qlora_v1/checkpoint-last `
    --epochs 2 `
    --batch-size 1 `
    --gradient-accumulation-steps 16
```

### 重新合并与部署

训练完成后，重新合并 LoRA 并导出 GGUF：

```powershell
# 合并 LoRA + 导出 GGUF（Q4_K_M）
.venv312\Scripts\python.exe merge_and_export.py

# 重启 llama-server（使用新 GGUF）
.\llama.cpp\build_server\bin\llama-server.exe `
    --model .\outputs\qlora_v1\gguf\ptcg-card-reader-Q4_K_M.gguf `
    --mmproj .\outputs\qlora_v1\gguf\mmproj-ptcg-f16.gguf `
    --port 8080 --host 0.0.0.0 -ngl 99

# 验证新模型
.venv312\Scripts\python.exe use_finetuned_model.py `
    --backend llama-server `
    --image "path/to/test_card.jpg"
```

完整的部署步骤参见 [README.md Phase 6](README.md#phase-6-扩展训练数据添加更多卡牌)。

## 📚 相关文档

- [SETUP_GUIDE_RTX_5070TI.md](SETUP_GUIDE_RTX_5070TI.md) - 硬件配置指南
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - 故障排除
- [README.md](README.md) - 项目总览
