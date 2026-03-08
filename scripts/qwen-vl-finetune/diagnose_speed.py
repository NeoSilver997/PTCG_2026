"""Diagnose processor call timing to find the bottleneck."""
import time
from pathlib import Path
from PIL import Image
from transformers import AutoProcessor

p = AutoProcessor.from_pretrained("Qwen/Qwen2.5-VL-7B-Instruct", trust_remote_code=True)
ip = p.image_processor

print("max_pixels (attr):", ip.max_pixels)
print("size dict:", ip.size)

imgs = list(Path("./image_cache").glob("*.jpg"))[:1]
if not imgs:
    print("No images in cache!")
    exit(1)

img = Image.open(imgs[0]).convert("RGB")
print(f"Image size: {img.size}, pixels: {img.size[0]*img.size[1]}")

conv = [
    {"role": "user", "content": [
        {"type": "image", "image": img},
        {"type": "text", "text": "Extract card info as JSON."}
    ]},
    {"role": "assistant", "content": [{"type": "text", "text": '{"name":"test"}'}]}
]

# Default (max 12M pixels)
t0 = time.time()
for _ in range(3):
    out = p.apply_chat_template(conv, tokenize=True, add_generation_prompt=False, return_dict=True, return_tensors="pt")
default_t = (time.time()-t0)/3
pv = out.get("pixel_values")
thw = out.get("image_grid_thw")
print(f"\nDEFAULT: {default_t:.3f}s/call")
print(f"  pixel_values: {pv.shape if pv is not None else None}")
print(f"  image_grid_thw: {thw}")
if thw is not None:
    t, h, w = thw[0].tolist()
    print(f"  patches: {t}x{h}x{w} = {t*h*w} total")

# Fix size dict to cap at 200704 (256 patches max)
ip.size["longest_edge"] = 200704
ip.max_pixels = 200704
ip.min_pixels = 3136

t0 = time.time()
for _ in range(3):
    out2 = p.apply_chat_template(conv, tokenize=True, add_generation_prompt=False, return_dict=True, return_tensors="pt")
capped_t = (time.time()-t0)/3
pv2 = out2.get("pixel_values")
thw2 = out2.get("image_grid_thw")
print(f"\nCAPPED (200704): {capped_t:.3f}s/call")
print(f"  pixel_values: {pv2.shape if pv2 is not None else None}")
print(f"  image_grid_thw: {thw2}")
if thw2 is not None:
    t2, h2, w2 = thw2[0].tolist()
    print(f"  patches: {t2}x{h2}x{w2} = {t2*h2*w2} total")

# Also test use_fast=False
p_slow = AutoProcessor.from_pretrained("Qwen/Qwen2.5-VL-7B-Instruct", trust_remote_code=True, use_fast=False)
print(f"\nSlow processor max_pixels: {p_slow.image_processor.max_pixels}")
t0 = time.time()
for _ in range(3):
    out3 = p_slow.apply_chat_template(conv, tokenize=True, add_generation_prompt=False, return_dict=True, return_tensors="pt")
slow_t = (time.time()-t0)/3
pv3 = out3.get("pixel_values")
thw3 = out3.get("image_grid_thw")
print(f"SLOW PROC: {slow_t:.3f}s/call")
print(f"  pixel_values: {pv3.shape if pv3 is not None else None}")
print(f"  image_grid_thw: {thw3}")
if thw3 is not None:
    t3, h3, w3 = thw3[0].tolist()
    print(f"  patches: {t3}x{h3}x{w3} = {t3*h3*w3} total")

print(f"\nSpeedup (default->capped): {default_t/capped_t:.2f}x")
print(f"Speedup (default->slow): {default_t/slow_t:.2f}x")
