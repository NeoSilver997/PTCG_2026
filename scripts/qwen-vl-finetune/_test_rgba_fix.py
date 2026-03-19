"""Test with proper RGBA→RGB (white bg) conversion and upscaling small images"""
import requests, base64, time
from pathlib import Path
from io import BytesIO
from PIL import Image

BASE = "http://192.168.50.56:11434"
MODEL = "ptcg-card-reader-v4:latest"
DB = Path("C:/AI_Server/Coding/PTCG_2026/data/images/cards")
PROMPT = "Extract card info as JSON: name, hp, types, rarity, setCode, cardNumber. Return only JSON."

def load_img(p):
    img = Image.open(p)
    if img.mode in ("RGBA", "P", "LA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        if img.mode in ("RGBA", "LA"):
            bg.paste(img, mask=img.split()[-1])
        else:
            bg.paste(img)
        img = bg
    else:
        img = img.convert("RGB")
    # Fit to 448px: upscale OR downscale
    TARGET = 448
    scale = TARGET / max(img.size)
    new_size = (int(img.width * scale), int(img.height * scale))
    img = img.resize(new_size, Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return img.size, base64.b64encode(buf.getvalue()).decode()

def run(p):
    size, b64 = load_img(p)
    payload = {
        "model": MODEL, "prompt": PROMPT, "images": [b64],
        "stream": False, "options": {"temperature": 0, "num_predict": 300}
    }
    t0 = time.time()
    resp = requests.post(f"{BASE}/api/generate", json=payload, timeout=60)
    elapsed = time.time() - t0
    text = resp.json().get("response", "")
    ok = "{" in text[:30]
    print(f"  {p.parent.name}/{p.name}  orig_size={Image.open(p).size} -> {size}  {elapsed:.1f}s  {'OK' if ok else 'FAIL'}  {text[:80]}")

print("=== HK SV08 cards (white bg, proper size) ===")
for p in list((DB / "hk/SV08").glob("*.png"))[:4]:
    run(p)

print("\n=== JP sv9 cards ===")
for p in list((DB / "japan/sv9").glob("*.png"))[:4]:
    run(p)

print("\n=== legacy HK cards ===")
for p in list((DB / "japan_legacy").glob("*.png"))[:4]:
    run(p)
