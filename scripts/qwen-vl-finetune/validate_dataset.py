#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG 数据集验证和统计工具

验证导出的数据集质量，生成详细统计报告。

使用方法:
    python validate_dataset.py --dataset-dir ./datasets
"""

import os
import sys
import json
import argparse
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional
from collections import defaultdict
from PIL import Image

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DatasetValidator:
    """数据集验证器"""
    
    def __init__(self, dataset_dir: str):
        self.dataset_dir = Path(dataset_dir)
        self.stats = {
            "total_samples": 0,
            "train_samples": 0,
            "val_samples": 0,
            "test_samples": 0,
            "language_distribution": defaultdict(lambda: defaultdict(int)),
            "complexity_distribution": defaultdict(lambda: defaultdict(int)),
            "supertype_distribution": defaultdict(lambda: defaultdict(int)),
            "missing_images": 0,
            "invalid_json": 0,
            "missing_fields": defaultdict(int),
            "image_sizes": [],
            "duplicate_cards": set(),
        }
    
    def validate_jsonl_file(self, file_path: Path, split_name: str) -> Dict[str, Any]:
        """验证单个 JSONL 文件"""
        if not file_path.exists():
            logger.error(f"文件不存在：{file_path}")
            return {"valid": False, "errors": [f"文件不存在：{file_path}"]}
        
        errors = []
        warnings = []
        samples = []
        card_ids = set()
        
        required_fields = [
            "name", "hp", "types", "supertype",
            "abilities", "attacks"
        ]
        
        with open(file_path, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                if not line.strip():
                    continue
                
                try:
                    sample = json.loads(line)
                    
                    # 验证结构
                    if "messages" not in sample:
                        errors.append(f"行 {line_num}: 缺少 messages 字段")
                        continue
                    
                    messages = sample["messages"]
                    if len(messages) != 2:
                        warnings.append(f"行 {line_num}: 期望 2 条消息，实际 {len(messages)} 条")
                    
                    # 验证 user 消息
                    user_msg = messages[0]
                    if user_msg["role"] != "user":
                        errors.append(f"行 {line_num}: 第一条消息应该是 user 角色")
                    
                    user_content = user_msg["content"]
                    has_image = False
                    has_text = False
                    
                    for content in user_content:
                        if content["type"] == "image":
                            has_image = True
                            # 验证图像路径
                            image_path = content["image"]
                            if not os.path.exists(image_path):
                                # 检查是否是 base64
                                if not image_path.startswith("data:image"):
                                    self.stats["missing_images"] += 1
                                    warnings.append(f"行 {line_num}: 图像不存在：{image_path}")
                            else:
                                # 检查图像尺寸
                                try:
                                    with Image.open(image_path) as img:
                                        self.stats["image_sizes"].append({
                                            "width": img.width,
                                            "height": img.height,
                                            "split": split_name
                                        })
                                except Exception as e:
                                    warnings.append(f"行 {line_num}: 无法打开图像：{e}")
                        
                        elif content["type"] == "text":
                            has_text = True
                    
                    if not has_image:
                        warnings.append(f"行 {line_num}: 缺少图像内容")
                    if not has_text:
                        warnings.append(f"行 {line_num}: 缺少文本提示")
                    
                    # 验证 assistant 消息
                    assistant_msg = messages[1]
                    if assistant_msg["role"] != "assistant":
                        errors.append(f"行 {line_num}: 第二条消息应该是 assistant 角色")
                    
                    # 验证 JSON 输出
                    assistant_content = assistant_msg["content"]
                    for content in assistant_content:
                        if content["type"] == "text":
                            try:
                                card_data = json.loads(content["text"])
                                
                                # 检查必需字段
                                for field in required_fields:
                                    if field not in card_data:
                                        self.stats["missing_fields"][field] += 1
                                
                                # 检查重复
                                webCardId = card_data.get("webCardId")
                                if webCardId:
                                    if webCardId in card_ids:
                                        self.stats["duplicate_cards"].add(webCardId)
                                        warnings.append(f"行 {line_num}: 重复的卡牌 ID: {webCardId}")
                                    card_ids.add(webCardId)
                                
                                # 统计
                                metadata = sample.get("metadata", {})
                                lang = metadata.get("language", "unknown")
                                complexity = metadata.get("complexity", "unknown")
                                supertype = card_data.get("supertype", "unknown")
                                
                                self.stats["language_distribution"][split_name][lang] += 1
                                self.stats["complexity_distribution"][split_name][complexity] += 1
                                self.stats["supertype_distribution"][split_name][supertype] += 1
                                
                                samples.append(sample)
                                
                            except json.JSONDecodeError as e:
                                self.stats["invalid_json"] += 1
                                errors.append(f"行 {line_num}: JSON 解析失败：{e}")
                    
                except json.JSONDecodeError as e:
                    self.stats["invalid_json"] += 1
                    errors.append(f"行 {line_num}: JSON 解析失败：{e}")
                except Exception as e:
                    errors.append(f"行 {line_num}: 处理失败：{e}")
        
        # 更新统计
        if split_name == "train":
            self.stats["train_samples"] = len(samples)
        elif split_name == "validation":
            self.stats["val_samples"] = len(samples)
        elif split_name == "test":
            self.stats["test_samples"] = len(samples)
        
        self.stats["total_samples"] += len(samples)
        
        return {
            "valid": len(errors) == 0,
            "samples": len(samples),
            "errors": errors,
            "warnings": warnings,
            "duplicate_cards": len([w for w in warnings if "重复的卡牌 ID" in w])
        }
    
    def validate_all(self) -> Dict[str, Any]:
        """验证所有数据集文件"""
        logger.info("=" * 60)
        logger.info("PTCG 数据集验证")
        logger.info("=" * 60)
        
        files = {
            "train": self.dataset_dir / "train.jsonl",
            "validation": self.dataset_dir / "validation.jsonl",
            "test": self.dataset_dir / "test.jsonl"
        }
        
        results = {}
        for split_name, file_path in files.items():
            logger.info(f"\n验证 {split_name} 集...")
            results[split_name] = self.validate_jsonl_file(file_path, split_name)
            
            if results[split_name]["valid"]:
                logger.info(f"  ✓ {split_name} 集验证通过 ({results[split_name]['samples']} 样本)")
            else:
                logger.error(f"  ✗ {split_name} 集验证失败")
                for error in results[split_name]["errors"][:5]:
                    logger.error(f"    {error}")
        
        return results
    
    def generate_report(self, output_path: Optional[Path] = None) -> str:
        """生成验证报告"""
        report_lines = [
            "=" * 60,
            "PTCG 数据集验证报告",
            "=" * 60,
            "",
            "📊 总体统计:",
            f"  总样本数：{self.stats['total_samples']}",
            f"  训练集：{self.stats['train_samples']} 样本",
            f"  验证集：{self.stats['val_samples']} 样本",
            f"  测试集：{self.stats['test_samples']} 样本",
            "",
            "🌍 语言分布:",
        ]
        
        for split_name in ["train", "validation", "test"]:
            lang_dist = self.stats["language_distribution"][split_name]
            if lang_dist:
                report_lines.append(f"  {split_name}:")
                for lang, count in sorted(lang_dist.items()):
                    report_lines.append(f"    {lang}: {count}")
        
        report_lines.extend([
            "",
            "📈 复杂度分布:",
        ])
        
        for split_name in ["train", "validation", "test"]:
            comp_dist = self.stats["complexity_distribution"][split_name]
            if comp_dist:
                report_lines.append(f"  {split_name}:")
                for comp, count in sorted(comp_dist.items()):
                    report_lines.append(f"    {comp}: {count}")
        
        report_lines.extend([
            "",
            "🎴 卡牌类型分布:",
        ])
        
        for split_name in ["train", "validation", "test"]:
            super_dist = self.stats["supertype_distribution"][split_name]
            if super_dist:
                report_lines.append(f"  {split_name}:")
                for super_type, count in sorted(super_dist.items()):
                    report_lines.append(f"    {super_type}: {count}")
        
        report_lines.extend([
            "",
            "⚠️  数据质量:",
            f"  缺失图像：{self.stats['missing_images']}",
            f"  无效 JSON: {self.stats['invalid_json']}",
            f"  重复卡牌：{len(self.stats['duplicate_cards'])}",
        ])
        
        if self.stats["duplicate_cards"]:
            report_lines.append("  重复的卡牌 ID:")
            for card_id in list(self.stats["duplicate_cards"])[:10]:
                report_lines.append(f"    - {card_id}")
        
        report_lines.extend([
            "",
            "🖼️  图像尺寸统计:",
        ])
        
        if self.stats["image_sizes"]:
            widths = [s["width"] for s in self.stats["image_sizes"]]
            heights = [s["height"] for s in self.stats["image_sizes"]]
            report_lines.extend([
                f"  宽度：min={min(widths)}, max={max(widths)}, avg={sum(widths)/len(widths):.1f}",
                f"  高度：min={min(heights)}, max={max(heights)}, avg={sum(heights)/len(heights):.1f}",
            ])
        else:
            report_lines.append("  无图像尺寸数据")
        
        report_lines.extend([
            "",
            "📝 缺失字段统计:",
        ])
        
        if self.stats["missing_fields"]:
            for field, count in sorted(self.stats["missing_fields"].items(), key=lambda x: x[1], reverse=True):
                report_lines.append(f"  {field}: {count}")
        else:
            report_lines.append("  无缺失字段")
        
        report_lines.extend([
            "",
            "✅ 验证结论:",
        ])
        
        # 判断是否通过
        critical_issues = []
        if self.stats["total_samples"] < 1000:
            critical_issues.append(f"样本数不足 ({self.stats['total_samples']} < 1000)")
        if self.stats["invalid_json"] > 0:
            critical_issues.append(f"存在无效 JSON ({self.stats['invalid_json']} 条)")
        if self.stats["missing_images"] > self.stats["total_samples"] * 0.1:
            critical_issues.append(f"缺失图像过多 ({self.stats['missing_images']})")
        
        if critical_issues:
            report_lines.append("  ❌ 验证未通过，存在以下严重问题:")
            for issue in critical_issues:
                report_lines.append(f"    - {issue}")
        else:
            report_lines.append("  ✅ 验证通过，数据集质量良好")
        
        report_lines.extend([
            "",
            "💡 建议:",
        ])
        
        if self.stats["missing_images"] > 0:
            report_lines.append("  - 使用 --preprocess-images 选项重新导出数据")
        if self.stats["total_samples"] < 1500:
            report_lines.append("  - 考虑增加样本数到 1500+ 以获得更好的训练效果")
        
        # 检查语言平衡
        total_per_lang = defaultdict(int)
        for split_dist in self.stats["language_distribution"].values():
            for lang, count in split_dist.items():
                total_per_lang[lang] += count
        
        if total_per_lang:
            min_lang = min(total_per_lang.values())
            max_lang = max(total_per_lang.values())
            if max_lang - min_lang > min_lang * 0.2:
                report_lines.append("  - 语言分布不均衡，建议调整采样比例")
        
        report = "\n".join(report_lines)
        
        # 保存报告
        if output_path:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(report)
            logger.info(f"\n报告已保存到：{output_path}")
        
        return report


def main():
    parser = argparse.ArgumentParser(description="PTCG 数据集验证工具")
    parser.add_argument(
        "--dataset-dir",
        type=str,
        default="./datasets",
        help="数据集目录"
    )
    parser.add_argument(
        "--output-report",
        type=str,
        default=None,
        help="输出报告路径"
    )
    
    args = parser.parse_args()
    
    validator = DatasetValidator(args.dataset_dir)
    
    # 验证所有文件
    results = validator.validate_all()
    
    # 生成报告
    output_path = Path(args.output_report) if args.output_report else None
    report = validator.generate_report(output_path)
    
    # 打印报告
    print("\n" + report)
    
    # 返回状态码
    has_errors = any(not r["valid"] for r in results.values())
    sys.exit(1 if has_errors else 0)


if __name__ == "__main__":
    main()
