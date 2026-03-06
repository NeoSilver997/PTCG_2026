# PTCG Qwen-VL 故障排除指南

## 目录

- [安装问题](#安装问题)
- [训练问题](#训练问题)
- [推理问题](#推理问题)
- [API 集成问题](#api 集成问题)
- [性能问题](#性能问题)
- [常见问题 FAQ](#常见问题-faq)

---

## 安装问题

### 1. PyTorch CUDA 版本不匹配

**错误信息:**
```
RuntimeError: Found no NVIDIA driver on your system!
```

**原因:** PyTorch CUDA 版本与系统 CUDA 版本不兼容

**解决方案:**

```bash
# 1. 检查系统 CUDA 版本
nvidia-smi

# 2. 卸载现有 PyTorch
pip uninstall torch torchvision torchaudio

# 3. 根据 CUDA 版本安装
# CUDA 11.8
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# CUDA 12.1
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# 如果只有 CPU
pip install torch torchvision torchaudio
```

### 2. Unsloth 安装失败

**错误信息:**
```
ERROR: Could not find a version that satisfies the requirement unsloth
```

**解决方案:**

```bash
# 方式 1: 从 GitHub 安装
pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"

# 方式 2: 克隆后安装
git clone https://github.com/unslothai/unsloth.git
cd unsloth
pip install -e .

# 方式 3: 不使用 Unsloth（训练会慢一些）
# 修改 finetune_qwen_vl.py，设置 USE_UNSLOTH = False
```

### 3. transformers 版本冲突

**错误信息:**
```
ImportError: cannot import name 'BitsAndBytesConfig' from 'transformers'
```

**解决方案:**

```bash
# 升级 transformers
pip install --upgrade transformers>=4.37.0

# 安装 bitsandbytes
pip install bitsandbytes>=0.41.0
```

### 4. Prisma Python 客户端安装失败

**错误信息:**
```
Error: Could not find a prisma-python binary
```

**解决方案:**

```bash
# 安装 Prisma CLI
npm install -g prisma

# 生成客户端
prisma generate

# 安装 Python 客户端
pip install prisma

# 初始化
prisma py generate
```

---

## 训练问题

### 1. CUDA Out of Memory

**错误信息:**
```
torch.cuda.OutOfMemoryError: CUDA out of memory.
```

**解决方案:**

```bash
# 方案 1: 减小批大小
python finetune_qwen_vl.py --batch-size 1

# 方案 2: 减少序列长度
python finetune_qwen_vl.py --max-seq-length 1024

# 方案 3: 增加梯度累积
python finetune_qwen_vl.py --gradient-accumulation-steps 16

# 方案 4: 使用 CPU offload
# 修改 finetune_qwen_vl.py，添加:
# model.enable_input_require_grads()
```

### 2. 训练速度过慢

**症状:** 每个 step 超过 10 秒

**解决方案:**

```bash
# 1. 确保使用 GPU
python -c "import torch; print(torch.cuda.is_available())"

# 2. 启用 Flash Attention 2
pip install flash-attn --no-build-isolation

# 3. 使用 Unsloth 加速
pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"

# 4. 使用 bfloat16（Ampere 架构 GPU）
python finetune_qwen_vl.py --bf16

# 5. 减少验证频率
python finetune_qwen_vl.py --eval-steps 200
```

### 3. 训练损失不下降

**症状:** loss 保持在高位或震荡

**解决方案:**

```bash
# 1. 检查学习率
# 尝试更小的学习率
python finetune_qwen_vl.py --learning-rate 1e-4

# 2. 增加 warmup
python finetune_qwen_vl.py --warmup-ratio 0.1

# 3. 检查数据质量
python -c "
import json
with open('./datasets/train.json') as f:
    data = json.load(f)
print(f'样本数：{len(data)}')
print(f'样本 0: {data[0]}')
"

# 4. 增加训练轮数
python finetune_qwen_vl.py --epochs 5
```

### 4. 数据加载错误

**错误信息:**
```
FileNotFoundError: [Errno 2] No such file or directory: 'path/to/image.jpg'
```

**解决方案:**

```bash
# 1. 检查图片路径
python -c "
import json
import os
with open('./datasets/train.json') as f:
    data = json.load(f)
for sample in data[:10]:
    img_path = sample['messages'][0]['content'][0]['image']
    if not os.path.exists(img_path):
        print(f'缺失：{img_path}')
"

# 2. 设置正确的图片目录
python finetune_qwen_vl.py --data-dir ./datasets --image-dir /path/to/images

# 3. 重新导出数据
python export_training_data.py --output-dir ./datasets
```

---

## 推理问题

### 1. 模型加载失败

**错误信息:**
```
OSError: Unable to load weights from pytorch_checkpoint
```

**解决方案:**

```bash
# 1. 清除缓存
rm -rf ~/.cache/huggingface/hub

# 2. 重新下载模型
python -c "
from transformers import AutoModelForVision2Seq
model = AutoModelForVision2Seq.from_pretrained('Qwen/Qwen2.5-VL-7B-Instruct')
"

# 3. 检查模型文件完整性
ls -la ./outputs/final/

# 4. 重新训练或复制模型
cp -r ./outputs/checkpoint-600 ./outputs/final
```

### 2. 推理服务启动失败

**错误信息:**
```
Address already in use: port 8000
```

**解决方案:**

```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :8000
kill -9 <PID>

# 或使用不同端口
python inference_service.py --port 8001
```

### 3. 推理结果乱码

**症状:** 输出包含大量特殊字符或重复文本

**解决方案:**

```python
# 修改 inference_service.py 中的生成参数
outputs = self.model.generate(
    **inputs,
    max_new_tokens=512,
    temperature=0.1,      # 降低温度
    do_sample=False,      # 禁用采样
    repetition_penalty=1.1,  # 添加重复惩罚
    pad_token_id=self.processor.tokenizer.pad_token_id,
)
```

### 4. 推理速度过慢

**症状:** 单张图片超过 5 秒

**解决方案:**

```bash
# 1. 确保使用 GPU
export CUDA_VISIBLE_DEVICES=0

# 2. 使用 bfloat16
# 修改 inference_service.py:
# torch_dtype=torch.bfloat16

# 3. 启用 CUDA Graph
# 修改 inference_service.py 添加:
# model = torch.compile(model)

# 4. 批处理请求
# 使用 /api/cards/batch-extract 端点
```

---

## API 集成问题

### 1. 连接推理服务失败

**错误信息:**
```
ECONNREFUSED: Connection refused to http://localhost:8000
```

**解决方案:**

```bash
# 1. 检查推理服务是否运行
curl http://localhost:8000/health

# 2. 检查防火墙
# Windows: 允许 8000 端口
netsh advfirewall firewall add rule name="Qwen VL" dir=in action=allow protocol=TCP localport=8000

# 3. 检查环境变量
echo $QWEN_VL_INFERENCE_URL

# 4. 重启推理服务
python inference_service.py --model-path ./outputs/final
```

### 2. 图像上传失败

**错误信息:**
```
BadRequestException: 必须是图像文件
```

**解决方案:**

```bash
# 确保使用正确的 Content-Type
curl -X POST http://localhost:3000/api/cards/vl/extract \
  -F "image=@card.jpg;type=image/jpeg" \
  -F "language=ja-JP"

# 检查文件类型
file card.jpg
```

### 3. 响应超时

**错误信息:**
```
TimeoutError: Request timeout after 30000ms
```

**解决方案:**

```bash
# 1. 增加超时时间
# 修改 .env
QWEN_VL_TIMEOUT=60000

# 2. 优化推理速度
# 见「推理问题 - 推理速度过慢」

# 3. 使用异步处理
# 修改控制器使用 BackgroundTasks
```

### 4. 低置信度警告

**症状:** 响应中包含 `低置信度` 警告

**解决方案:**

```bash
# 1. 降低阈值（不推荐）
# 修改 .env
QWEN_VL_CONFIDENCE_THRESHOLD=0.5

# 2. 改进图像质量
# - 确保图像清晰
# - 避免反光
# - 完整包含卡牌

# 3. 人工审核
# 标记低置信度结果进行人工审核
```

---

## 性能问题

### 1. 显存泄漏

**症状:** 显存使用持续增长

**解决方案:**

```python
# 在推理后清理
import torch
torch.cuda.empty_cache()

# 使用上下文管理器
with torch.no_grad():
    outputs = model.generate(...)
```

### 2. 内存不足

**错误信息:**
```
MemoryError: Unable to allocate ...
```

**解决方案:**

```bash
# 1. 减少并发
# 修改 inference_service.py
CONCURRENCY_LIMIT = 1

# 2. 使用流式处理
# 修改数据加载器

# 3. 增加系统内存
# 或减少数据集大小
```

---

## 常见问题 FAQ

### Q: 需要多少显存才能训练？

**A:** 
- 最低：20GB (RTX 3090) - 需要减小 batch size
- 推荐：24GB (RTX 4090) - 可以正常使用默认配置
- 理想：40GB+ (A100) - 可以增大 batch size 加速

### Q: 训练需要多长时间？

**A:**
- RTX 3090: ~8 小时 (1800 样本，3 epochs)
- RTX 4090: ~5 小时
- A100: ~2 小时

### Q: 可以只训练特定语言吗？

**A:** 可以，修改 `export_training_data.py` 中的语言过滤:

```python
# 只导出日语卡牌
languages = ["JA_JP"]
```

### Q: 如何评估模型在特定卡牌类型上的表现？

**A:** 修改 `evaluate_qwen_vl.py` 添加过滤:

```python
# 只评估 ex 卡牌
test_data = [s for s in test_data if 'ex' in s['metadata'].get('name', '').lower()]
```

### Q: 可以在没有 GPU 的机器上推理吗？

**A:** 可以，但速度会很慢（~10 秒/张）:

```bash
python inference_service.py --device cpu
```

### Q: 如何合并 LoRA 权重到基础模型？

**A:**

```python
from peft import PeftModel
from transformers import AutoModelForVision2Seq

base_model = AutoModelForVision2Seq.from_pretrained("Qwen/Qwen2.5-VL-7B-Instruct")
model = PeftModel.from_pretrained(base_model, "./outputs/final")
merged_model = model.merge_and_unload()
merged_model.save_pretrained("./outputs/merged")
```

### Q: 如何处理非标准尺寸的卡牌图像？

**A:** 在推理前进行预处理:

```python
from PIL import Image

def preprocess_image(image_path):
    img = Image.open(image_path)
    # 调整为标准尺寸
    img = img.resize((1024, int(img.height * 1024 / img.width)))
    return img
```

### Q: 可以增量训练吗？

**A:** 可以，使用已有模型继续训练:

```bash
python finetune_qwen_vl.py \
    --model-path ./outputs/final \
    --data-dir ./new_datasets \
    --epochs 1 \
    --learning-rate 1e-5
```

---

## 获取帮助

如果以上方案无法解决问题:

1. **查看日志**: `tail -f training.log` 或 `logs/qwen-vl.log`
2. **提交 Issue**: 包含错误信息、环境配置、复现步骤
3. **检查资源**: 
   - [Qwen-VL 文档](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct)
   - [Unsloth 文档](https://github.com/unslothai/unsloth)
   - [HuggingFace 论坛](https://discuss.huggingface.co/)
