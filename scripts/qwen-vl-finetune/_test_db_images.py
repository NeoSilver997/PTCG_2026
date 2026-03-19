"""Quick test: does the model work on data/images/cards SV-era images?"""
import requests, base64, time
from pathlib import Path
from io import BytesIO
from PIL import Image

BASE = "http://192.168.50.56:11434"
MODEL = "ptcg-card-reader-v4:latest"
DB_IMAGES = Path("C:/AI_Server/Coding/PTCG_2026/data/images/cards")

def test_img(img_path):
    img = Image.open(img_path).convert("RGB")
    if max(img.size) > 448:
        img.thumbnail((448, 448), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode()
    payload = {
        "model": MODEL,
        "prompt": "Extract card info as JSON: name, hp, types, rarity, setCode, cardNumber.",
        "images": [b64],
        "stream": False,
        "options": {"temperature": 0, "num_predict": 400}
    }
    t0 = time.time()
    resp = requests.post(f"{BASE}/api/generate", json=payload, timeout=60)
    elapsed = time.time() - t0
    text = resp.json().get("response", "")
    return elapsed, text[:120]

# Test a few HK and JP images from the actual DB
test_paths = []
for region_dir in ["hk/SV08", "japan/sv9", "japan/sv8"]:
    files = list((DB_IMAGES / region_dir).glob("*.png"))[:3]
    test_paths.extend(files)

print(f"Testing {len(test_paths)} images from data/images/cards:")
for p in test_paths:
    elapsed, text = test_img(p)
    is_json = text.strip().startswith("{")
    print(f"  {p.parent.name}/{p.name}  {elapsed:.1f}s  {'OK' if is_json else 'FAIL'}  {text[:80]}")
