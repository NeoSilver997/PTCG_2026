#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
distill_to_3b.py  —  Fine-tune Qwen2.5-VL-3B on the PTCG dataset.

Strategy: Supervised fine-tuning with soft-label distillation from the 7B teacher.
          The teacher (qlora_v4 at 99% accuracy) generates answer distributions;
          the 3B student learns to match them via KL-divergence (in addition to CE loss).

Expected outcome: ~12s/image inference at 95-97% accuracy (vs 7B at 21s/99%).

Usage:
    # Standard SFT only (fast, ~96% expected):
    python distill_to_3b.py --data-dir ./datasets --output-dir ./outputs/qvl_3b_v1

    # Distillation from 7B teacher (slower training, ~97% expected):
    python distill_to_3b.py --data-dir ./datasets --output-dir ./outputs/qvl_3b_v1 \
        --teacher-adapter ./outputs/qlora_v4/final \
        --kd-alpha 0.5

    # Quick test (10 steps):
    python distill_to_3b.py --data-dir ./datasets --output-dir ./outputs/qvl_3b_test \
        --max-steps 10 --no-save

Requirements:
    Same venv as finetune_qwen_vl.py (transformers, peft, bitsandbytes, trl, pillow)
"""

import argparse
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Optional

import torch
from PIL import Image

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# ── Model IDs ────────────────────────────────────────────────────────────────
STUDENT_MODEL_ID = "Qwen/Qwen2.5-VL-3B-Instruct"
TEACHER_MODEL_ID = "Qwen/Qwen2.5-VL-7B-Instruct"  # base of qlora_v4

PROMPT = (
    "Look at this Pokemon Trading Card Game card image. "
    "Extract ALL visible information and return ONLY a JSON object. "
    "Return null for any field not visible. "
    'Format: {"name": "...", "hp": ..., "types": [...], "supertype": "...", '
    '"subtype": "...", "rarity": "...", "expansion": "...", "card_number": "...", '
    '"attacks": [{"name": "...", "cost": [...], "damage": "...", "effect": "..."}], '
    '"abilities": [{"name": "...", "type": "...", "effect": "..."}], '
    '"retreat_cost": ..., "artist": "..."}'
)


# ── Dataset ───────────────────────────────────────────────────────────────────
class PTCGDataset(torch.utils.data.Dataset):
    """
    Loads train.jsonl / train_local.jsonl.
    Each sample: messages list with image URL/path + text prompt + assistant answer.
    Images resolved from image_cache/ directory.
    """

    IMAGE_CACHE = Path(__file__).parent / "image_cache"

    def __init__(self, jsonl_path: Path, processor, max_samples: Optional[int] = None):
        self.processor = processor
        self.samples = []
        with open(jsonl_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    self.samples.append(json.loads(line))
                except Exception:
                    pass
        if max_samples:
            self.samples = self.samples[:max_samples]
        logger.info(f"Loaded {len(self.samples)} samples from {jsonl_path.name}")

    def _resolve_image(self, url_or_path: str) -> Optional[Image.Image]:
        """Try image_cache first, then data/images, then URL."""
        # image_cache has filenames derived from URL basename
        import urllib.parse
        basename = Path(urllib.parse.urlparse(url_or_path).path).name
        stem = Path(basename).stem

        # Try common extensions
        for ext in (".jpg", ".jpeg", ".png", ".webp"):
            p = self.IMAGE_CACHE / (stem + ext)
            if p.exists():
                img = Image.open(p)
                break
        else:
            # Fallback: try as direct path
            p = Path(url_or_path)
            if not p.exists():
                return None
            img = Image.open(p)

        if img.mode in ("RGBA", "P", "LA"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            bg.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
            return bg
        return img.convert("RGB")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        sample = self.samples[idx]
        messages = sample.get("messages", [])

        # Extract image URL and assistant answer
        image_url = None
        assistant_text = None
        for msg in messages:
            if msg.get("role") == "user":
                for c in msg.get("content", []):
                    if c.get("type") == "image":
                        image_url = c.get("image") or c.get("url")
            elif msg.get("role") == "assistant":
                for c in msg.get("content", []):
                    if c.get("type") == "text":
                        assistant_text = c.get("text", "")

        image = self._resolve_image(image_url) if image_url else None

        return {
            "image": image,
            "prompt": PROMPT,
            "answer": assistant_text or "{}",
        }


def collate_fn(batch, processor):
    """Convert batch of dicts to model inputs."""
    valid = [b for b in batch if b["image"] is not None]
    if not valid:
        return None

    conversations = [
        [{"role": "user", "content": [
            {"type": "image", "image": b["image"]},
            {"type": "text",  "text": b["prompt"]},
        ]}]
        for b in valid
    ]

    # Pad to same length
    inputs = processor.apply_chat_template(
        conversations[0],  # process one at a time (VLM batch is tricky)
        tokenize=True,
        add_generation_prompt=True,
        return_dict=True,
        return_tensors="pt",
    )
    # Encode expected answer
    answer_ids = processor.tokenizer(
        valid[0]["answer"],
        return_tensors="pt",
        add_special_tokens=False,
    ).input_ids

    return {"inputs": inputs, "answer_ids": answer_ids, "n": len(valid)}


# ── Teacher loading ───────────────────────────────────────────────────────────
def load_teacher(adapter_path: str):
    """Load 7B teacher in BnB 4-bit for KD logits."""
    from transformers import AutoProcessor, AutoModelForVision2Seq, BitsAndBytesConfig
    from peft import PeftModel, PeftConfig

    logger.info(f"Loading 7B teacher from {adapter_path} ...")
    peft_cfg = PeftConfig.from_pretrained(adapter_path)
    base_id = peft_cfg.base_model_name_or_path

    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )
    teacher_base = AutoModelForVision2Seq.from_pretrained(
        base_id, quantization_config=bnb, device_map="auto",
        attn_implementation="sdpa", trust_remote_code=True,
    )
    teacher = PeftModel.from_pretrained(teacher_base, adapter_path)
    teacher.eval()
    logger.info("Teacher loaded (7B BnB 4-bit)")
    return teacher


# ── Student loading ───────────────────────────────────────────────────────────
def load_student(output_dir: str, resume: bool = False):
    """Load 3B student in BnB 4-bit + LoRA."""
    from transformers import AutoProcessor, AutoModelForVision2Seq, BitsAndBytesConfig
    from peft import LoraConfig, get_peft_model, PeftModel

    logger.info(f"Loading 3B student: {STUDENT_MODEL_ID}")

    processor = AutoProcessor.from_pretrained(
        STUDENT_MODEL_ID,
        trust_remote_code=True,
        min_pixels=256 * 28 * 28,
        max_pixels=1280 * 28 * 28,
    )

    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )
    base = AutoModelForVision2Seq.from_pretrained(
        STUDENT_MODEL_ID,
        quantization_config=bnb,
        device_map="auto",
        attn_implementation="sdpa",
        trust_remote_code=True,
    )

    if resume and Path(output_dir).exists():
        logger.info(f"Resuming student from {output_dir}")
        model = PeftModel.from_pretrained(base, output_dir)
    else:
        lora_cfg = LoraConfig(
            r=16,
            lora_alpha=32,
            target_modules=["q_proj", "v_proj", "k_proj", "o_proj",
                            "gate_proj", "up_proj", "down_proj"],
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
        )
        model = get_peft_model(base, lora_cfg)

    model.print_trainable_parameters()
    return model, processor


# ── Training loop ─────────────────────────────────────────────────────────────
def train(args):
    from transformers import get_cosine_schedule_with_warmup

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── Student ──────────────────────────────────────────────────────────────
    student, processor = load_student(
        str(out_dir / "adapter"),
        resume=args.resume,
    )

    # ── Teacher (optional) ────────────────────────────────────────────────────
    teacher = None
    if args.teacher_adapter:
        teacher = load_teacher(args.teacher_adapter)
        logger.info(f"Knowledge distillation: alpha={args.kd_alpha}")

    # ── Dataset ───────────────────────────────────────────────────────────────
    data_dir = Path(args.data_dir)
    train_file = data_dir / "train_local.jsonl"
    if not train_file.exists():
        train_file = data_dir / "train.jsonl"

    dataset = PTCGDataset(train_file, processor, max_samples=args.max_samples)
    logger.info(f"Training on {len(dataset)} samples, 3B student")

    # ── Optimizer ────────────────────────────────────────────────────────────
    optimizer = torch.optim.AdamW(
        [p for p in student.parameters() if p.requires_grad],
        lr=args.lr,
        weight_decay=0.01,
    )
    total_steps = args.max_steps or (len(dataset) * args.epochs)
    scheduler = get_cosine_schedule_with_warmup(
        optimizer,
        num_warmup_steps=max(10, total_steps // 20),
        num_training_steps=total_steps,
    )

    student.train()
    step = 0
    losses = []

    logger.info(f"Starting training for {total_steps} steps ...")

    for epoch in range(args.epochs):
        for idx in range(len(dataset)):
            if args.max_steps and step >= args.max_steps:
                break

            item = dataset[idx]
            if item["image"] is None:
                continue

            # Build inputs
            conversation = [{"role": "user", "content": [
                {"type": "image", "image": item["image"]},
                {"type": "text",  "text": item["prompt"]},
            ]}]
            try:
                inputs = processor.apply_chat_template(
                    conversation,
                    tokenize=True,
                    add_generation_prompt=True,
                    return_dict=True,
                    return_tensors="pt",
                )
            except Exception as e:
                logger.warning(f"Sample {idx} skipped: {e}")
                continue

            answer_ids = processor.tokenizer(
                item["answer"],
                return_tensors="pt",
                add_special_tokens=False,
            ).input_ids

            inputs = {k: v.to(student.device) if hasattr(v, "to") else v
                      for k, v in inputs.items()}
            answer_ids = answer_ids.to(student.device)

            # Full sequence = prompt + answer
            full_ids = torch.cat([inputs["input_ids"], answer_ids], dim=1)
            labels = torch.full_like(full_ids, -100)
            labels[:, inputs["input_ids"].shape[1]:] = answer_ids  # supervise answer only

            try:
                student_out = student(
                    input_ids=full_ids,
                    attention_mask=torch.ones_like(full_ids),
                    pixel_values=inputs.get("pixel_values"),
                    image_grid_thw=inputs.get("image_grid_thw"),
                    labels=labels,
                )
                ce_loss = student_out.loss

                # KD loss (only on answer tokens)
                kd_loss = torch.tensor(0.0, device=student.device)
                if teacher is not None and args.kd_alpha > 0:
                    with torch.no_grad():
                        teacher_out = teacher(
                            input_ids=full_ids,
                            attention_mask=torch.ones_like(full_ids),
                            pixel_values=inputs.get("pixel_values"),
                            image_grid_thw=inputs.get("image_grid_thw"),
                        )
                    ans_start = inputs["input_ids"].shape[1]
                    student_logits = student_out.logits[:, ans_start - 1:-1, :]
                    teacher_logits = teacher_out.logits[:, ans_start - 1:-1, :]
                    T = 2.0  # temperature
                    kd_loss = torch.nn.functional.kl_div(
                        torch.nn.functional.log_softmax(student_logits / T, dim=-1),
                        torch.nn.functional.softmax(teacher_logits / T, dim=-1),
                        reduction="batchmean",
                    ) * (T ** 2)

                loss = (1 - args.kd_alpha) * ce_loss + args.kd_alpha * kd_loss

            except Exception as e:
                logger.warning(f"Step {step} forward error: {e}")
                continue

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(student.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            step += 1

            losses.append(loss.item())
            if step % 50 == 0:
                avg = sum(losses[-50:]) / len(losses[-50:])
                logger.info(f"Step {step}/{total_steps}  loss={avg:.4f}  lr={scheduler.get_last_lr()[0]:.2e}")

            # Save checkpoint every 200 steps
            if step % 200 == 0 and not args.no_save:
                ckpt = out_dir / f"checkpoint-{step}"
                student.save_pretrained(str(ckpt))
                processor.save_pretrained(str(ckpt))
                logger.info(f"Checkpoint saved: {ckpt}")

        if args.max_steps and step >= args.max_steps:
            break

    # ── Final save ────────────────────────────────────────────────────────────
    if not args.no_save:
        final = out_dir / "final"
        student.save_pretrained(str(final))
        processor.save_pretrained(str(final))

        metrics = {
            "steps": step,
            "final_loss": sum(losses[-20:]) / max(len(losses[-20:]), 1) if losses else None,
            "student_model": STUDENT_MODEL_ID,
            "teacher_adapter": args.teacher_adapter,
            "kd_alpha": args.kd_alpha,
        }
        (out_dir / "training_metrics.json").write_text(
            json.dumps(metrics, indent=2), encoding="utf-8"
        )
        logger.info(f"Training complete. Model saved to {final}")
        logger.info(f"Metrics: {metrics}")


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Fine-tune / distill Qwen2.5-VL-3B for PTCG")
    parser.add_argument("--data-dir",        default="./datasets",
                        help="Directory with train.jsonl / train_local.jsonl")
    parser.add_argument("--output-dir",      default="./outputs/qvl_3b_v1")
    parser.add_argument("--teacher-adapter", default=None,
                        help="Path to 7B LoRA adapter for KD (omit for pure SFT)")
    parser.add_argument("--kd-alpha",        type=float, default=0.3,
                        help="KD weight [0=pure SFT, 1=pure KD]")
    parser.add_argument("--epochs",          type=int,   default=3)
    parser.add_argument("--lr",              type=float, default=2e-4)
    parser.add_argument("--max-samples",     type=int,   default=None,
                        help="Cap training set size (for quick tests)")
    parser.add_argument("--max-steps",       type=int,   default=None,
                        help="Override epoch-based total steps")
    parser.add_argument("--resume",          action="store_true",
                        help="Resume from existing adapter in output-dir/adapter/")
    parser.add_argument("--no-save",         action="store_true",
                        help="Skip checkpoints (smoke-test mode)")
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("PTCG 3B Distillation Fine-tune")
    logger.info(f"  Student : {STUDENT_MODEL_ID}")
    logger.info(f"  Teacher : {args.teacher_adapter or 'None (pure SFT)'}")
    logger.info(f"  KD alpha: {args.kd_alpha}")
    logger.info(f"  Output  : {args.output_dir}")
    logger.info("=" * 60)

    train(args)


if __name__ == "__main__":
    main()
