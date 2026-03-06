# PTCG Qwen-VL 测试故障排除指南

## 🔍 快速诊断

### Windows 用户

运行快速诊断工具：

```batch
quick_diagnose.bat
```

或手动诊断：

```batch
python diagnose.py
```

---

## ❌ 常见错误及解决方案

### 1. 模型路径不存在

**错误信息:**
```
❌ 错误：模型路径不存在 .\outputs\final
```

**原因:** 尚未完成模型训练

**解决方案:**

```bash
# 1. 导出数据
python export_training_data.py --samples 1800 --preprocess-images

# 2. 开始训练（约 6-8 小时）
python finetune_qwen_vl.py --data-dir ./datasets --output-dir ./outputs --epochs 3

# 3. 等待训练完成后，再运行测试
```

---

### 2. 测试数据不存在

**错误信息:**
```
❌ 错误：测试数据不存在 .\datasets\test.jsonl
```

**原因:** 尚未导出数据集

**解决方案:**

```bash
python export_training_data.py --samples 1800 --output-dir ./datasets
```

导出完成后会自动生成：
- `train.jsonl` (训练集)
- `validation.jsonl` (验证集)
- `test.jsonl` (测试集)

---

### 3. PyTorch 未安装

**错误信息:**
```
❌ PyTorch 未安装
```

**解决方案:**

```bash
# CUDA 12.1 (推荐)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# 如果只有 CPU
pip install torch torchvision torchaudio
```

---

### 4. CUDA Out of Memory

**错误信息:**
```
torch.cuda.OutOfMemoryError: CUDA out of memory
```

**原因:** 显存不足（RTX 5070 Ti 16GB 应该足够）

**解决方案:**

```bash
# 方案 1: 关闭其他占用显存的程序
# 关闭游戏、浏览器、其他 AI 应用等

# 方案 2: 使用 CPU 测试（速度慢但不会 OOM）
python benchmark_simple.py --model-path ./outputs/final --device cpu

# 方案 3: 清理 CUDA 缓存
python -c "import torch; torch.cuda.empty_cache()"
```

---

### 5. transformers 版本错误

**错误信息:**
```
ImportError: cannot import name 'AutoProcessor' from 'transformers'
```

**原因:** transformers 版本过低

**解决方案:**

```bash
pip install --upgrade transformers>=4.37.0
```

---

### 6. 中文卡牌样本不足

**警告信息:**
```
⚠️  警告：中文卡牌数量较少 (5)
```

**原因:** 数据集中繁体中文卡牌太少

**解决方案:**

```bash
# 重新导出数据，确保数据库中有足够的中文卡牌
python export_training_data.py --samples 1800

# 如果数据库中中文卡牌不足，可以先跳过
# 测试会使用所有可用的中文卡牌
```

---

### 7. 依赖缺失

**错误信息:**
```
❌ 错误：Pillow 未安装
或
❌ 错误：transformers 未安装
```

**解决方案:**

```bash
# 安装所有依赖
pip install -r requirements.txt

# 或单独安装
pip install Pillow transformers peft bitsandbytes datasets
```

---

### 8. 模型文件不完整

**警告信息:**
```
⚠️  adapter_model.safetensors 不存在
```

**原因:** 训练未完成或被中断

**解决方案:**

```bash
# 检查训练输出
dir .\outputs

# 如果有 checkpoint 文件夹，可以使用最新的 checkpoint
python benchmark_simple.py --model-path ./outputs/checkpoint-200

# 或重新完成训练
python finetune_qwen_vl.py --data-dir ./datasets --output-dir ./outputs
```

---

### 9. JSON 解析失败

**错误信息:**
```
JSON 解析失败：Expecting value: line 1 column 1
```

**原因:** 模型输出格式不正确

**解决方案:**

这是正常现象，某些样本可能难以识别。测试工具会自动：
- 跳过解析失败的样本
- 统计成功率
- 在报告中显示错误类型

如果失败率过高（>30%），建议：
1. 增加训练样本数
2. 增加训练轮数
3. 调整学习率

---

### 10. 推理速度过慢

**症状:** 单张卡牌超过 2 秒

**原因:** 
- 使用 CPU 而非 GPU
- 图像尺寸过大
- 模型配置不当

**解决方案:**

```bash
# 检查是否使用 GPU
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"

# 如果 CUDA 不可用，检查：
# 1. NVIDIA 驱动是否安装
# 2. PyTorch 是否安装 CUDA 版本

# 使用 Flash Attention 加速
pip install flash-attn --no-build-isolation
```

---

## 🔧 手动调试步骤

### 步骤 1: 检查环境

```bash
python diagnose.py
```

### 步骤 2: 检查模型文件

```bash
# Windows
dir .\outputs\final

# Linux/Mac
ls -la ./outputs/final
```

应该包含：
- `config.json`
- `adapter_model.safetensors`
- `tokenizer.json`

### 步骤 3: 检查数据集

```bash
# 统计各语言样本数
python -c "
import json
langs = {}
with open('./datasets/test.jsonl') as f:
    for line in f:
        if line.strip():
            data = json.loads(line)
            lang = data.get('metadata', {}).get('language')
            langs[lang] = langs.get(lang, 0) + 1
for lang, count in langs.items():
    print(f'{lang}: {count}')
"
```

### 步骤 4: 测试单张卡牌

```bash
python -c "
from transformers import AutoProcessor, AutoModelForVision2Seq
import torch

model_path = './outputs/final'
print(f'Loading model: {model_path}')

processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
model = AutoModelForVision2Seq.from_pretrained(
    model_path,
    trust_remote_code=True,
    torch_dtype=torch.float16,
    device_map='auto'
)

print('✓ Model loaded successfully')
print(f'Device: {model.device}')
"
```

---

## 📞 获取帮助

如果以上方案都无法解决问题：

1. **查看完整日志**: 运行 `diagnose.py` 查看详细错误
2. **检查硬件**: 确认 GPU 和显存符合要求
3. **重新安装依赖**: `pip install -r requirements.txt --force-reinstall`
4. **重新训练模型**: 确保训练过程无错误

---

## 📊 预期结果

成功运行后应看到：

```
============================================================
测试结果
============================================================

📊 总体统计:
  测试样本：50
  成功：47
  失败：3
  成功率：94.0%
  总耗时：32.5s (0.5 分钟)
  平均推理时间：0.65s (650ms)
  最快：0.42s
  最慢：1.25s

📝 字段准确率:
  ✓ hp: 97.9%
  ✓ name: 95.7%
  ✓ types: 93.6%
  ✓ rarity: 91.5%
  ⚠ abilities: 85.1%
  ⚠ attacks: 83.0%

✓ 报告已保存到：.\benchmarks
```

---

## 🎯 性能基准

RTX 5070 Ti 16GB 预期性能：

| 指标 | 目标值 |
|------|--------|
| 平均推理时间 | 500-800ms |
| 成功率 | >90% |
| 名称准确率 | >95% |
| HP 准确率 | >95% |
| 平均准确率 | >85% |

如果结果远低于预期，请检查：
1. 是否使用 GPU（非 CPU）
2. 模型是否正确训练
3. 数据集质量是否良好
