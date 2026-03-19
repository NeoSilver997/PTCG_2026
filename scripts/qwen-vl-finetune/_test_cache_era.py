"""Test cache SV-era images vs old XY-era images"""
import requests, base64, time
from pathlib import Path
from io import BytesIO
from PIL import Image

BASE = "http://192.168.50.56:11434"
MODEL = "ptcg-card-reader-v4:latest"
CACHE = Path("C:/AI_Server/Coding/PTCG_2026/scripts/qwen-vl-finetune/image_cache")
PROMPT = "Extract card info as JSON: name, hp, types, rarity, setCode, cardNumber. Return only JSON."

def test_img(img_path):
    img = Image.open(img_path).convert("RGB")
    if max(img.size) > 448:
        img.thumbnail((448, 448), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode()
    payload = {
        "model": MODEL,
        "prompt": PROMPT,
        "images": [b64],
        "stream": False,
        "options": {"temperature": 0, "num_predict": 400}
    }
    t0 = time.time()
    resp = requests.post(f"{BASE}/api/generate", json=payload, timeout=60)
    elapsed = time.time() - t0
    text = resp.json().get("response", "")
    return elapsed, text

# SV-era (hk00014xxx = SV training data)
print("=== SV-era HK cards (from training cache) ===")
hk_sv = sorted([f for f in CACHE.glob("hk00014*.jpg")])[:5]
for p in hk_sv:
    elapsed, text = test_img(p)
    ok = "{" in text[:50]
    print(f"  {p.name}  {elapsed:.1f}s  {'OK' if ok else 'FAIL'}  {text[:100]}")

# SV-era JP cards (04xxxx)
print("\n=== SV-era JP cards (04xxxx from cache) ===")
jp_sv = sorted([f for f in CACHE.glob("04*.jpg")])[:5]
for p in jp_sv:
    elapsed, text = test_img(p)
    ok = "{" in text[:50]
    print(f"  {p.name}  {elapsed:.1f}s  {'OK' if ok else 'FAIL'}  {text[:100]}")

# Old XY-era JP cards (03xxxx)  
print("\n=== XY-era JP cards (03xxxx from cache) ===")
jp_xy = sorted([f for f in CACHE.glob("03*.jpg")])[:5]
for p in jp_xy:
    elapsed, text = test_img(p)
    ok = "{" in text[:50]
    print(f"  {p.name}  {elapsed:.1f}s  {'OK' if ok else 'FAIL'}  {text[:100]}")
