"""
Benchmark fine-tuned Qwen2.5-VL LoRA model on test_sample images.
Uses 4-bit quantization (same as training) to fit in 16GB VRAM.
"""
import os
import sys

# Fix: remove script dir from sys.path to prevent datasets/ shadowing HF package
_script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path = [p for p in sys.path if os.path.normpath(p) not in (os.path.normpath(_script_dir), '')]

import json
import time
import logging
import argparse
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("huggingface_hub").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

import torch
from PIL import Image
from transformers import AutoProcessor, BitsAndBytesConfig

try:
    from transformers import AutoModelForVision2Seq
except ImportError:
    from transformers import AutoModelForImageTextToText as AutoModelForVision2Seq

from peft import PeftConfig, PeftModel

PROMPT = (
    "Look at this Pokemon Trading Card Game card image carefully.\n"
    "Extract ALL visible information and respond with ONLY a JSON object (no markdown):\n"
    '{"name": "...", "hp": ..., "types": [...], "supertype": "...", "rarity": "...", '
    '"attacks": [...], "abilities": [...], "retreat_cost": ..., "expansion": "...", '
    '"card_number": "..."}'
)


def load_model(adapter_path, base_override=None):
    peft_cfg = PeftConfig.from_pretrained(adapter_path)
    base_model_id = base_override or peft_cfg.base_model_name_or_path
    logger.info(f"Base model: {base_model_id}")

    processor = AutoProcessor.from_pretrained(base_model_id, trust_remote_code=True)

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )
    logger.info("Loading base model (4-bit quantization)...")
    base_model = AutoModelForVision2Seq.from_pretrained(
        base_model_id,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    logger.info("Applying LoRA adapter...")
    model = PeftModel.from_pretrained(base_model, adapter_path)
    model.eval()

    mem = torch.cuda.memory_allocated() / 1e9
    logger.info(f"Model ready. VRAM allocated: {mem:.2f} GB")
    return model, processor


def run_inference(model, processor, image_path):
    image = Image.open(image_path).convert("RGB")
    conversation = [
        {"role": "user", "content": [
            {"type": "image", "image": image},
            {"type": "text", "text": PROMPT},
        ]}
    ]
    inputs = processor.apply_chat_template(
        conversation,
        tokenize=True,
        add_generation_prompt=True,
        return_dict=True,
        return_tensors="pt",
    )
    inputs = {k: v.to(model.device) if hasattr(v, "to") else v for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=512,
            do_sample=False,
            pad_token_id=processor.tokenizer.eos_token_id,
        )

    gen_ids = outputs[0][inputs["input_ids"].shape[1]:]
    text = processor.decode(gen_ids, skip_special_tokens=True).strip()
    return text


def parse_json(text):
    import re
    if not text:
        return None
    # Try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass
    # Extract JSON block
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except Exception:
            pass
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter", default="./outputs/qlora_v1/final")
    parser.add_argument("--image-dir", default="C:/AI_Server/Coding/PTCG_2026/data/test_sample")
    parser.add_argument("--output-dir", default="./benchmarks/finetuned_v1")
    parser.add_argument("--samples", type=int, default=22)
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    logger.info("=" * 60)
    logger.info("Fine-tuned LoRA benchmark")
    logger.info("=" * 60)

    model, processor = load_model(args.adapter)

    image_dir = Path(args.image_dir)
    image_files = sorted([
        f for f in image_dir.iterdir()
        if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")
    ])[:args.samples]

    logger.info(f"Found {len(image_files)} images in {image_dir}")

    results = []
    success_count = 0
    inference_times = []

    for i, img_path in enumerate(image_files):
        t0 = time.time()
        try:
            raw_text = run_inference(model, processor, img_path)
            elapsed = time.time() - t0
            parsed = parse_json(raw_text)
            ok = parsed is not None
            if ok:
                success_count += 1
            inference_times.append(elapsed)
            status = "OK  " if ok else "FAIL"
            name_preview = parsed.get("name", "?")[:20] if parsed else "?"
            logger.info(f"[{i+1:3d}/{len(image_files)}] {status} {img_path.name:35s} {elapsed:.1f}s  name={name_preview}")
            results.append({
                "idx": i, "file": img_path.name,
                "success": ok, "inference_time": elapsed,
                "raw_text": raw_text[:500], "parsed": parsed,
            })
        except Exception as e:
            elapsed = time.time() - t0
            logger.error(f"[{i+1:3d}/{len(image_files)}] ERROR {img_path.name}: {e}")
            results.append({
                "idx": i, "file": img_path.name,
                "success": False, "inference_time": elapsed,
                "raw_text": f"ERROR: {e}", "parsed": None,
            })

    n = len(image_files)
    rate = success_count / n * 100 if n else 0
    avg_t = sum(inference_times) / len(inference_times) if inference_times else 0

    logger.info("=" * 60)
    logger.info("RESULTS")
    logger.info("=" * 60)
    logger.info(f"  Images:       {n}")
    logger.info(f"  Success:      {success_count} ({rate:.1f}%)")
    logger.info(f"  Avg time:     {avg_t:.1f}s")
    logger.info(f"  Total time:   {sum(inference_times)/60:.1f} min")

    from datetime import datetime
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = {
        "timestamp": datetime.now().isoformat(),
        "adapter": args.adapter,
        "image_dir": args.image_dir,
        "total": n, "success": success_count, "success_rate": rate,
        "avg_inference_time_sec": avg_t,
        "results": results,
    }
    json_path = Path(args.output_dir) / f"finetuned_results_{ts}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    # Print first 3 raw outputs for debugging
    logger.info("\n--- First 3 raw outputs ---")
    for r in results[:3]:
        logger.info(f"  {r['file']}: {repr(r['raw_text'][:200])}")

    logger.info(f"\nResults saved to {json_path}")


if __name__ == "__main__":
    main()
