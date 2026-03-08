#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Qwen2.5-VL-7B QLoRA Fine-tuning Script (RTX 5070 Ti 16GB 优化)

使用 QLoRA (4-bit 量化) 进行内存优化的微调。

配置 (针对 16GB VRAM 优化):
- 4-bit 量化 (NF4)
- LoRA rank: 16
- LoRA alpha: 32
- Batch size: 1-2 (根据显存调整)
- Gradient accumulation: 16 steps
- Max sequence length: 1024 (图像 512x512)
- Gradient checkpointing: enabled

使用方法:
    python finetune_qwen_vl.py \
        --data-dir ./datasets \
        --output-dir ./outputs \
        --epochs 3 \
        --batch-size 1 \
        --gradient-accumulation-steps 16
"""

import os
import sys

# ─── Fix: Prevent local datasets/ directory from shadowing HuggingFace datasets ─
# Python adds the script's directory to sys.path[0], which causes the local
# datasets/ folder to be imported instead of the installed HF datasets package.
_script_dir = os.path.dirname(os.path.abspath(__file__))
for _p in list(sys.path):
    if os.path.normpath(_p) in (os.path.normpath(_script_dir), ''):
        try:
            sys.path.remove(_p)
        except ValueError:
            pass
# ─────────────────────────────────────────────────────────────────────────────────
import json
import argparse
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field

import torch
from torch.utils.data import Dataset

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('training.log', encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)

# Suppress noisy HF Hub HTTP request logs
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("huggingface_hub").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

# 检查 GPU
if torch.cuda.is_available():
    gpu_name = torch.cuda.get_device_name(0)
    gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1e9
    logger.info(f"GPU detected: {gpu_name} ({gpu_memory:.1f} GB)")
    
    # RTX 5070 Ti check
    if "5070" in gpu_name or "5090" in gpu_name:
        logger.info("✓ NVIDIA Blackwell architecture detected, enabling optimizations")
else:
    logger.warning("⚠ No GPU detected, training will be very slow")


# ============================================================================
# 配置类 (16GB VRAM 优化)
# ============================================================================

@dataclass
class TrainingConfig:
    """训练配置 - RTX 5070 Ti 16GB 优化"""
    
    # 模型配置
    model_name: str = "Qwen/Qwen2.5-VL-7B-Instruct"
    
    # QLoRA 配置 (4-bit 量化)
    load_in_4bit: bool = True
    bnb_4bit_quant_type: str = "nf4"  # Normal Float 4-bit
    bnb_4bit_compute_dtype: str = "bfloat16"
    bnb_4bit_use_double_quant: bool = True  # 额外 0.4% 压缩
    
    # LoRA 配置
    lora_r: int = 16  # 降低 rank 减少显存
    lora_alpha: int = 32  # alpha = 2 * r
    lora_dropout: float = 0.05
    target_modules: List[str] = field(default_factory=lambda: [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj"
    ])
    
    # 训练配置 (内存优化)
    learning_rate: float = 2e-4
    batch_size: int = 1  # Keep at 1; batch_size=2 refills freed VRAM with activations
    gradient_accumulation_steps: int = 16  # 1×16=16 effective batch
    num_epochs: int = 3
    max_seq_length: int = 512  # PTCG JSON responses are concise; 512 is sufficient
    warmup_ratio: float = 0.05  # 增加 warmup 比例
    
    # 优化器配置
    optimizer: str = "adamw"
    lr_scheduler_type: str = "cosine"
    
    # 精度配置
    bf16: bool = True  # Blackwell 架构支持 bf16
    fp16: bool = False
    
    # 内存优化
    gradient_checkpointing: bool = True  # Required for 4-bit PEFT grad flow; ViT GC is disabled below
    dataloader_num_workers: int = 0  # 0 = main process; avoids Windows CUDA multiprocessing deadlocks
    dataloader_pin_memory: bool = False  # No benefit with workers=0
    
    # 保存配置
    save_steps: int = 100  # 更频繁保存
    eval_steps: int = 50
    logging_steps: int = 10
    
    # 其他
    seed: int = 42
    max_grad_norm: float = 1.0  # 梯度裁剪防止爆炸


# ============================================================================
# 数据集类 (内存优化)
# ============================================================================

class PTCGCardDataset(Dataset):
    """PTCG 卡牌数据集 - 流式加载优化内存"""
    
    def __init__(
        self,
        data_path: str,
        processor: Any,
        max_length: int = 1024,
        image_processor: Optional[Any] = None,
    ):
        self.processor = processor
        self.max_length = max_length
        self.image_processor = image_processor
        
        # 流式读取 JSONL 文件
        self.data = []
        with open(data_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    self.data.append(json.loads(line))
        
        logger.info(f"Dataset loaded: {len(self.data)} samples")
        self._compute_stats()
    
    def _compute_stats(self):
        """计算数据集统计信息"""
        lang_counts = {}
        complexity_counts = {}
        
        for sample in self.data:
            if "metadata" in sample:
                lang = sample["metadata"].get("language", "unknown")
                complexity = sample["metadata"].get("complexity", "unknown")
                
                lang_counts[lang] = lang_counts.get(lang, 0) + 1
                complexity_counts[complexity] = complexity_counts.get(complexity, 0) + 1
        
        logger.info(f"Language distribution: {lang_counts}")
        logger.info(f"Complexity distribution: {complexity_counts}")
    
    def __len__(self) -> int:
        return len(self.data)
    
    def __getitem__(self, idx: int) -> Dict[str, Any]:
        sample = self.data[idx]
        messages = sample["messages"]
        
        # 提取图片和文本
        image_path = None
        text_prompt = ""
        text_response = ""
        
        for msg in messages:
            if msg["role"] == "user":
                for content in msg["content"]:
                    if content["type"] == "image":
                        image_path = content["image"]
                    elif content["type"] == "text":
                        text_prompt = content["text"]
            elif msg["role"] == "assistant":
                for content in msg["content"]:
                    if content["type"] == "text":
                        text_response = content["text"]
        
        # 加载图片（带错误处理）
        image = self._load_image(image_path)
        
        # 构建对话格式
        conversation = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": text_prompt}
                ]
            },
            {
                "role": "assistant",
                "content": [{"type": "text", "text": text_response}]
            }
        ]
        
        # 使用 processor 处理 (single call — no double-encoding of image)
        try:
            inputs = self.processor.apply_chat_template(
                conversation,
                tokenize=True,
                add_generation_prompt=False,
                return_dict=True,
                return_tensors="pt",
                # Do NOT set padding/max_length here — let the collator pad the batch
            )
            
            # 准备标签：只对 assistant 回复部分计算 loss
            # Find the boundary by looking for the last occurrence of the
            # assistant-turn start token(s) without re-running the processor.
            labels = inputs["input_ids"].clone()
            try:
                # Qwen2.5-VL chat template marks assistant turn with <|im_start|>assistant
                # Tokenize the simple boundary string (no image involved → very fast)
                boundary_ids = self.processor.tokenizer.encode(
                    "<|im_start|>assistant", add_special_tokens=False
                )
                ids_list = inputs["input_ids"][0].tolist()
                # Find last occurrence of the boundary sequence
                prompt_len = 0
                for i in range(len(ids_list) - len(boundary_ids), -1, -1):
                    if ids_list[i:i + len(boundary_ids)] == boundary_ids:
                        prompt_len = i + len(boundary_ids)  # mask up to & including marker
                        break
                labels[0, :prompt_len] = -100  # mask prompt + assistant marker
            except Exception:
                pass  # fallback: full LM objective
            
            # 掩盖 padding tokens
            labels[inputs["attention_mask"] == 0] = -100
            
            # 提取所有处理器输出（包括 image_grid_thw 等 Qwen2.5-VL 需要的字段）
            result = {
                "input_ids": inputs["input_ids"].squeeze(0),
                "attention_mask": inputs["attention_mask"].squeeze(0),
                "labels": labels.squeeze(0),
            }
            
            # 添加视觉相关字段
            if "pixel_values" in inputs:
                pv = inputs["pixel_values"]
                # pixel_values 形状: (1, N, C, H, W) 或 (N, C, H, W)
                result["pixel_values"] = pv.squeeze(0) if pv.dim() == 5 else pv
            
            if "image_grid_thw" in inputs:
                result["image_grid_thw"] = inputs["image_grid_thw"].squeeze(0) if inputs["image_grid_thw"].dim() > 1 else inputs["image_grid_thw"]
            
            return result
            
        except Exception as e:
            logger.warning(f"处理样本 {idx} 时出错：{e}")
            return self._get_empty_sample()
    
    # Max pixels on the longest image edge before feeding to Qwen2.5-VL processor.
    # PTCG cards @ 321×448 → 704 ViT patches (32×22) @ 14px stride.
    # With MAX_LONG_EDGE=168: 321×448 → 120×168 → ~8×12=96 ViT patches.
    # ViT self-attention cost: O(n²) → 96²/704² ≈ 1.85% of baseline → ~50× less compute.
    # Images are still legible for card info extraction at this resolution.
    MAX_LONG_EDGE = 168

    def _load_image(self, image_path: str):
        """加载图片（内存优化）"""
        from PIL import Image
        
        if not image_path:
            return Image.new("RGB", (112, 168), color="white")
        
        # 处理 base64 图像
        if image_path.startswith("data:image"):
            import base64
            from io import BytesIO
            
            base64_data = image_path.split(",")[1]
            image_data = base64.b64decode(base64_data)
            img = Image.open(BytesIO(image_data)).convert("RGB")
        elif os.path.exists(image_path):
            try:
                img = Image.open(image_path).convert("RGB")
            except Exception as e:
                logger.warning(f"加载图片失败 {image_path}: {e}")
                return Image.new("RGB", (112, 168), color="white")
        else:
            return Image.new("RGB", (112, 168), color="white")
        
        # Pre-resize to limit ViT patch count (key training speed optimization).
        # Original 321×448 cards → 704 ViT patches. After resize → ~96 patches.
        w, h = img.size
        long_edge = max(w, h)
        if long_edge > self.MAX_LONG_EDGE:
            scale = self.MAX_LONG_EDGE / long_edge
            img = img.resize((max(14, int(round(w * scale))), max(14, int(round(h * scale)))), Image.LANCZOS)
        
        return img
    
    def _get_empty_sample(self) -> Dict[str, Any]:
        """返回空样本"""
        return {
            "input_ids": torch.zeros(self.max_length, dtype=torch.long),
            "attention_mask": torch.zeros(self.max_length, dtype=torch.long),
            "labels": torch.full((self.max_length,), -100, dtype=torch.long),
        }


class MemoryEfficientDataCollator:
    """内存高效数据 collator — 支持 Qwen2.5-VL 动态 pixel_values/image_grid_thw"""
    
    def __init__(self, pad_token_id: int = 0):
        self.pad_token_id = pad_token_id
    
    def __call__(self, features: List[Dict[str, Any]]) -> Dict[str, torch.Tensor]:
        # 1D padding fields (input_ids, attention_mask, labels)
        max_length = max(len(f["input_ids"]) for f in features)
        
        batch = {}
        
        # Pad 1D sequence fields
        for key, pad_val in [("input_ids", self.pad_token_id), ("attention_mask", 0), ("labels", -100)]:
            tensors = []
            for f in features:
                t = f[key]
                if len(t) < max_length:
                    pad_len = max_length - len(t)
                    t = torch.cat([t, torch.full((pad_len,), pad_val, dtype=t.dtype)])
                tensors.append(t)
            batch[key] = torch.stack(tensors)
        
        # pixel_values: concatenate along first dim (each item is [N_patches, C, H, W])
        if any("pixel_values" in f for f in features):
            pvs = [f["pixel_values"] for f in features if "pixel_values" in f]
            if pvs:
                try:
                    # If same shape, stack; otherwise cat (variable patch count)
                    if all(pv.shape == pvs[0].shape for pv in pvs):
                        batch["pixel_values"] = torch.stack(pvs)
                    else:
                        batch["pixel_values"] = torch.cat(pvs, dim=0)
                except Exception as e:
                    logger.warning(f"pixel_values 合并失败：{e}，跳过")
        
        # image_grid_thw: stack as (batch, 3) or cat
        if any("image_grid_thw" in f for f in features):
            thws = [f["image_grid_thw"] for f in features if "image_grid_thw" in f]
            if thws:
                try:
                    batch["image_grid_thw"] = torch.stack(thws)
                except Exception:
                    batch["image_grid_thw"] = torch.cat(thws, dim=0)
        
        return batch


# ============================================================================
# 模型加载 (QLoRA 4-bit)
# ============================================================================

def load_qlora_model(config: TrainingConfig) -> Tuple[Any, Any]:
    """
    加载 4-bit 量化模型和 LoRA 适配器
    
    针对 16GB VRAM 优化:
    - 4-bit 量化：7B 模型 ~4GB
    - LoRA 适配器：~200MB
    - 梯度 + 优化器：~6-8GB
    - 总计：~12-14GB
    """
    logger.info(f"Loading model: {config.model_name}")
    
    try:
        from transformers import (
            AutoProcessor,
            BitsAndBytesConfig,
        )
        try:
            from transformers import AutoModelForVision2Seq
        except ImportError:
            from transformers import AutoModelForImageTextToText as AutoModelForVision2Seq
        from peft import (
            LoraConfig,
            get_peft_model,
            prepare_model_for_kbit_training,
            TaskType,
        )
    except ImportError as e:
        logger.error(f"Missing dependency: {e}")
        logger.error("Please run: pip install transformers peft bitsandbytes")
        sys.exit(1)
    
    # 配置 4-bit 量化
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=config.load_in_4bit,
        bnb_4bit_quant_type=config.bnb_4bit_quant_type,
        bnb_4bit_compute_dtype=torch.bfloat16 if config.bf16 else torch.float16,
        bnb_4bit_use_double_quant=config.bnb_4bit_use_double_quant,
        llm_int8_threshold=6.0,
        llm_int8_has_fp16_weight=False,
    )
    
    # 加载 processor
    processor = AutoProcessor.from_pretrained(
        config.model_name,
        trust_remote_code=True,
    )
    # Cap image resolution for fast image processor.
    # Qwen2VLImageProcessorFast uses size dict (not just max_pixels attribute).
    # Default longest_edge = 12845056 (16384 patches!). Cap to 200704 (256 patches).
    _max_px = 256 * 28 * 28  # 200704 — well above natural card size → no upscale
    _min_px = 4 * 28 * 28   # 3136
    processor.image_processor.max_pixels = _max_px
    processor.image_processor.min_pixels = _min_px
    if hasattr(processor.image_processor, 'size') and isinstance(processor.image_processor.size, dict):
        processor.image_processor.size['longest_edge'] = _max_px
        processor.image_processor.size['shortest_edge'] = _min_px
    
    # 加载模型
    model = AutoModelForVision2Seq.from_pretrained(
        config.model_name,
        quantization_config=bnb_config,
        device_map="auto",  # 自动分配设备
        trust_remote_code=True,
        torch_dtype=torch.bfloat16 if config.bf16 else torch.float16,
        attn_implementation="sdpa",  # PyTorch SDPA: fused QK^T/softmax/V kernel, ~1.4x faster attention
    )
    
    # 准备 k-bit 训练
    model = prepare_model_for_kbit_training(
        model,
        use_gradient_checkpointing=config.gradient_checkpointing,
        gradient_checkpointing_kwargs={"use_reentrant": False}
    )
    
    # 配置 LoRA
    logger.info("Configuring LoRA...")
    lora_config = LoraConfig(
        r=config.lora_r,
        lora_alpha=config.lora_alpha,
        lora_dropout=config.lora_dropout,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
        target_modules=config.target_modules,
        # modules_to_save=["lm_head"] removed: saves 4.36GB VRAM (2.18GB fp32 copy + 2.18GB adafactor m)
        # Test (test_modules_to_save.py) confirmed backward works correctly without it.
        # lm_head is tied to embed_tokens (bf16, un-quantized) → gradient flows fine.
        inference_mode=False,
    )
    
    # 应用 LoRA
    model = get_peft_model(model, lora_config)

    # Without modules_to_save=["lm_head"], PEFT does not explicitly call
    # enable_input_require_grads() for the tied embedding gradient hook.
    # Call it manually to ensure the gradient flows from lm_head → LLM layers → LoRA params.
    # (prepare_model_for_kbit_training also calls this, but PEFT wrapping may displace it.)
    model.enable_input_require_grads()

    # Disable gradient checkpointing in the frozen ViT encoder.
    # The ViT params are frozen (requires_grad=False from prepare_model_for_kbit_training).
    # With GC enabled, the ViT forward is recomputed during backward pass (wasteful).
    # Disabling ViT GC: ViT runs ONCE per mini-batch (not twice), saving ~10-15% step time.
    # The ViT output tensors (small: 32 layers × 96 patches × 1152) are stored instead.
    try:
        # Walk to the visual encoder through PEFT wrapping
        inner = model.base_model.model if hasattr(model, 'base_model') else model
        visual = getattr(getattr(inner, 'model', inner), 'visual', None)
        if visual is not None and hasattr(visual, 'gradient_checkpointing_disable'):
            visual.gradient_checkpointing_disable()
            logger.info(f'ViT GC disabled: runs 1× per mini-batch instead of 2× (saves recompute cost)')
    except Exception as e:
        logger.warning(f'Could not disable ViT GC: {e}')

    # 打印参数
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total_params = sum(p.numel() for p in model.parameters())
    
    logger.info(f"Trainable parameters: {trainable_params:,} / {total_params:,} ({100*trainable_params/total_params:.2f}%)")
    logger.info(f"LoRA 配置：r={config.lora_r}, alpha={config.lora_alpha}")
    
    # 显存使用估算
    if torch.cuda.is_available():
        memory_allocated = torch.cuda.memory_allocated(0) / 1e9
        memory_reserved = torch.cuda.memory_reserved(0) / 1e9
        logger.info(f"Current VRAM usage: {memory_allocated:.2f} GB (allocated), {memory_reserved:.2f} GB (reserved)")
    
    return model, processor


# ============================================================================
# 训练函数
# ============================================================================

def train(config: TrainingConfig, data_dir: str, output_dir: str):
    """执行训练"""
    from transformers import TrainingArguments, Trainer
    
    # 创建输出目录
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # 加载数据（优先使用本地图像版本）
    use_local = getattr(config, "use_local_images", False)
    suffix = "_local" if use_local else ""
    train_data_path = Path(data_dir) / f"train{suffix}.jsonl"
    val_data_path = Path(data_dir) / f"validation{suffix}.jsonl"
    
    # Fallback to original if local version doesn't exist
    if use_local and not train_data_path.exists():
        logger.warning(f"Local image JSONL not found: {train_data_path}, falling back to original file")
        logger.warning("Please run first: python download_training_images.py")
        train_data_path = Path(data_dir) / "train.jsonl"
        val_data_path = Path(data_dir) / "validation.jsonl"
    
    if not train_data_path.exists():
        logger.error(f"Training data not found: {train_data_path}")
        sys.exit(1)
    
    logger.info(f"Using training data: {train_data_path}")
    
    # 加载模型
    model, processor = load_qlora_model(config)
    
    # 创建数据集
    train_dataset = PTCGCardDataset(
        str(train_data_path),
        processor,
        max_length=config.max_seq_length,
    )
    
    val_dataset = None
    if val_data_path.exists():
        val_dataset = PTCGCardDataset(
            str(val_data_path),
            processor,
            max_length=config.max_seq_length,
        )
    
    # 数据 collator
    data_collator = MemoryEfficientDataCollator(
        pad_token_id=processor.tokenizer.pad_token_id
    )
    
    # 训练参数
    training_args = TrainingArguments(
        output_dir=str(output_path),
        per_device_train_batch_size=config.batch_size,
        per_device_eval_batch_size=config.batch_size,
        gradient_accumulation_steps=config.gradient_accumulation_steps,
        num_train_epochs=config.num_epochs,
        learning_rate=config.learning_rate,
        warmup_ratio=config.warmup_ratio,
        lr_scheduler_type=config.lr_scheduler_type,
        
        # 精度
        bf16=config.bf16,
        fp16=config.fp16,
        
        # 优化
        # Adafactor: Blackwell-safe (no bnb), factored second moments cut lm_head
        # optimizer state from 4.36GB (fp32 m+v for 545M params) to ~2.18GB.
        # This keeps total VRAM ~16.5GB (within 17GB), eliminating paging/slowdowns.
        optim="adafactor",
        adafactor=True,  # Enables factored second moments; no momentum stored for large tensors
        gradient_checkpointing=config.gradient_checkpointing,
        max_grad_norm=config.max_grad_norm,
        
        # 保存和评估
        save_steps=config.save_steps,
        eval_steps=config.eval_steps,
        logging_steps=config.logging_steps,
        eval_strategy="no",  # Avoid importing HuggingFace datasets library (conflicts with local datasets/ dir)
        save_total_limit=3,
        
        # 数据加载
        dataloader_num_workers=config.dataloader_num_workers,
        dataloader_pin_memory=config.dataloader_pin_memory,
        
        # 其他
        seed=config.seed,
        report_to="none",
        remove_unused_columns=False,
        
        # 内存优化
        dataloader_drop_last=True,  # 丢弃最后不完整 batch
    )
    
    # 创建 Trainer (val_dataset disabled to avoid datasets/ namespace conflict)
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=None,
        data_collator=data_collator,
    )
    
    # 开始训练
    logger.info("Starting training...")
    logger.info(f"Training samples: {len(train_dataset)}")
    logger.info(f"Validation samples: {len(val_dataset) if val_dataset else 0}")
    logger.info(f"Batch size: {config.batch_size}")
    logger.info(f"Gradient accumulation steps: {config.gradient_accumulation_steps}")
    logger.info(f"Effective batch size: {config.batch_size * config.gradient_accumulation_steps}")
    
    train_result = trainer.train(resume_from_checkpoint=getattr(config, 'resume_from_checkpoint', None))
    
    # 保存模型
    logger.info("Saving model...")
    trainer.save_model(str(output_path / "final"))
    processor.save_pretrained(str(output_path / "final"))
    
    # 保存训练指标
    metrics = train_result.metrics
    with open(output_path / "training_metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)
    
    logger.info(f"Training complete! Metrics: {metrics}")
    
    # Final VRAM stats
    if torch.cuda.is_available():
        memory_allocated = torch.cuda.memory_allocated(0) / 1e9
        memory_reserved = torch.cuda.memory_reserved(0) / 1e9
        logger.info(f"Final VRAM usage: {memory_allocated:.2f} GB (allocated), {memory_reserved:.2f} GB (reserved)")
    
    return trainer, metrics


# ============================================================================
# 主函数
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="PTCG Qwen-VL QLoRA 微调 (16GB VRAM 优化)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 基础训练 (batch size 1)
  python finetune_qwen_vl.py --data-dir ./datasets --output-dir ./outputs
  
  # 自定义配置
  python finetune_qwen_vl.py \\
      --data-dir ./datasets \\
      --output-dir ./outputs \\
      --epochs 3 \\
      --batch-size 1 \\
      --gradient-accumulation-steps 16 \\
      --lora-r 16 \\
      --lora-alpha 32

显存优化提示:
  - 如果 OOM，减小 batch-size 或 max-seq-length
  - 增加 gradient-accumulation-steps 补偿小 batch
        """
    )
    
    # 数据参数
    parser.add_argument("--data-dir", type=str, default="./datasets",
                       help="数据目录")
    parser.add_argument("--output-dir", type=str, default="./outputs",
                       help="输出目录")
    parser.add_argument("--use-local-images", action="store_true", default=False,
                       help="使用本地缓存图像 (train_local.jsonl / validation_local.jsonl)")
    
    # 模型参数
    parser.add_argument("--model-name", type=str, default="Qwen/Qwen2.5-VL-7B-Instruct",
                       help="基础模型名称")
    
    # QLoRA 参数
    parser.add_argument("--load-in-4bit", action="store_true", default=True,
                       help="使用 4-bit 量化加载")
    parser.add_argument("--bnb-4bit-quant-type", type=str, default="nf4",
                       help="4-bit 量化类型")
    
    # LoRA 参数
    parser.add_argument("--lora-r", type=int, default=16,
                       help="LoRA rank")
    parser.add_argument("--lora-alpha", type=int, default=32,
                       help="LoRA alpha")
    parser.add_argument("--lora-dropout", type=float, default=0.05,
                       help="LoRA dropout")
    
    # 训练参数
    parser.add_argument("--epochs", type=int, default=3,
                       help="训练轮数")
    parser.add_argument("--batch-size", type=int, default=1,
                       help="每设备批大小 (16GB VRAM 推荐 1)")
    parser.add_argument("--gradient-accumulation-steps", type=int, default=16,
                       help="梯度累积步数")
    parser.add_argument("--learning-rate", type=float, default=2e-4,
                       help="学习率")
    parser.add_argument("--max-seq-length", type=int, default=1024,
                       help="最大序列长度")
    parser.add_argument("--warmup-ratio", type=float, default=0.05,
                       help="预热比例")
    
    # 精度参数
    parser.add_argument("--bf16", action="store_true", default=True,
                       help="使用 bfloat16")
    parser.add_argument("--fp16", action="store_true", default=False,
                       help="使用 float16")
    
    # 内存优化
    parser.add_argument("--gradient-checkpointing", action="store_true", default=True,
                       help="启用梯度检查点")
    parser.add_argument("--dataloader-workers", type=int, default=0,
                       help="数据加载 worker 数量 (0=main process, safe on Windows)")
    
    # 其他
    parser.add_argument("--seed", type=int, default=42,
                       help="随机种子")
    parser.add_argument("--resume-from-checkpoint", type=str, default=None,
                       help="从指定 checkpoint 路径继续训练")
    parser.add_argument("--save-steps", type=int, default=100,
                       help="保存步数")
    parser.add_argument("--eval-steps", type=int, default=50,
                       help="评估步数")
    
    args = parser.parse_args()
    
    # 创建配置
    config = TrainingConfig(
        model_name=args.model_name,
        load_in_4bit=args.load_in_4bit,
        bnb_4bit_quant_type=args.bnb_4bit_quant_type,
        lora_r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        num_epochs=args.epochs,
        batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.learning_rate,
        max_seq_length=args.max_seq_length,
        warmup_ratio=args.warmup_ratio,
        bf16=args.bf16,
        fp16=args.fp16,
        gradient_checkpointing=args.gradient_checkpointing,
        dataloader_num_workers=args.dataloader_workers,
        seed=args.seed,
        save_steps=args.save_steps,
        eval_steps=args.eval_steps,
    )
    # Attach extra args not in dataclass
    config.use_local_images = args.use_local_images
    config.resume_from_checkpoint = args.resume_from_checkpoint
    
    # 打印配置
    logger.info("=" * 70)
    logger.info("PTCG Qwen-VL QLoRA Fine-tuning Config (RTX 5070 Ti 16GB optimized)")
    logger.info("=" * 70)
    logger.info(f"Model: {config.model_name}")
    logger.info(f"4-bit quantization: {config.load_in_4bit}")
    logger.info(f"LoRA: r={config.lora_r}, alpha={config.lora_alpha}")
    logger.info(f"Batch size: {config.batch_size}")
    logger.info(f"Gradient accumulation: {config.gradient_accumulation_steps}")
    logger.info(f"Effective batch size: {config.batch_size * config.gradient_accumulation_steps}")
    logger.info(f"Max sequence length: {config.max_seq_length}")
    logger.info(f"Learning rate: {config.learning_rate}")
    logger.info(f"Epochs: {config.num_epochs}")
    logger.info("=" * 70)
    
    # 显存检查
    if torch.cuda.is_available():
        total_memory = torch.cuda.get_device_properties(0).total_memory / 1e9
        logger.info(f"Total GPU VRAM: {total_memory:.1f} GB")
        
        if total_memory < 15:
            logger.warning("⚠ VRAM < 15GB, may need to reduce batch size further")
    
    # 开始训练
    train(config, args.data_dir, args.output_dir)


if __name__ == "__main__":
    main()
