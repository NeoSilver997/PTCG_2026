 # PTCG Card Extraction Service — API Reference

Base URL: `http://localhost:8000`  
Content-Type: `application/json` (unless uploading a file)

---

## Endpoints

### `GET /health`

Check if the service and model are ready.

**Response**

```json
{ "status": "healthy", "model_loaded": true }
```

| Field | Type | Description |
|---|---|---|
| `status` | `string` | `"healthy"` or `"unhealthy"` |
| `model_loaded` | `boolean` | Whether the model has finished loading |

---

### `POST /api/cards/extract-from-image`

Extract card data from a raw image file upload (multipart form-data).

**Request** — `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | file | ✅ | JPEG/PNG card image. Max 10 MB. |
| `language` | string | ❌ | Output language hint. One of `en-US`, `ja-JP`, `zh-HK`. Default: `en-US`. |

**Example (curl)**

```bash
curl -X POST http://localhost:8000/api/cards/extract-from-image \
  -F "image=@card.jpg" \
  -F "language=ja-JP"
```

**Example (Python)**

```python
import requests

with open("card.jpg", "rb") as f:
    resp = requests.post(
        "http://localhost:8000/api/cards/extract-from-image",
        files={"image": ("card.jpg", f, "image/jpeg")},
        data={"language": "en-US"},
    )
print(resp.json())
```

**Response** — [`ExtractionResponse`](#ExtractionResponse)

---

### `POST /api/cards/extract-from-base64`

Extract card data from a base64-encoded image string.

**Request** — form fields (application/x-www-form-urlencoded)

| Field | Type | Required | Description |
|---|---|---|---|
| `image_base64` | string | ✅ | Standard base64 encoding of the image file bytes. |
| `language` | string | ❌ | `en-US` / `ja-JP` / `zh-HK`. Default: `en-US`. |

**Example (curl)**

```bash
B64=$(base64 -w 0 card.jpg)
curl -X POST http://localhost:8000/api/cards/extract-from-base64 \
  -d "image_base64=$B64" \
  -d "language=en-US"
```

**Example (Python)**

```python
import base64, requests

with open("card.jpg", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

resp = requests.post(
    "http://localhost:8000/api/cards/extract-from-base64",
    data={"image_base64": b64, "language": "en-US"},
)
print(resp.json())
```

**Response** — [`ExtractionResponse`](#ExtractionResponse)

---

### `POST /api/cards/batch-extract`

Extract card data from multiple images in a single GPU call.  
**Optimal throughput:** batch size 8–9 (~4.2 s/card vs 28 s/card sequential).  
**Maximum batch size:** 10.

**Request** — `application/json`

```json
{
  "images": ["<base64_image_1>", "<base64_image_2>", "..."]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `images` | `string[]` | ✅ | Array of base64-encoded image strings. Max 10 items. |

Query param:

| Param | Type | Default | Description |
|---|---|---|---|
| `language` | string | `en-US` | `en-US` / `ja-JP` / `zh-HK` |

**Example (curl)**

```bash
B64_1=$(base64 -w 0 card1.jpg)
B64_2=$(base64 -w 0 card2.jpg)

curl -X POST "http://localhost:8000/api/cards/batch-extract?language=en-US" \
  -H "Content-Type: application/json" \
  -d "{\"images\": [\"$B64_1\", \"$B64_2\"]}"
```

**Example (Python)**

```python
import base64, requests

def to_b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

payload = {"images": [to_b64("card1.jpg"), to_b64("card2.jpg")]}
resp = requests.post(
    "http://localhost:8000/api/cards/batch-extract",
    json=payload,
    params={"language": "en-US"},
)
print(resp.json())
```

**Response** — [`BatchExtractionResponse`](#BatchExtractionResponse)

---

## Data Models

### `ExtractionResponse`

Returned by all single-image endpoints.

```json
{
  "success": true,
  "data": { ... },
  "confidence": 0.92,
  "inference_time_ms": 4200.5,
  "prefill_ms": 0.0,
  "decode_ms": 4200.5,
  "tokens_in": 1024,
  "tokens_out": 198,
  "warnings": [],
  "error": null
}
```

| Field | Type | Description |
|---|---|---|
| `success` | `boolean` | `true` if extraction succeeded |
| `data` | [`CardExtraction`](#CardExtraction) \| `null` | Extracted card fields |
| `confidence` | `float` | Model confidence score 0–1. Values < 0.7 trigger a warning. |
| `inference_time_ms` | `float` | Total wall-clock inference time in ms |
| `prefill_ms` | `float` | Prefill (prompt encoding) phase time in ms |
| `decode_ms` | `float` | Token generation phase time in ms |
| `tokens_in` | `integer` | Input token count (visual + text prompt) |
| `tokens_out` | `integer` | Output token count generated |
| `warnings` | `string[]` | Warning messages (e.g. low confidence) |
| `error` | `string` \| `null` | Error message if `success` is `false` |

---

### `BatchExtractionResponse`

Returned by `/api/cards/batch-extract`.

```json
{
  "success": true,
  "results": [ { ... }, { ... } ],
  "total_time_ms": 8500.0
}
```

| Field | Type | Description |
|---|---|---|
| `success` | `boolean` | `true` if the batch call itself succeeded |
| `results` | `ExtractionResponse[]` | Per-image results in the same order as the request |
| `total_time_ms` | `float` | Wall-clock time for the entire batch call |

Each item in `results` follows the [`ExtractionResponse`](#ExtractionResponse) schema.  
Individual images that fail to decode will have `success: false` and `error` set, while other images still return normally.

---

### `CardExtraction`

Parsed card fields returned in `ExtractionResponse.data`.

```json
{
  "name": "Pikachu",
  "hp": 70,
  "type": "Lightning",
  "types": ["Lightning"],
  "subtype": "Basic",
  "subtypes": ["Basic"],
  "supertype": "Pokémon",
  "abilities": [
    { "name": "Static", "type": "Ability", "effect": "..." }
  ],
  "attacks": [
    { "name": "Thunder Shock", "cost": ["Lightning"], "damage": "20", "effect": "..." }
  ],
  "weakness": { "type": "Fighting", "value": "×2" },
  "resistance": null,
  "retreatCost": 1,
  "setCode": "SV9",
  "cardNumber": "071",
  "rarity": "Common",
  "artist": "Atsuko Nishida",
  "evolutionStage": "Basic",
  "evolvesFrom": null,
  "flavorText": "..."
}
```

All fields are optional and may be `null` if the model could not extract them.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Card name (in source language) |
| `hp` | `integer` | Hit Points |
| `type` | `string` | Primary type (convenience alias for `types[0]`) |
| `types` | `string[]` | All energy types (e.g. `["Fire", "Water"]`) |
| `subtype` | `string` | Card subtype (convenience alias) |
| `subtypes` | `string[]` | All subtypes (e.g. `["Stage 2", "VSTAR"]`) |
| `supertype` | `string` | `"Pokémon"`, `"Trainer"`, or `"Energy"` |
| `abilities` | `object[]` | Ability objects with `name`, `type`, `effect` |
| `attacks` | `object[]` | Attack objects with `name`, `cost`, `damage`, `effect` |
| `weakness` | `object` \| `null` | `{ type, value }` e.g. `{ "type": "Fire", "value": "×2" }` |
| `resistance` | `object` \| `null` | `{ type, value }` |
| `retreatCost` | `integer` \| `null` | Number of colorless energy to retreat |
| `setCode` | `string` | Expansion set code (e.g. `"SV9"`) |
| `cardNumber` | `string` | Card number within set (e.g. `"071"`) |
| `rarity` | `string` | Rarity label (e.g. `"Common"`, `"Double Rare"`) |
| `artist` | `string` | Illustrator name |
| `evolutionStage` | `string` | `"Basic"`, `"Stage 1"`, `"Stage 2"`, etc. |
| `evolvesFrom` | `string` | Pre-evolution name |
| `flavorText` | `string` | Flavor/Dex text on the card |

---

## Error Responses

HTTP error responses use FastAPI's default format:

```json
{ "detail": "error description" }
```

| Status | When |
|---|---|
| `400 Bad Request` | File too large, not an image, batch > 10 items |
| `503 Service Unavailable` | Model not yet loaded (startup in progress) |

---

## Service Launch Reference

```powershell
$py = "C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune\.venv312\Scripts\python.exe"
Set-Location "C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune"

Start-Process -FilePath $py `
  -ArgumentList "inference_service.py --adapter ./outputs/qlora_v4/final --port 8000 --no-compile --quantize 4bit" `
  -RedirectStandardOutput ".\outputs\inference_service.log" `
  -RedirectStandardError  ".\outputs\inference_service_err.log" -NoNewWindow
```

**CLI flags**

| Flag | Default | Description |
|---|---|---|
| `--adapter` | `./outputs/qlora_v4/final` | Path to LoRA adapter directory |
| `--port` | `8000` | HTTP port |
| `--host` | `0.0.0.0` | Bind address |
| `--quantize` | `4bit` | Quantization: `4bit` (recommended) / `int8` / `bf16` |
| `--no-compile` | off | Disable `torch.compile` (required on sm_120 / Blackwell) |
| `--flash-attn` | off | Enable Flash Attention (sm_80/90 only — not sm_120) |
| `--max-pixels` | `1003520` | Max image resolution in pixels fed to vision encoder |
| `--min-pixels` | `200704` | Min image resolution in pixels |

---

## Performance Reference

| Batch size | Time/card | Throughput |
|---|---|---|
| 1 (sequential) | ~28 s | 9.8 tok/s |
| 4 | ~8.2 s | 34.2 tok/s |
| 8 | ~4.6 s | 52.4 tok/s |
| 9 (sweet spot) | ~4.2 s | 57.2 tok/s |

Accuracy (qlora_v4, BnB 4-bit): **99%** (100-card random test).

---

## Multi-Card Scan Pipeline

For scanning real-world photos that may contain **more than one card**, use
`pipeline_scan.py`. It combines Stage 1 detection (Ollama `glm-ocr`) with
the fast finetuned batch-extract endpoint.

### How it works

```
Photo(s)
  │
  ▼ Stage 1 — glm-ocr (Ollama)
  │  Detects N cards + bounding boxes per photo  (~5-10s/photo)
  │
  ▼ Crop each card region
  │
  ▼ Stage 2 — /api/cards/batch-extract
     All crops sent in one GPU call, max 10 per batch  (~4.2s/card @ batch=9)
     Returns structured JSON per card
```

### Usage

```powershell
# Prerequisites: inference service running on port 8000, Ollama running on 11434
cd C:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune

$py = ".\.venv312\Scripts\python.exe"

# Scan a full directory (auto-detects card count per photo)
& $py pipeline_scan.py --image-dir "C:\path\to\photos" --language ja-JP

# Scan a single photo with multiple cards
& $py pipeline_scan.py --image "photo_with_3_cards.jpg"

# Skip detection (1 card per image assumed, ~2× faster total)
& $py pipeline_scan.py --image-dir "C:\path\to\singles" --no-detect

# Custom batch size (default 9, max 10)
& $py pipeline_scan.py --image-dir "C:\path" --batch-size 8
```

### CLI flags

| Flag | Default | Description |
|---|---|---|
| `--image-dir` | `data/test_sample` | Directory of photos to scan |
| `--image` | — | Single image path (overrides `--image-dir`) |
| `--service-url` | `http://localhost:8000` | Inference service URL |
| `--ollama-url` | `http://localhost:11434` | Ollama URL for Stage 1 |
| `--detect-model` | `glm-ocr:latest` | Ollama model for card detection |
| `--no-detect` | off | Skip Stage 1, assume 1 card per image |
| `--batch-size` | `9` | Cards per extraction batch (max 10) |
| `--language` | `en-US` | `en-US` / `ja-JP` / `zh-HK` |
| `--timeout-detect` | `10` | Stage 1 timeout per image (seconds) |
| `--timeout-extract` | `120` | Stage 2 batch timeout (seconds) |
| `--output-dir` | `./benchmarks/scan` | Output directory |

### Output files

| File | Description |
|---|---|
| `scan_results_<ts>.json` | Full results with all extracted fields per card |
| `report_<ts>.html` | Visual HTML report with card thumbnails |

### Example output JSON

```json
{
  "timestamp": "2026-03-09T14:00:00",
  "image_count": 3,
  "results": [
    {
      "image": "photo_001.jpg",
      "cards_found": 2,
      "extractions": [
        {
          "card_id": 1,
          "bbox_pct": [0, 0, 50, 100],
          "success": true,
          "confidence": 0.94,
          "inference_ms": 4200,
          "name": "Charizard ex",
          "hp": 330,
          "types": ["Fire"],
          "rarity": "Double Rare",
          "setCode": "SV9",
          "cardNumber": "025"
        },
        {
          "card_id": 2,
          "bbox_pct": [50, 0, 100, 100],
          "success": true,
          "confidence": 0.91,
          "name": "Pikachu",
          "hp": 70,
          "types": ["Lightning"]
        }
      ]
    }
  ]
}
```

### Performance with pipeline

| Scenario | Stage 1 | Stage 2 | Total |
|---|---|---|---|
| 10 photos, 1 card each, no-detect | — | 42 s (batch=9+1) | **42 s** |
| 10 photos, 1 card each, with detect | 100 s | 42 s | **142 s** |
| 1 photo, 9 cards | 10 s | 38 s | **48 s** |

> **Tip:** Use `--no-detect` when images are already cropped to individual cards
> (e.g. card scans from a scanner). Use detection only when photos are of multiple
> cards laid on a table.
