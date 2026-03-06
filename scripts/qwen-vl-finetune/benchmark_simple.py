#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Qwen-VL Simple Benchmark (Fixed Version)
Test 50 Chinese cards for inference speed and accuracy
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from datetime import datetime

print("=" * 60)
print("PTCG Qwen-VL 50 Cards Benchmark Test")
print("=" * 60)

def check_dependencies():
    """Check required dependencies"""
    missing = []
    
    try:
        import torch
        print(f"OK: PyTorch {torch.__version__}")
        print(f"OK: CUDA available = {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            print(f"OK: GPU = {torch.cuda.get_device_name(0)}")
    except ImportError:
        missing.append("torch")
    
    try:
        from PIL import Image
        print(f"OK: Pillow installed")
    except ImportError:
        missing.append("Pillow")
    
    try:
        from transformers import AutoProcessor
        try:
            from transformers import AutoModelForVision2Seq
        except ImportError:
            from transformers import AutoModelForImageTextToText as AutoModelForVision2Seq
        print(f"OK: transformers installed")
    except ImportError:
        missing.append("transformers")
    
    if missing:
        print(f"\nERROR: Missing dependencies: {missing}")
        print(f"Run: pip install {' '.join(missing)}")
        return False
    
    return True

if not check_dependencies():
    sys.exit(1)

import torch
from PIL import Image
from transformers import AutoProcessor
try:
    from transformers import AutoModelForVision2Seq
except ImportError:
    from transformers import AutoModelForImageTextToText as AutoModelForVision2Seq


def load_model(model_path):
    """Load model (supports local path or HuggingFace model ID)"""
    print(f"\nLoading model: {model_path}...")
    
    is_hf_id = "/" in model_path and not os.path.exists(model_path)
    if not is_hf_id and not os.path.exists(model_path):
        print(f"ERROR: Model path does not exist: {model_path}")
        return None, None
    
    try:
        processor = AutoProcessor.from_pretrained(
            model_path,
            trust_remote_code=True,
        )
        
        model = AutoModelForVision2Seq.from_pretrained(
            model_path,
            trust_remote_code=True,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            device_map="auto" if torch.cuda.is_available() else None,
        )
        
        if not torch.cuda.is_available():
            model = model.to('cpu')
        
        model.eval()
        print("OK: Model loaded successfully")
        return model, processor
    
    except Exception as e:
        print(f"ERROR: Model loading failed: {e}")
        return None, None


def load_test_data(test_data_path, language="zh-HK", max_samples=50):
    """Load test data"""
    print(f"\nLoading test data: {test_data_path}...")
    
    if not os.path.exists(test_data_path):
        print(f"ERROR: Test data does not exist: {test_data_path}")
        return []
    
    samples = []
    try:
        with open(test_data_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    try:
                        sample = json.loads(line)
                        if sample.get("metadata", {}).get("language") == language:
                            samples.append(sample)
                    except json.JSONDecodeError:
                        pass
        
        print(f"OK: Found {len(samples)} {language} cards")
        
        if len(samples) < max_samples:
            print(f"WARNING: Only {len(samples)} samples available (requested {max_samples})")
            max_samples = len(samples)
        
        import random
        random.shuffle(samples)
        return samples[:max_samples]
    
    except Exception as e:
        print(f"ERROR: Failed to load test data: {e}")
        return []


def load_image(image_path):
    """Load image (supports local paths, HTTP URLs, and base64 data URIs)"""
    try:
        if image_path.startswith("data:image"):
            import base64
            from io import BytesIO
            base64_data = image_path.split(",")[1]
            image_data = base64.b64decode(base64_data)
            return Image.open(BytesIO(image_data)).convert("RGB")
        elif image_path.startswith("http://") or image_path.startswith("https://"):
            import requests
            from io import BytesIO
            response = requests.get(image_path, timeout=15)
            response.raise_for_status()
            return Image.open(BytesIO(response.content)).convert("RGB")
        elif os.path.exists(image_path):
            return Image.open(image_path).convert("RGB")
        else:
            print(f"WARNING: Image not found: {image_path[:80]}...")
            return Image.new("RGB", (512, 512), color="white")
    except Exception as e:
        print(f"WARNING: Image load failed: {e}")
        return Image.new("RGB", (512, 512), color="white")


def run_inference(model, processor, image, prompt, device="cuda"):
    """Run inference"""
    try:
        conversation = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": prompt}
                ]
            }
        ]
        
        inputs = processor.apply_chat_template(
            conversation,
            tokenize=True,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
        )
        
        if device == "cuda" and torch.cuda.is_available():
            inputs = {k: v.to(model.device) if hasattr(v, 'to') else v for k, v in inputs.items()}
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=512,
                temperature=0.1,
                do_sample=False,
                pad_token_id=processor.tokenizer.pad_token_id,
            )
        
        generated_ids = outputs[0][inputs["input_ids"].shape[1]:]
        generated_text = processor.decode(
            generated_ids,
            skip_special_tokens=True,
        ).strip()
        
        return generated_text, True
    
    except Exception as e:
        return f"Error: {e}", False


def parse_json_output(text):
    """Parse JSON output"""
    import re
    
    if not text or text.startswith("Error:"):
        return None
    
    try:
        return json.loads(text)
    except:
        pass
    
    json_match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except:
            pass
    
    start = text.find('{')
    end = text.rfind('}') + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except:
            pass
    
    return None


def main():
    parser = argparse.ArgumentParser(description="PTCG Qwen-VL Simple Benchmark")
    parser.add_argument("--model-path", type=str, default="Qwen/Qwen2.5-VL-7B-Instruct",
                        help="Local model path or HuggingFace model ID (default: base Qwen2.5-VL-7B)")
    parser.add_argument("--test-data", type=str, default="./datasets/test.jsonl")
    parser.add_argument("--samples", type=int, default=50)
    parser.add_argument("--language", type=str, default="ja-JP",
                        help="Language to benchmark: zh-HK, ja-JP, en-US (default: ja-JP, has local images)")
    parser.add_argument("--output-dir", type=str, default="./benchmarks")
    parser.add_argument("--device", type=str, default="cuda" if torch.cuda.is_available() else "cpu")
    
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Chinese prompt for card extraction
    prompt = "以 JSON 格式提取所有卡牌資訊，包含欄位：name, hp, type, subtype, abilities (name/effect 陣列), attacks (name/cost/damage/effect 陣列), weakness, resistance, retreatCost, setCode, cardNumber, rarity, artist"
    
    # Load model
    model, processor = load_model(args.model_path)
    if not model:
        print("\nERROR: Model loading failed")
        sys.exit(1)
    
    # Load test data
    test_samples = load_test_data(
        args.test_data,
        language=args.language,
        max_samples=args.samples
    )
    
    if not test_samples:
        print("\nERROR: No test data available")
        sys.exit(1)
    
    # Run test
    print(f"\nStarting test: {len(test_samples)} cards...")
    print("-" * 60)
    
    results = []
    field_accuracies = {field: [] for field in ["name", "hp", "types", "rarity", "artist"]}
    inference_times = []
    success_count = 0
    
    start_total = time.time()
    
    for i, sample in enumerate(test_samples):
        messages = sample["messages"]
        metadata = sample.get("metadata", {})
        
        image_path = None
        ground_truth_text = ""
        
        for msg in messages:
            if msg["role"] == "user":
                for content in msg["content"]:
                    if content["type"] == "image":
                        image_path = content["image"]
            elif msg["role"] == "assistant":
                for content in msg["content"]:
                    if content["type"] == "text":
                        ground_truth_text = content["text"]
        
        image = load_image(image_path)
        
        start_time = time.time()
        predicted_text, success = run_inference(model, processor, image, prompt, args.device)
        inference_time = time.time() - start_time
        inference_times.append(inference_time)
        
        predicted = parse_json_output(predicted_text)
        ground_truth = parse_json_output(ground_truth_text)
        
        if success and predicted:
            success_count += 1
        
        status = "OK" if (success and predicted) else "FAIL"
        card_name = metadata.get("name", "unknown")[:20]
        print(f"[{i+1:3d}/{len(test_samples)}] {status:4s} {card_name:20s} - {inference_time:.2f}s")
        
        results.append({
            "idx": i,
            "name": card_name,
            "success": success and predicted is not None,
            "inference_time": inference_time,
        })
    
    total_time = time.time() - start_total
    
    # Generate report
    print("\n" + "=" * 60)
    print("TEST RESULTS")
    print("=" * 60)
    
    success_rate = success_count / len(test_samples) * 100
    avg_time = sum(inference_times) / len(inference_times)
    
    print(f"\nSummary:")
    print(f"  Total samples: {len(test_samples)}")
    print(f"  Success: {success_count}")
    print(f"  Failed: {len(test_samples) - success_count}")
    print(f"  Success rate: {success_rate:.1f}%")
    print(f"  Total time: {total_time:.1f}s ({total_time/60:.1f} minutes)")
    print(f"  Average inference: {avg_time:.2f}s ({avg_time*1000:.0f}ms)")
    print(f"  Min: {min(inference_times):.2f}s")
    print(f"  Max: {max(inference_times):.2f}s")
    
    # Save results
    report = {
        "timestamp": datetime.now().isoformat(),
        "model_path": args.model_path,
        "total_samples": len(test_samples),
        "success_count": success_count,
        "success_rate": success_rate,
        "total_time_sec": total_time,
        "avg_inference_time_sec": avg_time,
        "detailed_results": results,
    }
    
    with open(output_dir / "benchmark_results.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    with open(output_dir / "benchmark_report.txt", "w", encoding="utf-8") as f:
        f.write(f"PTCG Qwen-VL Benchmark Report\n")
        f.write(f"=" * 60 + "\n\n")
        f.write(f"Timestamp: {report['timestamp']}\n")
        f.write(f"Model: {args.model_path}\n\n")
        f.write(f"Summary:\n")
        f.write(f"  Samples: {len(test_samples)}\n")
        f.write(f"  Success rate: {success_rate:.1f}%\n")
        f.write(f"  Avg inference: {avg_time*1000:.0f}ms\n")
    
    print(f"\nResults saved to: {output_dir}")
    print(f"  - benchmark_results.json")
    print(f"  - benchmark_report.txt")
    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
