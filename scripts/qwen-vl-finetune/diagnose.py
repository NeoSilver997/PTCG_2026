#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Qwen-VL 环境诊断工具

检查所有可能的问题并提供解决方案

使用方法:
    python diagnose.py
"""

import os
import sys
import json
from pathlib import Path

print("=" * 70)
print("PTCG Qwen-VL 环境诊断工具")
print("=" * 70)
print()

issues = []
warnings = []

# 1. 检查 Python 版本
print("[1/8] 检查 Python 版本...")
python_version = sys.version_info
if python_version.major < 3 or python_version.minor < 10:
    issues.append(f"Python 版本过低：{python_version.major}.{python_version.minor}，需要 3.10+")
    print(f"  ❌ Python {python_version.major}.{python_version.minor} (需要 3.10+)")
else:
    print(f"  ✓ Python {python_version.major}.{python_version.minor}")
print()

# 2. 检查 PyTorch 和 CUDA
print("[2/8] 检查 PyTorch 和 CUDA...")
try:
    import torch
    print(f"  ✓ PyTorch {torch.__version__}")
    
    if torch.cuda.is_available():
        print(f"  ✓ CUDA 可用")
        print(f"  ✓ GPU: {torch.cuda.get_device_name(0)}")
        print(f"  ✓ GPU 显存：{torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
        
        # 检查显存是否足够
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1e9
        if gpu_memory < 12:
            warnings.append(f"GPU 显存较小 ({gpu_memory:.1f}GB)，建议至少 12GB")
            print(f"  ⚠️  显存较小，可能需要减小 batch size")
    else:
        warnings.append("CUDA 不可用，将使用 CPU 模式（速度很慢）")
        print(f"  ⚠️  CUDA 不可用，将使用 CPU")
except ImportError as e:
    issues.append(f"PyTorch 未安装：{e}")
    print(f"  ❌ PyTorch 未安装")
print()

# 3. 检查 transformers
print("[3/8] 检查 transformers...")
try:
    import transformers
    print(f"  ✓ transformers {transformers.__version__}")
    
    # 检查版本
    version_parts = [int(x) for x in transformers.__version__.split('.')[:2]]
    if version_parts[0] < 4 or (version_parts[0] == 4 and version_parts[1] < 37):
        warnings.append(f"transformers 版本过低 ({transformers.__version__})，建议 4.37+")
        print(f"  ⚠️  版本过低，建议升级")
except ImportError as e:
    issues.append(f"transformers 未安装：{e}")
    print(f"  ❌ transformers 未安装")
print()

# 4. 检查其他依赖
print("[4/8] 检查其他依赖...")
dependencies = {
    "Pillow": "PIL",
    "datasets": "datasets",
    "peft": "peft",
    "bitsandbytes": "bitsandbytes",
}

for package, import_name in dependencies.items():
    try:
        __import__(import_name)
        print(f"  ✓ {package}")
    except ImportError:
        print(f"  ⚠️  {package} 未安装")
        if package in ["bitsandbytes", "peft"]:
            warnings.append(f"{package} 未安装，可能影响 QLoRA 训练")
print()

# 5. 检查模型
print("[5/8] 检查模型文件...")
model_path = Path("./outputs/final")
if model_path.exists():
    print(f"  ✓ 模型目录存在：{model_path}")
    
    # 检查必要文件
    config_file = model_path / "config.json"
    adapter_file = model_path / "adapter_model.safetensors"
    tokenizer_file = model_path / "tokenizer.json"
    
    if config_file.exists():
        print(f"    ✓ config.json")
    else:
        warnings.append("模型缺少 config.json")
        print(f"    ❌ config.json 不存在")
    
    if adapter_file.exists():
        print(f"    ✓ adapter_model.safetensors")
    else:
        warnings.append("模型缺少 adapter_model.safetensors，可能未完成训练")
        print(f"    ⚠️  adapter_model.safetensors 不存在")
    
    if tokenizer_file.exists():
        print(f"    ✓ tokenizer.json")
    else:
        warnings.append("模型缺少 tokenizer.json")
        print(f"    ⚠️  tokenizer.json 不存在")
else:
    issues.append("模型目录不存在，请先完成训练")
    print(f"  ❌ 模型目录不存在")
    print(f"     请运行：python finetune_qwen_vl.py")
print()

# 6. 检查数据集
print("[6/8] 检查数据集...")
data_files = {
    "train.jsonl": "./datasets/train.jsonl",
    "validation.jsonl": "./datasets/validation.jsonl",
    "test.jsonl": "./datasets/test.jsonl",
}

for name, path in data_files.items():
    if os.path.exists(path):
        # 统计样本数
        count = 0
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    count += 1
        print(f"  ✓ {name} ({count} 样本)")
    else:
        warnings.append(f"数据集缺少 {name}")
        print(f"  ❌ {name} 不存在")
print()

# 7. 检查语言分布
print("[7/8] 检查语言分布...")
test_file = "./datasets/test.jsonl"
if os.path.exists(test_file):
    lang_counts = {"zh-HK": 0, "ja-JP": 0, "en-US": 0}
    with open(test_file, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                try:
                    data = json.loads(line)
                    lang = data.get("metadata", {}).get("language", "unknown")
                    if lang in lang_counts:
                        lang_counts[lang] += 1
                except:
                    pass
    
    for lang, count in lang_counts.items():
        status = "✓" if count >= 50 else "⚠️" if count >= 10 else "❌"
        print(f"  {status} {lang}: {count} 样本")
    
    if lang_counts["zh-HK"] < 10:
        warnings.append("中文测试样本不足 10 个")
else:
    print(f"  ❌ 测试数据不存在")
print()

# 8. 检查磁盘空间
print("[8/8] 检查磁盘空间...")
try:
    import shutil
    total, used, free = shutil.disk_usage(".")
    free_gb = free / (1024**3)
    
    status = "✓" if free_gb > 10 else "⚠️" if free_gb > 5 else "❌"
    print(f"  {status} 可用磁盘空间：{free_gb:.1f} GB")
    
    if free_gb < 5:
        warnings.append("磁盘空间不足 5GB")
except:
    print(f"  ⚠️  无法检查磁盘空间")
print()

# 总结
print("=" * 70)
print("诊断结果")
print("=" * 70)

if issues:
    print(f"\n❌ 发现 {len(issues)} 个严重问题:")
    for i, issue in enumerate(issues, 1):
        print(f"  {i}. {issue}")
else:
    print("\n✅ 未发现严重问题")

if warnings:
    print(f"\n⚠️  发现 {len(warnings)} 个警告:")
    for i, warning in enumerate(warnings, 1):
        print(f"  {i}. {warning}")

if not issues and not warnings:
    print("\n🎉 所有检查通过！可以开始测试")

print("\n" + "=" * 70)

# 提供解决方案
if issues or warnings:
    print("\n建议操作:")
    
    if any("PyTorch" in issue for issue in issues):
        print("\n1. 安装 PyTorch:")
        print("   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121")
    
    if any("transformers" in issue for issue in issues):
        print("\n2. 安装 transformers:")
        print("   pip install transformers>=4.37.0")
    
    if any("模型目录不存在" in issue for issue in issues):
        print("\n3. 完成模型训练:")
        print("   python finetune_qwen_vl.py --data-dir ./datasets --output-dir ./outputs")
    
    if any("数据集" in issue for issue in issues + warnings):
        print("\n4. 导出数据集:")
        print("   python export_training_data.py --samples 1800 --preprocess-images")
    
    if any("CUDA" in warning for warning in warnings):
        print("\n5. CUDA 问题:")
        print("   - 确保已安装 NVIDIA 驱动")
        print("   - 确保安装了 CUDA 12.1 版本的 PyTorch")
    
    if any("显存" in warning for warning in warnings):
        print("\n6. 显存优化:")
        print("   - 使用 --batch-size 1")
        print("   - 使用 --max-seq-length 768")
        print("   - 启用 gradient checkpointing")

print("\n" + "=" * 70)

# 返回状态码
sys.exit(1 if issues else 0)
