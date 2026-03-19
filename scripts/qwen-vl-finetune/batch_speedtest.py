"""
True batch inference test: process N images simultaneously via model.generate(batch).
Compare per-card throughput for batch=1 vs batch=2 vs batch=4.
"""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(__file__))

import torch
from pathlib import Path
from PIL import Image
from transformers import AutoProcessor, AutoModelForVision2Seq
from peft import PeftModel
from transformers import BitsAndBytesConfig

ADAPTER = "./outputs/qlora_v4/final"
BASE_ID  = "Qwen/Qwen2.5-VL-7B-Instruct"
IMAGE_DIR = "./image_cache"
PROMPT = (
    "Look at this Pokemon Trading Card Game card image. "
    "Extract ALL visible information and return ONLY a JSON object. "
    'Return null for any field not visible. Format: {"name":"...","hp":...,'
    '"types":[...],"supertype":"...","subtype":"...","rarity":"...",'
    '"expansion":"...","card_number":"...",'
    '"attacks":[{"name":"...","cost":[...],"damage":"...","effect":"..."}],'
    '"abilities":[{"name":"...","type":"...","effect":"..."}],'
    '"retreat_cost":...,"artist":"..."}'
)

# ── load model ──────────────────────────────────────────────────────────────
print("Loading model (4bit BnB)...")
t_load = time.time()
bnb = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_use_double_quant=True,
)
processor = AutoProcessor.from_pretrained(BASE_ID, trust_remote_code=True,
                                          use_fast=True)
processor.tokenizer.padding_side = "left"   # required for batch generate

base = AutoModelForVision2Seq.from_pretrained(
    BASE_ID, quantization_config=bnb, device_map="auto",
    attn_implementation="sdpa", trust_remote_code=True,
)
model = PeftModel.from_pretrained(base, ADAPTER)
model.eval()
torch.backends.cuda.enable_flash_sdp(True)
torch.backends.cuda.enable_mem_efficient_sdp(True)
print(f"Model loaded in {time.time()-t_load:.1f}s")

CARD_FILES = sorted(Path(IMAGE_DIR).glob("*.jpg"))[:8]
print(f"\nFound {len(CARD_FILES)} test images")


def run_batch(images, max_new_tokens=300):
    """Run true batch generate on a list of PIL images. Returns (tok/s, seconds)"""
    conversations = [
        [{"role": "user", "content": [
            {"type": "image", "image": img},
            {"type": "text",  "text": PROMPT},
        ]}]
        for img in images
    ]
    inputs = processor.apply_chat_template(
        conversations, tokenize=True, add_generation_prompt=True,
        return_dict=True, return_tensors="pt", padding=True,
    )
    inputs = {k: v.to(model.device) if hasattr(v, "to") else v
              for k, v in inputs.items()}

    t0 = time.time()
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            pad_token_id=processor.tokenizer.eos_token_id,
        )
    elapsed = time.time() - t0

    n_in  = inputs["input_ids"].shape[1]
    n_out = (out.shape[1] - n_in) * len(images)   # total output tokens across batch
    tps   = n_out / elapsed
    return tps, elapsed, n_out


print("\n" + "="*60)
print("BATCH SIZE COMPARISON")
print("="*60)

all_images = [Image.open(p).convert("RGB") for p in CARD_FILES[:8]]

for batch_size in [1, 2, 4]:
    imgs = all_images[:batch_size]
    # warm-up (first run always slower due to CUDA graph capture)
    if batch_size == 1:
        print(f"\n[Batch={batch_size}] Warming up...")
        _, _, _ = run_batch(imgs)

    print(f"\n[Batch={batch_size}] Running 2 trials...")
    timings = []
    for trial in range(2):
        tps, elapsed, total_out = run_batch(imgs)
        per_card = elapsed / batch_size
        timings.append(per_card)
        print(f"  Trial {trial+1}: {elapsed:.1f}s total → {per_card:.1f}s/card "
              f"| {tps:.1f} tok/s | {total_out} tokens")

    avg = sum(timings) / len(timings)
    print(f"  → Average: {avg:.1f}s/card (batch={batch_size})")

print("\n[Done]")
