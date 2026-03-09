"""Verify patch count after image resize."""
from PIL import Image
from transformers import AutoProcessor
from pathlib import Path

p = AutoProcessor.from_pretrained("Qwen/Qwen2.5-VL-7B-Instruct", trust_remote_code=True)

MAX_LONG_EDGE = 168
imgs = list(Path("./image_cache").glob("*.jpg"))[:1]
img = Image.open(imgs[0]).convert("RGB")
print(f"Original: {img.size}, pixels: {img.size[0]*img.size[1]}")

w, h = img.size
long_edge = max(w, h)
scale = MAX_LONG_EDGE / long_edge
img2 = img.resize((max(14, int(round(w * scale))), max(14, int(round(h * scale)))), Image.LANCZOS)
print(f"Resized:  {img2.size}, pixels: {img2.size[0]*img2.size[1]}")

conv = [
    {"role": "user", "content": [
        {"type": "image", "image": img2},
        {"type": "text", "text": "Extract card info as JSON."}
    ]},
    {"role": "assistant", "content": [{"type": "text", "text": "{}"}]}
]
out = p.apply_chat_template(conv, tokenize=True, add_generation_prompt=False, return_dict=True, return_tensors="pt")
pv = out.get("pixel_values")
thw = out.get("image_grid_thw")
print(f"pixel_values: {pv.shape if pv is not None else None}")
print(f"image_grid_thw: {thw}")
if thw is not None:
    t, hh, ww = thw[0].tolist()
    patches = t * hh * ww
    print(f"ViT patches: {t}x{hh}x{ww} = {patches} (vs 704 = {704/patches:.1f}x reduction)")
    print(f"LLM visual tokens: {patches//4} (vs 176 before = {176/(patches//4):.1f}x reduction)")
    print(f"Attention cost ratio: {(patches/704)**2:.4f} ({((patches/704)**2)*100:.1f}% of original)")
