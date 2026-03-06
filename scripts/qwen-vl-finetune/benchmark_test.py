#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Qwen-VL 基准测试工具

测试 50 张中文卡牌的推理速度和识别结果差异

使用方法:
    python benchmark_test.py \
        --model-path ./outputs/final \
        --samples 50 \
        --language zh-HK \
        --output-dir ./benchmarks
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
import statistics

import torch
from PIL import Image

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class BenchmarkTester:
    """基准测试器"""
    
    def __init__(
        self,
        model_path: str,
        device: str = "cuda" if torch.cuda.is_available() else "cpu"
    ):
        self.device = device
        self.model_path = model_path
        
        logger.info(f"加载模型：{model_path}")
        
        # 加载模型和 processor
        try:
            from transformers import AutoProcessor, AutoModelForVision2Seq
            
            self.processor = AutoProcessor.from_pretrained(
                model_path,
                trust_remote_code=True,
            )
            
            self.model = AutoModelForVision2Seq.from_pretrained(
                model_path,
                trust_remote_code=True,
                torch_dtype=torch.bfloat16 if device == "cuda" else torch.float32,
                device_map="auto" if device == "cuda" else None,
            )
            
            if device != "cuda":
                self.model = self.model.to(device)
            
            self.model.eval()
            logger.info(f"✓ 模型加载完成，设备：{device}")
            
        except Exception as e:
            logger.error(f"模型加载失败：{e}")
            raise
        
        # 性能统计
        self.stats = {
            "inference_times": [],
            "preprocess_times": [],
            "total_times": [],
            "success_count": 0,
            "failure_count": 0,
        }
    
    def predict(
        self,
        image: Image.Image,
        prompt: str,
        max_new_tokens: int = 512,
    ) -> Tuple[str, float]:
        """
        单次推理
        
        Returns:
            (生成的文本，推理时间秒)
        """
        start_time = time.time()
        
        # 构建对话
        conversation = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": prompt}
                ]
            }
        ]
        
        try:
            # 处理输入
            preprocess_start = time.time()
            inputs = self.processor.apply_chat_template(
                conversation,
                tokenize=True,
                add_generation_prompt=True,
                return_dict=True,
                return_tensors="pt",
            ).to(self.model.device)
            preprocess_time = time.time() - preprocess_start
            
            # 生成
            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=max_new_tokens,
                    temperature=0.1,
                    do_sample=False,
                    pad_token_id=self.processor.tokenizer.pad_token_id,
                )
            
            # 解码输出
            generated_ids = outputs[0][inputs["input_ids"].shape[1]:]
            generated_text = self.processor.decode(
                generated_ids,
                skip_special_tokens=True,
            ).strip()
            
            total_time = time.time() - start_time
            
            # 记录统计
            self.stats["preprocess_times"].append(preprocess_time)
            self.stats["inference_times"].append(total_time - preprocess_time)
            self.stats["total_times"].append(total_time)
            
            return generated_text, total_time
            
        except Exception as e:
            logger.error(f"推理失败：{e}")
            self.stats["failure_count"] += 1
            return "{}", 0.0
    
    def parse_json_output(self, text: str) -> Optional[Dict[str, Any]]:
        """尝试从输出文本中解析 JSON"""
        import re
        
        # 尝试直接解析
        try:
            return json.loads(text)
        except:
            pass
        
        # 尝试提取 JSON 代码块
        json_match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except:
                pass
        
        # 尝试提取第一个 { 到最后一个 }
        start = text.find('{')
        end = text.rfind('}') + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except:
                pass
        
        return None
    
    def calculate_field_accuracy(
        self,
        predicted: Dict[str, Any],
        ground_truth: Dict[str, Any],
    ) -> Dict[str, bool]:
        """计算字段级别准确率"""
        fields = [
            "name", "hp", "type", "types", "subtype",
            "supertype", "abilities", "attacks",
            "rarity", "artist", "setCode", "cardNumber"
        ]
        
        results = {}
        
        for field in fields:
            if field not in ground_truth:
                results[field] = None
                continue
            
            pred_val = predicted.get(field)
            gt_val = ground_truth[field]
            
            if pred_val is None:
                results[field] = False
            elif isinstance(gt_val, list) and isinstance(pred_val, list):
                pred_set = set(str(x) for x in pred_val if x)
                gt_set = set(str(x) for x in gt_val if x)
                results[field] = pred_set == gt_set
            else:
                results[field] = str(pred_val) == str(gt_val)
        
        return results
    
    def run_benchmark(
        self,
        test_data_path: str,
        num_samples: int = 50,
        language: str = "zh-HK",
        output_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        运行基准测试
        
        Args:
            test_data_path: 测试数据路径
            num_samples: 测试样本数
            language: 语言过滤
            output_dir: 输出目录
        
        Returns:
            基准测试结果
        """
        # 加载测试数据
        logger.info(f"加载测试数据：{test_data_path}")
        
        test_samples = []
        with open(test_data_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    sample = json.loads(line)
                    # 过滤语言
                    if sample.get("metadata", {}).get("language") == language:
                        test_samples.append(sample)
        
        if len(test_samples) < num_samples:
            logger.warning(f"可用样本数 ({len(test_samples)}) 少于请求的 {num_samples} 个")
            num_samples = len(test_samples)
        
        # 随机采样
        import random
        random.shuffle(test_samples)
        test_samples = test_samples[:num_samples]
        
        logger.info(f"开始基准测试 {num_samples} 张 {language} 卡牌...")
        
        # 中文提示词
        prompt = "以 JSON 格式提取所有卡牌資訊，包含欄位：name, hp, type, subtype, abilities (name/effect 陣列), attacks (name/cost/damage/effect 陣列), weakness, resistance, retreatCost, setCode, cardNumber, rarity, artist"
        
        results = []
        field_accuracies = {
            "name": [], "hp": [], "type": [], "types": [],
            "abilities": [], "attacks": [], "rarity": [],
            "artist": [], "setCode": [], "cardNumber": []
        }
        
        for i, sample in enumerate(test_samples):
            logger.info(f"进度：{i+1}/{num_samples}")
            
            messages = sample["messages"]
            metadata = sample.get("metadata", {})
            
            # 提取输入
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
                    logger.warning(f"图像不存在：{image_path}")
                    image = Image.new("RGB", (512, 512), color="white")
            except Exception as e:
                logger.error(f"加载图像失败：{e}")
                image = Image.new("RGB", (512, 512), color="white")
            
            # 推理
            predicted_text, total_time = self.predict(image, prompt)
            
            # 解析结果
            predicted = self.parse_json_output(predicted_text)
            ground_truth = self.parse_json_output(ground_truth_text)
            
            # 计算准确率
            if predicted and ground_truth:
                field_eval = self.calculate_field_accuracy(predicted, ground_truth)
                for field, result in field_eval.items():
                    if result is not None:
                        field_accuracies[field].append(result)
                
                self.stats["success_count"] += 1
            else:
                self.stats["failure_count"] += 1
            
            # 记录结果
            result_entry = {
                "sample_idx": i,
                "webCardId": metadata.get("webCardId", "unknown"),
                "name": metadata.get("name", "unknown"),
                "inference_time_sec": total_time,
                "success": predicted is not None,
                "predicted_json": predicted_text[:500],
                "ground_truth_json": ground_truth_text[:500],
            }
            results.append(result_entry)
        
        # 生成报告
        report = self.generate_report(results, field_accuracies, output_dir)
        
        return report
    
    def generate_report(
        self,
        results: List[Dict],
        field_accuracies: Dict[str, List[bool]],
        output_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """生成基准测试报告"""
        
        # 时间统计
        inference_times = [r["inference_time_sec"] for r in results if r["success"]]
        
        if not inference_times:
            logger.error("没有成功的推理结果")
            return {}
        
        report = {
            "timestamp": datetime.now().isoformat(),
            "total_samples": len(results),
            "success_count": self.stats["success_count"],
            "failure_count": self.stats["failure_count"],
            "success_rate": self.stats["success_count"] / len(results) * 100,
            "timing": {
                "mean_sec": statistics.mean(inference_times),
                "median_sec": statistics.median(inference_times),
                "std_sec": statistics.stdev(inference_times) if len(inference_times) > 1 else 0,
                "min_sec": min(inference_times),
                "max_sec": max(inference_times),
                "p95_sec": sorted(inference_times)[int(len(inference_times) * 0.95)] if len(inference_times) >= 20 else max(inference_times),
            },
            "field_accuracy": {
                field: sum(values) / len(values) * 100 if values else 0
                for field, values in field_accuracies.items()
            },
            "detailed_results": results,
        }
        
        # 打印报告
        self._print_summary(report)
        
        # 保存报告
        if output_dir:
            output_path = Path(output_dir)
            output_path.mkdir(parents=True, exist_ok=True)
            
            # 保存 JSON
            with open(output_path / "benchmark_results.json", "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2, ensure_ascii=False)
            
            # 保存文本报告
            with open(output_path / "benchmark_report.txt", "w", encoding="utf-8") as f:
                f.write(self._format_report_text(report))
            
            logger.info(f"报告已保存到：{output_dir}")
        
        return report
    
    def _print_summary(self, report: Dict[str, Any]):
        """打印摘要"""
        print("\n" + "=" * 70)
        print("PTCG Qwen-VL 基准测试结果")
        print("=" * 70)
        
        print(f"\n📊 总体统计:")
        print(f"  测试样本数：{report['total_samples']}")
        print(f"  成功：{report['success_count']}")
        print(f"  失败：{report['failure_count']}")
        print(f"  成功率：{report['success_rate']:.1f}%")
        
        print(f"\n⏱️ 推理时间:")
        timing = report["timing"]
        print(f"  平均：{timing['mean_sec']*1000:.1f} ms")
        print(f"  中位数：{timing['median_sec']*1000:.1f} ms")
        print(f"  标准差：{timing['std_sec']*1000:.1f} ms")
        print(f"  最小：{timing['min_sec']*1000:.1f} ms")
        print(f"  最大：{timing['max_sec']*1000:.1f} ms")
        print(f"  P95: {timing['p95_sec']*1000:.1f} ms")
        
        print(f"\n📝 字段级别准确率:")
        for field, acc in sorted(report["field_accuracy"].items(), key=lambda x: x[1], reverse=True):
            status = "✓" if acc >= 85 else "⚠" if acc >= 70 else "✗"
            print(f"  {status} {field}: {acc:.1f}%")
        
        # 计算平均准确率
        avg_acc = sum(report["field_accuracy"].values()) / len(report["field_accuracy"])
        print(f"\n  平均准确率：{avg_acc:.1f}%")
        
        print("\n" + "=" * 70)
    
    def _format_report_text(self, report: Dict[str, Any]) -> str:
        """格式化文本报告"""
        lines = [
            "=" * 70,
            "PTCG Qwen-VL 基准测试报告",
            "=" * 70,
            "",
            f"测试时间：{report['timestamp']}",
            "",
            "📊 总体统计:",
            f"  测试样本数：{report['total_samples']}",
            f"  成功：{report['success_count']}",
            f"  失败：{report['failure_count']}",
            f"  成功率：{report['success_rate']:.1f}%",
            "",
            "⏱️ 推理时间:",
            f"  平均：{report['timing']['mean_sec']*1000:.1f} ms",
            f"  中位数：{report['timing']['median_sec']*1000:.1f} ms",
            f"  标准差：{report['timing']['std_sec']*1000:.1f} ms",
            f"  最小：{report['timing']['min_sec']*1000:.1f} ms",
            f"  最大：{report['timing']['max_sec']*1000:.1f} ms",
            f"  P95: {report['timing']['p95_sec']*1000:.1f} ms",
            "",
            "📝 字段级别准确率:",
        ]
        
        for field, acc in sorted(report["field_accuracy"].items(), key=lambda x: x[1], reverse=True):
            status = "✓" if acc >= 85 else "⚠" if acc >= 70 else "✗"
            lines.append(f"  {status} {field}: {acc:.1f}%")
        
        avg_acc = sum(report["field_accuracy"].values()) / len(report["field_accuracy"])
        lines.extend([
            "",
            f"  平均准确率：{avg_acc:.1f}%",
            "",
            "=" * 70,
        ])
        
        return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="PTCG Qwen-VL 基准测试",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 测试 50 张中文卡牌
  python benchmark_test.py --model-path ./outputs/final --samples 50 --language zh-HK
  
  # 测试所有可用样本
  python benchmark_test.py --model-path ./outputs/final --samples 999
        """
    )
    
    parser.add_argument(
        "--model-path",
        type=str,
        required=True,
        help="微调后的模型路径"
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
        choices=["zh-HK", "ja-JP", "en-US"],
        help="测试语言"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./benchmarks",
        help="输出目录"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cuda",
        help="运行设备"
    )
    
    args = parser.parse_args()
    
    # 检查测试数据
    if not os.path.exists(args.test_data):
        logger.error(f"测试数据不存在：{args.test_data}")
        sys.exit(1)
    
    # 创建基准测试器
    tester = BenchmarkTester(args.model_path, args.device)
    
    # 运行测试
    report = tester.run_benchmark(
        args.test_data,
        num_samples=args.samples,
        language=args.language,
        output_dir=args.output_dir,
    )
    
    if report:
        logger.info("基准测试完成！")
    else:
        logger.error("基准测试失败")
        sys.exit(1)


if __name__ == "__main__":
    main()
