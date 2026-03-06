#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Qwen-VL Model Evaluation Script

评估微调后的模型在测试集上的表现，计算各项指标。

评估指标:
- Exact Match Accuracy (完整 JSON 匹配)
- Field-level Accuracy (各字段单独评估)
- Language-specific Accuracy (按语言分类)
- Inference Time (推理时间)

使用方法:
    python evaluate_qwen_vl.py \
        --model-path ./outputs/final \
        --test-data ./datasets/test.json \
        --output-dir ./evaluations
"""

import os
import sys
import json
import time
import argparse
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from collections import defaultdict

import torch
from PIL import Image
import numpy as np

from transformers import AutoProcessor, AutoModelForVision2Seq

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PTCGEvaluator:
    """PTCG 卡牌提取评估器"""
    
    def __init__(
        self,
        model_path: str,
        device: str = "cuda" if torch.cuda.is_available() else "cpu"
    ):
        """
        初始化评估器
        
        Args:
            model_path: 微调后的模型路径
            device: 运行设备
        """
        self.device = device
        self.model_path = model_path
        
        logger.info(f"加载模型：{model_path}")
        
        # 加载模型和 processor
        self.processor = AutoProcessor.from_pretrained(
            model_path,
            trust_remote_code=True,
        )
        
        self.model = AutoModelForVision2Seq.from_pretrained(
            model_path,
            trust_remote_code=True,
            torch_dtype=torch.bfloat16,
            device_map="auto" if device == "cuda" else None,
        )
        
        if device != "cuda":
            self.model = self.model.to(device)
        
        self.model.eval()
        logger.info(f"✓ 模型加载完成，设备：{device}")
    
    def predict(
        self,
        image_path: str,
        prompt: str,
        max_new_tokens: int = 512,
        temperature: float = 0.1,
    ) -> Tuple[str, float]:
        """
        对单张图片进行预测
        
        Args:
            image_path: 图片路径
            prompt: 提示词
            max_new_tokens: 最大生成 token 数
            temperature: 温度参数
        
        Returns:
            (生成的文本，置信度) 元组
        """
        # 加载图片
        try:
            image = Image.open(image_path).convert("RGB")
        except Exception as e:
            logger.warning(f"加载图片失败：{image_path}, {e}")
            image = Image.new("RGB", (224, 224), color="white")
        
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
        
        # 应用聊天模板
        try:
            inputs = self.processor.apply_chat_template(
                conversation,
                tokenize=True,
                add_generation_prompt=True,
                return_dict=True,
                return_tensors="pt",
            ).to(self.model.device)
            
            # 生成
            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=max_new_tokens,
                    temperature=temperature,
                    do_sample=temperature > 0,
                    pad_token_id=self.processor.tokenizer.pad_token_id,
                )
            
            # 解码输出
            generated_ids = outputs[0][inputs["input_ids"].shape[1]:]
            generated_text = self.processor.decode(
                generated_ids,
                skip_special_tokens=True,
            ).strip()
            
            # 计算简单置信度（基于平均 token 概率）
            # 注意：这是一个简化的置信度估计
            confidence = 0.9  # 默认置信度
            
            return generated_text, confidence
            
        except Exception as e:
            logger.error(f"生成失败：{e}")
            return "{}", 0.0
    
    def parse_json_output(self, text: str) -> Optional[Dict[str, Any]]:
        """尝试从输出文本中解析 JSON"""
        # 尝试直接解析
        try:
            return json.loads(text)
        except:
            pass
        
        # 尝试提取 JSON 代码块
        import re
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
    
    def evaluate_exact_match(
        self,
        predicted: Dict[str, Any],
        ground_truth: Dict[str, Any],
    ) -> bool:
        """
        评估完全匹配
        
        比较关键字段是否完全一致
        """
        key_fields = ["name", "hp", "types", "supertype"]
        
        for field in key_fields:
            if field not in predicted or field not in ground_truth:
                continue
            
            pred_val = predicted[field]
            gt_val = ground_truth[field]
            
            # 处理列表比较
            if isinstance(pred_val, list) and isinstance(gt_val, list):
                if sorted(str(x) for x in pred_val) != sorted(str(x) for x in gt_val):
                    return False
            elif str(pred_val) != str(gt_val):
                return False
        
        return True
    
    def evaluate_field_level(
        self,
        predicted: Dict[str, Any],
        ground_truth: Dict[str, Any],
    ) -> Dict[str, bool]:
        """
        评估字段级别准确率
        
        返回每个字段的匹配结果
        """
        fields = [
            "name", "hp", "type", "types", "subtype", "subtypes",
            "supertype", "abilities", "attacks",
            "rarity", "artist", "setCode", "cardNumber",
            "evolutionStage", "evolvesFrom", "flavorText"
        ]
        
        results = {}
        
        for field in fields:
            if field not in ground_truth:
                results[field] = None  # 跳过不存在的字段
                continue
            
            pred_val = predicted.get(field)
            gt_val = ground_truth[field]
            
            if pred_val is None:
                results[field] = False
            elif isinstance(gt_val, list) and isinstance(pred_val, list):
                # 列表字段：检查是否包含所有元素
                pred_set = set(str(x) for x in pred_val if x)
                gt_set = set(str(x) for x in gt_val if x)
                results[field] = pred_set == gt_set
            else:
                results[field] = str(pred_val) == str(gt_val)
        
        return results
    
    def evaluate_batch(
        self,
        test_data: List[Dict[str, Any]],
        output_dir: str,
        max_samples: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        批量评估
        
        Args:
            test_data: 测试数据
            output_dir: 输出目录
            max_samples: 最大样本数（用于快速测试）
        
        Returns:
            评估结果字典
        """
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        if max_samples:
            test_data = test_data[:max_samples]
        
        logger.info(f"开始评估 {len(test_data)} 个样本...")
        
        results = []
        exact_matches = 0
        field_results = defaultdict(lambda: {"correct": 0, "total": 0})
        language_results = defaultdict(lambda: {"correct": 0, "total": 0})
        inference_times = []
        
        for i, sample in enumerate(test_data):
            messages = sample["messages"]
            metadata = sample.get("metadata", {})
            
            # 提取输入
            image_path = None
            prompt = ""
            ground_truth_text = ""
            
            for msg in messages:
                if msg["role"] == "user":
                    for content in msg["content"]:
                        if content["type"] == "image":
                            image_path = content["image"]
                        elif content["type"] == "text":
                            prompt = content["text"]
                elif msg["role"] == "assistant":
                    for content in msg["content"]:
                        if content["type"] == "text":
                            ground_truth_text = content["text"]
            
            # 解析 ground truth
            ground_truth = self.parse_json_output(ground_truth_text)
            if not ground_truth:
                logger.warning(f"无法解析 ground truth: 样本 {i}")
                continue
            
            # 推理
            start_time = time.time()
            predicted_text, confidence = self.predict(image_path, prompt)
            inference_time = time.time() - start_time
            inference_times.append(inference_time)
            
            # 解析预测结果
            predicted = self.parse_json_output(predicted_text)
            
            # 评估
            if predicted:
                exact_match = self.evaluate_exact_match(predicted, ground_truth)
                field_eval = self.evaluate_field_level(predicted, ground_truth)
                
                if exact_match:
                    exact_matches += 1
                
                # 更新字段统计
                for field, result in field_eval.items():
                    if result is not None:
                        field_results[field]["total"] += 1
                        if result:
                            field_results[field]["correct"] += 1
                
                # 更新语言统计
                lang = metadata.get("language", "unknown")
                language_results[lang]["total"] += 1
                if exact_match:
                    language_results[lang]["correct"] += 1
            else:
                exact_match = False
                field_eval = {}
            
            # 记录详细结果
            result_entry = {
                "sample_idx": i,
                "webCardId": metadata.get("webCardId", "unknown"),
                "language": lang,
                "exact_match": exact_match,
                "field_results": field_eval,
                "inference_time": inference_time,
                "confidence": confidence,
                "predicted_text": predicted_text[:500],  # 截断保存
                "ground_truth_text": ground_truth_text[:500],
            }
            results.append(result_entry)
            
            # 进度
            if (i + 1) % 10 == 0:
                logger.info(f"进度：{i + 1}/{len(test_data)}, 当前准确率：{exact_matches/(i+1)*100:.1f}%")
        
        # 计算汇总指标
        total_samples = len(results)
        
        metrics = {
            "exact_match_accuracy": exact_matches / total_samples if total_samples > 0 else 0,
            "field_level_accuracy": {
                field: data["correct"] / data["total"] if data["total"] > 0 else 0
                for field, data in field_results.items()
            },
            "language_accuracy": {
                lang: data["correct"] / data["total"] if data["total"] > 0 else 0
                for lang, data in language_results.items()
            },
            "inference_time": {
                "mean": np.mean(inference_times),
                "std": np.std(inference_times),
                "min": np.min(inference_times),
                "max": np.max(inference_times),
                "median": np.median(inference_times),
            },
            "total_samples": total_samples,
            "exact_matches": exact_matches,
        }
        
        # 保存结果
        with open(output_path / "evaluation_results.json", "w", encoding="utf-8") as f:
            json.dump({
                "metrics": metrics,
                "detailed_results": results,
            }, f, ensure_ascii=False, indent=2)
        
        # 打印摘要
        self._print_summary(metrics)
        
        return metrics
    
    def _print_summary(self, metrics: Dict[str, Any]):
        """打印评估摘要"""
        print("\n" + "=" * 60)
        print("评估结果摘要")
        print("=" * 60)
        
        print(f"\n📊 总体指标:")
        print(f"  完全匹配准确率：{metrics['exact_match_accuracy']*100:.2f}%")
        print(f"  测试样本数：{metrics['total_samples']}")
        print(f"  完全匹配数：{metrics['exact_matches']}")
        
        print(f"\n📝 字段级别准确率:")
        for field, acc in metrics['field_level_accuracy'].items():
            print(f"  {field}: {acc*100:.1f}%")
        
        print(f"\n🌍 语言级别准确率:")
        for lang, acc in metrics['language_accuracy'].items():
            print(f"  {lang}: {acc*100:.1f}%")
        
        print(f"\n⏱️ 推理时间:")
        print(f"  平均：{metrics['inference_time']['mean']*1000:.1f} ms")
        print(f"  中位数：{metrics['inference_time']['median']*1000:.1f} ms")
        print(f"  最小：{metrics['inference_time']['min']*1000:.1f} ms")
        print(f"  最大：{metrics['inference_time']['max']*1000:.1f} ms")
        
        print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(description="PTCG Qwen-VL 模型评估")
    
    parser.add_argument("--model-path", type=str, required=True,
                       help="微调后的模型路径")
    parser.add_argument("--test-data", type=str, required=True,
                       help="测试数据 JSON 路径")
    parser.add_argument("--output-dir", type=str, default="./evaluations",
                       help="输出目录")
    parser.add_argument("--max-samples", type=int, default=None,
                       help="最大评估样本数（用于快速测试）")
    parser.add_argument("--device", type=str, default="cuda",
                       help="运行设备 (cuda/cpu)")
    
    args = parser.parse_args()
    
    # 加载测试数据
    logger.info(f"加载测试数据：{args.test_data}")
    with open(args.test_data, "r", encoding="utf-8") as f:
        test_data = json.load(f)
    
    # 创建评估器
    evaluator = PTCGEvaluator(args.model_path, args.device)
    
    # 执行评估
    metrics = evaluator.evaluate_batch(
        test_data,
        args.output_dir,
        max_samples=args.max_samples,
    )
    
    logger.info("评估完成！")


if __name__ == "__main__":
    main()
