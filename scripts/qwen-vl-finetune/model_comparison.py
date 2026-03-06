#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Qwen-VL 模型对比测试

比较基础模型和微调模型的识别结果差异

使用方法:
    python model_comparison.py \
        --base-model Qwen/Qwen2.5-VL-7B-Instruct \
        --finetuned-model ./outputs/final \
        --samples 50 \
        --output-dir ./comparisons
"""

import os
import sys
import json
import time
import argparse
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime

import torch
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ModelComparator:
    """模型对比器"""
    
    def __init__(
        self,
        base_model_path: str,
        finetuned_model_path: str,
        device: str = "cuda"
    ):
        from transformers import AutoProcessor, AutoModelForVision2Seq
        
        self.device = device
        
        # 加载基础模型
        logger.info(f"加载基础模型：{base_model_path}")
        self.base_processor = AutoProcessor.from_pretrained(
            base_model_path,
            trust_remote_code=True,
        )
        self.base_model = AutoModelForVision2Seq.from_pretrained(
            base_model_path,
            trust_remote_code=True,
            torch_dtype=torch.bfloat16 if device == "cuda" else torch.float32,
            device_map="auto" if device == "cuda" else None,
        )
        self.base_model.eval()
        
        # 加载微调模型
        logger.info(f"加载微调模型：{finetuned_model_path}")
        self.finetuned_processor = AutoProcessor.from_pretrained(
            finetuned_model_path,
            trust_remote_code=True,
        )
        self.finetuned_model = AutoModelForVision2Seq.from_pretrained(
            finetuned_model_path,
            trust_remote_code=True,
            torch_dtype=torch.bfloat16 if device == "cuda" else torch.float32,
            device_map="auto" if device == "cuda" else None,
        )
        self.finetuned_model.eval()
        
        logger.info("✓ 模型加载完成")
    
    def predict(
        self,
        model: Any,
        processor: Any,
        image: Image.Image,
        prompt: str,
    ) -> Tuple[str, float]:
        """单次推理"""
        conversation = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": prompt}
                ]
            }
        ]
        
        start_time = time.time()
        
        try:
            inputs = processor.apply_chat_template(
                conversation,
                tokenize=True,
                add_generation_prompt=True,
                return_dict=True,
                return_tensors="pt",
            ).to(model.device)
            
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
            
            inference_time = time.time() - start_time
            
            return generated_text, inference_time
            
        except Exception as e:
            logger.error(f"推理失败：{e}")
            return "{}", 0.0
    
    def parse_json(self, text: str) -> Optional[Dict[str, Any]]:
        """解析 JSON 输出"""
        import re
        
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
    
    def compare_outputs(
        self,
        base_output: Dict[str, Any],
        finetuned_output: Dict[str, Any],
        ground_truth: Dict[str, Any],
    ) -> Dict[str, str]:
        """比较两个模型的输出"""
        comparison = {}
        
        fields = ["name", "hp", "types", "abilities", "attacks", "rarity", "artist"]
        
        for field in fields:
            if field not in ground_truth:
                continue
            
            gt_val = ground_truth[field]
            base_val = base_output.get(field) if base_output else None
            ft_val = finetuned_output.get(field) if finetuned_output else None
            
            # 转换为可比较的格式
            if isinstance(gt_val, list):
                gt_str = sorted(str(x) for x in gt_val if x)
                base_str = sorted(str(x) for x in (base_val or [])) if base_val else []
                ft_str = sorted(str(x) for x in (ft_val or [])) if ft_val else []
            else:
                gt_str = str(gt_val)
                base_str = str(base_val) if base_val else ""
                ft_str = str(ft_val) if ft_val else ""
            
            base_match = base_str == gt_str
            ft_match = ft_str == gt_str
            
            if base_match and ft_match:
                comparison[field] = "both_correct"
            elif base_match and not ft_match:
                comparison[field] = "base_better"
            elif not base_match and ft_match:
                comparison[field] = "finetuned_better"
            else:
                comparison[field] = "both_wrong"
        
        return comparison
    
    def run_comparison(
        self,
        test_data_path: str,
        num_samples: int = 50,
        language: str = "zh-HK",
        output_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """运行对比测试"""
        
        # 加载测试数据
        logger.info(f"加载测试数据：{test_data_path}")
        
        test_samples = []
        with open(test_data_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    sample = json.loads(line)
                    if sample.get("metadata", {}).get("language") == language:
                        test_samples.append(sample)
        
        import random
        random.shuffle(test_samples)
        test_samples = test_samples[:num_samples]
        
        logger.info(f"开始对比测试 {num_samples} 张 {language} 卡牌...")
        
        prompt = "以 JSON 格式提取所有卡牌資訊，包含欄位：name, hp, type, subtype, abilities (name/effect 陣列), attacks (name/cost/damage/effect 陣列), weakness, resistance, retreatCost, setCode, cardNumber, rarity, artist"
        
        results = []
        field_comparisons = {
            "name": {"base_better": 0, "finetuned_better": 0, "both_correct": 0, "both_wrong": 0},
            "hp": {"base_better": 0, "finetuned_better": 0, "both_correct": 0, "both_wrong": 0},
            "types": {"base_better": 0, "finetuned_better": 0, "both_correct": 0, "both_wrong": 0},
            "abilities": {"base_better": 0, "finetuned_better": 0, "both_correct": 0, "both_wrong": 0},
            "attacks": {"base_better": 0, "finetuned_better": 0, "both_correct": 0, "both_wrong": 0},
            "rarity": {"base_better": 0, "finetuned_better": 0, "both_correct": 0, "both_wrong": 0},
            "artist": {"base_better": 0, "finetuned_better": 0, "both_correct": 0, "both_wrong": 0},
        }
        
        base_success = 0
        ft_success = 0
        base_times = []
        ft_times = []
        
        for i, sample in enumerate(test_samples):
            logger.info(f"进度：{i+1}/{num_samples}")
            
            messages = sample["messages"]
            metadata = sample.get("metadata", {})
            
            # 提取输入和 ground truth
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
            
            # 加载图像
            try:
                if image_path.startswith("data:image"):
                    import base64
                    from io import BytesIO
                    base64_data = image_path.split(",")[1]
                    image_data = base64.b64decode(base64_data)
                    image = Image.open(BytesIO(image_data)).convert("RGB")
                elif os.path.exists(image_path):
                    image = Image.open(image_path).convert("RGB")
                else:
                    image = Image.new("RGB", (512, 512), color="white")
            except:
                image = Image.new("RGB", (512, 512), color="white")
            
            # 基础模型推理
            base_text, base_time = self.predict(
                self.base_model,
                self.base_processor,
                image,
                prompt
            )
            base_times.append(base_time)
            
            # 微调模型推理
            ft_text, ft_time = self.predict(
                self.finetuned_model,
                self.finetuned_processor,
                image,
                prompt
            )
            ft_times.append(ft_time)
            
            # 解析结果
            base_output = self.parse_json(base_text)
            ft_output = self.parse_json(ft_text)
            ground_truth = self.parse_json(ground_truth_text)
            
            if base_output:
                base_success += 1
            if ft_output:
                ft_success += 1
            
            # 比较结果
            if base_output and ft_output and ground_truth:
                comparison = self.compare_outputs(base_output, ft_output, ground_truth)
                for field, result in comparison.items():
                    if field in field_comparisons:
                        field_comparisons[field][result] += 1
            
            # 记录详细结果
            result_entry = {
                "sample_idx": i,
                "webCardId": metadata.get("webCardId", "unknown"),
                "name": metadata.get("name", "unknown"),
                "base_output": base_text[:500],
                "finetuned_output": ft_text[:500],
                "ground_truth": ground_truth_text[:500],
                "base_time_sec": base_time,
                "finetuned_time_sec": ft_time,
                "base_success": base_output is not None,
                "finetuned_success": ft_output is not None,
            }
            results.append(result_entry)
        
        # 生成报告
        report = {
            "timestamp": datetime.now().isoformat(),
            "total_samples": len(results),
            "base_model_success_rate": base_success / len(results) * 100,
            "finetuned_model_success_rate": ft_success / len(results) * 100,
            "timing": {
                "base_model_avg_ms": sum(base_times) / len(base_times) * 1000,
                "finetuned_model_avg_ms": sum(ft_times) / len(ft_times) * 1000,
            },
            "field_comparison": field_comparisons,
            "detailed_results": results,
        }
        
        # 打印摘要
        self._print_summary(report)
        
        # 保存报告
        if output_dir:
            output_path = Path(output_dir)
            output_path.mkdir(parents=True, exist_ok=True)
            
            with open(output_path / "comparison_results.json", "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2, ensure_ascii=False)
            
            with open(output_path / "comparison_report.txt", "w", encoding="utf-8") as f:
                f.write(self._format_report_text(report))
            
            logger.info(f"报告已保存到：{output_dir}")
        
        return report
    
    def _print_summary(self, report: Dict[str, Any]):
        """打印摘要"""
        print("\n" + "=" * 70)
        print("PTCG Qwen-VL 模型对比测试结果")
        print("=" * 70)
        
        print(f"\n📊 总体统计:")
        print(f"  测试样本数：{report['total_samples']}")
        print(f"  基础模型成功率：{report['base_model_success_rate']:.1f}%")
        print(f"  微调模型成功率：{report['finetuned_model_success_rate']:.1f}%")
        print(f"  提升：{report['finetuned_model_success_rate'] - report['base_model_success_rate']:+.1f}%")
        
        print(f"\n⏱️ 推理时间:")
        print(f"  基础模型：{report['timing']['base_model_avg_ms']:.1f} ms")
        print(f"  微调模型：{report['timing']['finetuned_model_avg_ms']:.1f} ms")
        
        print(f"\n📝 字段级别对比:")
        for field, counts in report["field_comparison"].items():
            total = sum(counts.values())
            if total == 0:
                continue
            
            base_better = counts["base_better"] / total * 100
            ft_better = counts["finetuned_better"] / total * 100
            both_correct = counts["both_correct"] / total * 100
            both_wrong = counts["both_wrong"] / total * 100
            
            improvement = ft_better - base_better
            status = "✓" if improvement > 0 else "⚠" if improvement == 0 else "✗"
            
            print(f"  {status} {field}:")
            print(f"      两者都对：{both_correct:.1f}%")
            print(f"      两者都错：{both_wrong:.1f}%")
            print(f"      基础更好：{base_better:.1f}%")
            print(f"      微调更好：{ft_better:.1f}% ({improvement:+.1f}%)")
        
        print("\n" + "=" * 70)
    
    def _format_report_text(self, report: Dict[str, Any]) -> str:
        """格式化文本报告"""
        lines = [
            "=" * 70,
            "PTCG Qwen-VL 模型对比测试报告",
            "=" * 70,
            "",
            f"测试时间：{report['timestamp']}",
            "",
            "📊 总体统计:",
            f"  测试样本数：{report['total_samples']}",
            f"  基础模型成功率：{report['base_model_success_rate']:.1f}%",
            f"  微调模型成功率：{report['finetuned_model_success_rate']:.1f}%",
            f"  提升：{report['finetuned_model_success_rate'] - report['base_model_success_rate']:+.1f}%",
            "",
            "⏱️ 推理时间:",
            f"  基础模型：{report['timing']['base_model_avg_ms']:.1f} ms",
            f"  微调模型：{report['timing']['finetuned_model_avg_ms']:.1f} ms",
            "",
            "📝 字段级别对比:",
        ]
        
        for field, counts in report["field_comparison"].items():
            total = sum(counts.values())
            if total == 0:
                continue
            
            base_better = counts["base_better"] / total * 100
            ft_better = counts["finetuned_better"] / total * 100
            both_correct = counts["both_correct"] / total * 100
            
            lines.extend([
                f"  {field}:",
                f"    两者都对：{both_correct:.1f}%",
                f"    基础更好：{base_better:.1f}%",
                f"    微调更好：{ft_better:.1f}%",
                "",
            ])
        
        return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="PTCG Qwen-VL 模型对比测试")
    
    parser.add_argument(
        "--base-model",
        type=str,
        default="Qwen/Qwen2.5-VL-7B-Instruct",
        help="基础模型路径"
    )
    parser.add_argument(
        "--finetuned-model",
        type=str,
        required=True,
        help="微调模型路径"
    )
    parser.add_argument(
        "--test-data",
        type=str,
        default="./datasets/test.jsonl",
        help="测试数据路径"
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=50,
        help="测试样本数"
    )
    parser.add_argument(
        "--language",
        type=str,
        default="zh-HK",
        help="测试语言"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./comparisons",
        help="输出目录"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cuda",
        help="运行设备"
    )
    
    args = parser.parse_args()
    
    if not os.path.exists(args.test_data):
        logger.error(f"测试数据不存在：{args.test_data}")
        sys.exit(1)
    
    comparator = ModelComparator(args.base_model, args.finetuned_model, args.device)
    
    report = comparator.run_comparison(
        args.test_data,
        num_samples=args.samples,
        language=args.language,
        output_dir=args.output_dir,
    )
    
    if report:
        logger.info("对比测试完成！")
    else:
        logger.error("对比测试失败")
        sys.exit(1)


if __name__ == "__main__":
    main()
