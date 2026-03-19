"""Test with known-working test_sample images using /api/generate"""
import json, requests, base64, time
from pathlib import Path
from io import BytesIO
from PIL import Image

BASE = "http://192.168.50.56:11434"
MODEL = "ptcg-card-reader-v4:latest"
TEST_SAMPLE = Path("C:/AI_Server/Coding/PTCG_2026/data/test_sample")
PROMPT = "Extract card info as JSON: name, hp, types, rarity, setCode, cardNumber."

def test_image(img_path):
    img = Image.open(img_path).convert("RGB")
    orig_size = img.size
    if max(img.size) > 448:
        img.thumbnail((448, 448), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode()

    # Try /api/generate
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
    text = resp.json().get("response", "")[:150]
    print(f"  {img_path.name} ({orig_size[0]}x{orig_size[1]} -> {img.size[0]}x{img.size[1]}) {elapsed:.1f}s: {repr(text[:100])}")

images = list(TEST_SAMPLE.glob("*.png")) + list(TEST_SAMPLE.glob("*.jpg"))
print(f"Testing {len(images)} images from test_sample:")
for img_path in sorted(images)[:8]:
    test_image(img_path)
