import json
from pathlib import Path
from collections import Counter

ds = Path("C:/AI_Server/Coding/PTCG_2026/scripts/qwen-vl-finetune/datasets/test.jsonl")
samples = [json.loads(l) for l in ds.read_text(encoding="utf-8").splitlines() if l.strip()]

regs = Counter(s.get("metadata", {}).get("regulationMark", "N/A") for s in samples)
langs = Counter(s.get("metadata", {}).get("language", "?") for s in samples)
print("Regulation marks:", dict(regs.most_common()))
print("Languages:", dict(langs.most_common()))

print("\nSample image URLs:")
for s in samples[:8]:
    m = s.get("metadata", {})
    img = None
    for msg in s.get("messages", []):
        if msg["role"] == "user":
            for c in msg.get("content", []):
                if c.get("type") == "image":
                    img = c.get("image", "")
    wid = m.get("webCardId", "?")
    reg = m.get("regulationMark", "?")
    print(f"  {wid:12s} reg={reg}  {img[:90] if img else 'N/A'}")
