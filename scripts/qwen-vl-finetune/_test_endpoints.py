"""Quick endpoint test: /api/generate vs /api/chat"""
import json, requests, base64, time
from pathlib import Path
from io import BytesIO
from PIL import Image

CACHE = Path("./image_cache")
cached = CACHE / "030610_P_YANYANMA.jpg"
img = Image.open(BytesIO(cached.read_bytes())).convert("RGB")
img.thumbnail((448, 448), Image.LANCZOS)
buf = BytesIO()
img.save(buf, format="JPEG", quality=85)
b64 = base64.b64encode(buf.getvalue()).decode()
print(f"Resized to: {img.size}, b64 len: {len(b64)}")

PROMPT = "Extract card info as JSON: name, hp, types, rarity, setCode, cardNumber."
MODEL = "ptcg-card-reader-v4:latest"
BASE = "http://192.168.50.56:11434"

print("\n--- Testing /api/generate ---")
payload = {
    "model": MODEL,
    "prompt": PROMPT,
    "images": [b64],
    "stream": False,
    "options": {"temperature": 0, "num_predict": 400}
}
t0 = time.time()
resp = requests.post(f"{BASE}/api/generate", json=payload, timeout=120)
elapsed = time.time() - t0
print(f"Status: {resp.status_code}, time: {elapsed:.2f}s")
data = resp.json()
print(f"Response: {data.get('response', '')[:300]}")

print("\n--- Testing /api/chat ---")
payload2 = {
    "model": MODEL,
    "messages": [{"role": "user", "content": PROMPT, "images": [b64]}],
    "stream": False,
    "think": False,
    "options": {"temperature": 0, "num_predict": 400}
}
t0 = time.time()
resp2 = requests.post(f"{BASE}/api/chat", json=payload2, timeout=120)
elapsed2 = time.time() - t0
print(f"Status: {resp2.status_code}, time: {elapsed2:.2f}s")
data2 = resp2.json()
print(f"Response: {data2.get('message', {}).get('content', '')[:300]}")
