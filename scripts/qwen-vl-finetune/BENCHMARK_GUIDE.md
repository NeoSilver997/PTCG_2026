# PTCG Qwen-VL 基准测试指南

## 📋 概述

本指南介绍如何测试 Qwen-VL 模型在 50 张中文卡牌上的推理速度和识别准确率。

## 🎯 测试目标

1. **推理速度测试**: 测量单张卡牌的平均推理时间
2. **识别准确率**: 评估各字段（名称、HP、攻击等）的识别准确率
3. **模型对比**: 比较基础模型和微调模型的差异
4. **性能分析**: 生成详细的性能分析报告

## 🚀 快速开始

### Windows 用户

```batch
cd scripts\qwen-vl-finetune

REM 一键运行 50 张卡牌测试
run_50_cards_test.bat
```

### 手动运行

```bash
# 1. 基准测试
python benchmark_test.py \
    --model-path ./outputs/final \
    --samples 50 \
    --language zh-HK

# 2. 结果分析
python analyze_results.py --benchmark-dir ./benchmarks

# 3. 模型对比（可选）
python model_comparison.py \
    --base-model Qwen/Qwen2.5-VL-7B-Instruct \
    --finetuned-model ./outputs/final \
    --samples 50
```

## 📖 测试脚本详解

### 1. benchmark_test.py - 基准测试

**功能:**
- 测试指定数量卡牌的推理速度
- 计算各字段识别准确率
- 生成详细测试报告

**参数:**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--model-path` | 必需 | 微调模型路径 |
| `--test-data` | `./datasets/test.jsonl` | 测试数据路径 |
| `--samples` | `50` | 测试样本数 |
| `--language` | `zh-HK` | 测试语言 (zh-HK/ja-JP/en-US) |
| `--output-dir` | `./benchmarks` | 输出目录 |
| `--device` | `cuda` | 运行设备 |

**输出:**
```
benchmarks/
├── benchmark_results.json    # 详细 JSON 结果
└── benchmark_report.txt      # 文本报告
```

**示例输出:**
```
======================================================================
PTCG Qwen-VL 基准测试结果
======================================================================

📊 总体统计:
  测试样本数：50
  成功：47
  失败：3
  成功率：94.0%

⏱️ 推理时间:
  平均：652.3 ms
  中位数：598.5 ms
  标准差：145.2 ms
  最小：420.1 ms
  最大：1250.8 ms
  P95: 890.5 ms

📝 字段级别准确率:
  ✓ hp: 97.9%
  ✓ name: 95.7%
  ✓ types: 93.6%
  ✓ rarity: 91.5%
  ⚠ abilities: 85.1%
  ⚠ attacks: 83.0%

  平均准确率：91.1%

======================================================================
```

### 2. model_comparison.py - 模型对比

**功能:**
- 对比基础模型和微调模型
- 分析各字段改进情况
- 计算性能提升百分比

**参数:**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--base-model` | `Qwen/Qwen2.5-VL-7B-Instruct` | 基础模型 |
| `--finetuned-model` | 必需 | 微调模型路径 |
| `--samples` | `50` | 测试样本数 |
| `--language` | `zh-HK` | 测试语言 |
| `--output-dir` | `./comparisons` | 输出目录 |

**输出:**
```
comparisons/
├── comparison_results.json   # 详细对比结果
└── comparison_report.txt     # 对比报告
```

**示例输出:**
```
======================================================================
PTCG Qwen-VL 模型对比测试结果
======================================================================

📊 总体统计:
  测试样本数：50
  基础模型成功率：62.0%
  微调模型成功率：94.0%
  提升：+32.0%

⏱️ 推理时间:
  基础模型：680.5 ms
  微调模型：652.3 ms

📝 字段级别对比:
  ✓ name:
      两者都对：60.0%
      两者都错：4.0%
      基础更好：2.0%
      微调更好：34.0% (+32.0%)

  ✓ hp:
      两者都对：58.0%
      两者都错：2.0%
      基础更好：4.0%
      微调更好：36.0% (+32.0%)

  ✓ attacks:
      两者都对：45.0%
      两者都错：10.0%
      基础更好：5.0%
      微调更好：40.0% (+35.0%)

======================================================================
```

### 3. analyze_results.py - 结果分析

**功能:**
- 分析错误类型
- 按复杂度分析性能
- 生成优化建议

**参数:**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--benchmark-dir` | `./benchmarks` | 基准测试目录 |
| `--output` | `None` | 输出报告路径 |

**输出:**
```
benchmarks/
└── analysis_report.json    # 详细分析报告
```

## 📊 测试指标说明

### 推理时间

| 指标 | 说明 | 优秀 | 良好 | 需优化 |
|------|------|------|------|--------|
| **平均时间** | 所有样本平均值 | <500ms | 500-800ms | >800ms |
| **中位数** | 中间值，排除异常 | <450ms | 450-700ms | >700ms |
| **P95** | 95% 请求的延迟 | <700ms | 700-1000ms | >1000ms |
| **标准差** | 稳定性指标 | <100ms | 100-200ms | >200ms |

### 识别准确率

| 字段 | 优秀 | 良好 | 需优化 |
|------|------|------|--------|
| **name** | >95% | 90-95% | <90% |
| **hp** | >95% | 90-95% | <90% |
| **types** | >93% | 88-93% | <88% |
| **rarity** | >90% | 85-90% | <85% |
| **abilities** | >85% | 80-85% | <80% |
| **attacks** | >85% | 80-85% | <80% |

### 成功率

| 范围 | 评级 | 建议 |
|------|------|------|
| >95% | ✅ 优秀 | 可部署生产 |
| 90-95% | ✓ 良好 | 可继续使用 |
| 80-90% | ⚠️ 可接受 | 建议优化 |
| <80% | ❌ 需改进 | 增加训练数据 |

## 🔍 错误类型分析

### 常见错误

| 错误类型 | 说明 | 解决方法 |
|----------|------|----------|
| **missing_name** | 未识别卡牌名称 | 增加名称清晰的样本 |
| **missing_hp** | 未识别 HP 值 | 检查 HP 位置是否被遮挡 |
| **missing_attacks** | 未识别攻击 | 攻击文本较长，需更多训练 |
| **missing_abilities** | 未识别能力 | 增加特性类卡牌样本 |
| **json_parse_error** | JSON 解析失败 | 调整 temperature 参数 |
| **wrong_type** | 属性识别错误 | 增加相似属性对比训练 |

## 📈 测试流程

### 完整测试流程

```bash
# 1. 准备测试数据
python export_training_data.py --samples 1800 --preprocess-images
python validate_dataset.py --dataset-dir ./datasets

# 2. 训练模型
python finetune_qwen_vl.py --data-dir ./datasets --epochs 3

# 3. 运行基准测试
python benchmark_test.py --model-path ./outputs/final --samples 50

# 4. 分析结果
python analyze_results.py --benchmark-dir ./benchmarks

# 5. （可选）模型对比
python model_comparison.py --finetuned-model ./outputs/final

# 6. 查看报告
cat ./benchmarks/benchmark_report.txt
cat ./benchmarks/analysis_report.json
```

## 💡 优化建议

### 基于测试结果优化

#### 如果推理时间过长 (>1000ms)

```bash
# 1. 启用 Flash Attention 2
pip install flash-attn --no-build-isolation

# 2. 减小序列长度
python finetune_qwen_vl.py --max-seq-length 768

# 3. 使用更小的图像
# 修改 export_training_data.py 中的 IMAGE_CONFIG
IMAGE_CONFIG = {"max_size": 384}  # 从 512 降至 384
```

#### 如果准确率低 (<85%)

```bash
# 1. 增加训练样本
python export_training_data.py --samples 2500

# 2. 增加训练轮数
python finetune_qwen_vl.py --epochs 5

# 3. 调整 LoRA 参数
python finetune_qwen_vl.py --lora-r 32 --lora-alpha 64

# 4. 降低学习率
python finetune_qwen_vl.py --learning-rate 1e-4
```

#### 如果特定字段准确率低

```bash
# 针对该字段增加训练样本
# 例如：如果 abilities 准确率低
# 在 export_training_data.py 中增加复杂卡牌比例
target_distribution = {"simple": 0.3, "medium": 0.4, "complex": 0.3}
```

## 📝 测试报告示例

### 完整测试报告

```json
{
  "timestamp": "2024-01-01T10:00:00",
  "total_samples": 50,
  "success_count": 47,
  "failure_count": 3,
  "success_rate": 94.0,
  "timing": {
    "mean_sec": 0.652,
    "median_sec": 0.598,
    "std_sec": 0.145,
    "min_sec": 0.420,
    "max_sec": 1.250,
    "p95_sec": 0.890
  },
  "field_accuracy": {
    "name": 95.7,
    "hp": 97.9,
    "types": 93.6,
    "rarity": 91.5,
    "abilities": 85.1,
    "attacks": 83.0
  },
  "recommendations": [
    "✅ 成功率优秀，模型已准备好用于生产环境",
    "✅ 平均推理时间 652ms，性能良好",
    "⚠️  攻击识别率低于 85%，这是正常现象"
  ]
}
```

## 🎯 性能基准

### RTX 5070 Ti 16GB 预期性能

| 指标 | 目标值 | 实测值（示例） |
|------|--------|----------------|
| 平均推理时间 | <800ms | 652ms |
| 中位数时间 | <700ms | 598ms |
| P95 延迟 | <1000ms | 890ms |
| 名称准确率 | >95% | 95.7% |
| HP 准确率 | >95% | 97.9% |
| 平均准确率 | >85% | 91.1% |
| 成功率 | >90% | 94.0% |

## 📚 相关文档

- [README.md](README.md) - 项目总览
- [SETUP_GUIDE_RTX_5070TI.md](SETUP_GUIDE_RTX_5070TI.md) - 安装指南
- [DATA_PREPARATION_GUIDE.md](DATA_PREPARATION_GUIDE.md) - 数据准备
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - 故障排除

## 🤝 贡献

欢迎提交测试结果和改进建议！
