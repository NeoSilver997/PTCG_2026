#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Qwen-VL 测试结果分析工具

分析基准测试结果，生成详细的对比分析报告

使用方法:
    python analyze_results.py --benchmark-dir ./benchmarks
"""

import os
import sys
import json
import argparse
import logging
from pathlib import Path
from typing import Dict, List, Any
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ResultAnalyzer:
    """结果分析器"""
    
    def __init__(self, benchmark_dir: str):
        self.benchmark_dir = Path(benchmark_dir)
        self.results = []
        self.report = {}
    
    def load_results(self, results_path: str) -> Dict[str, Any]:
        """加载基准测试结果"""
        with open(results_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def analyze_errors(self, results: List[Dict]) -> Dict[str, Any]:
        """分析错误类型"""
        error_types = {
            "missing_name": 0,
            "missing_hp": 0,
            "missing_attacks": 0,
            "missing_abilities": 0,
            "wrong_type": 0,
            "json_parse_error": 0,
        }
        
        for result in results:
            if not result.get("success"):
                error_types["json_parse_error"] += 1
                continue
            
            # 检查关键字段
            predicted_text = result.get("predicted_json", "")
            if '"name"' not in predicted_text:
                error_types["missing_name"] += 1
            if '"hp"' not in predicted_text:
                error_types["missing_hp"] += 1
            if '"attacks"' not in predicted_text:
                error_types["missing_attacks"] += 1
        
        return error_types
    
    def analyze_by_complexity(self, results: List[Dict], test_data_path: str) -> Dict[str, Any]:
        """按卡牌复杂度分析性能"""
        # 加载测试数据获取复杂度信息
        complexity_stats = {
            "simple": {"correct": 0, "total": 0, "avg_time": 0},
            "medium": {"correct": 0, "total": 0, "avg_time": 0},
            "complex": {"correct": 0, "total": 0, "avg_time": 0},
        }
        
        # 这里简化处理，实际需要关联原始测试数据
        for result in results:
            # 默认归类为 medium
            complexity = "medium"
            complexity_stats[complexity]["total"] += 1
            if result.get("success"):
                complexity_stats[complexity]["correct"] += 1
            complexity_stats[complexity]["avg_time"] += result.get("inference_time_sec", 0)
        
        # 计算平均值
        for complexity in complexity_stats:
            total = complexity_stats[complexity]["total"]
            if total > 0:
                complexity_stats[complexity]["avg_time"] /= total
                complexity_stats[complexity]["accuracy"] = \
                    complexity_stats[complexity]["correct"] / total * 100
        
        return complexity_stats
    
    def generate_report(self, results_path: str, output_path: str):
        """生成详细分析报告"""
        results = self.load_results(results_path)
        
        report = {
            "summary": {
                "test_timestamp": results.get("timestamp", "unknown"),
                "total_samples": results.get("total_samples", 0),
                "success_rate": results.get("success_rate", 0),
            },
            "performance": {
                "timing": results.get("timing", {}),
            },
            "accuracy": {
                "field_accuracy": results.get("field_accuracy", {}),
            },
            "analysis": {
                "error_types": self.analyze_errors(results.get("detailed_results", [])),
                "by_complexity": self.analyze_by_complexity(
                    results.get("detailed_results", []),
                    ""
                ),
            },
            "recommendations": self._generate_recommendations(results),
        }
        
        # 保存报告
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        # 打印中文摘要
        self._print_chinese_summary(report)
        
        return report
    
    def _generate_recommendations(self, results: Dict) -> List[str]:
        """生成优化建议"""
        recommendations = []
        
        # 基于成功率
        success_rate = results.get("success_rate", 0)
        if success_rate < 80:
            recommendations.append("⚠️  成功率低于 80%，建议增加训练样本数或调整训练参数")
        elif success_rate < 90:
            recommendations.append("✓  成功率良好，可以考虑增加训练轮数进一步提升")
        else:
            recommendations.append("✅  成功率优秀，模型已准备好用于生产环境")
        
        # 基于推理时间
        avg_time = results.get("timing", {}).get("mean_sec", 0) * 1000
        if avg_time > 1000:
            recommendations.append(f"⚠️  平均推理时间 {avg_time:.0f}ms > 1000ms，建议启用 Flash Attention 或减小 batch size")
        elif avg_time > 800:
            recommendations.append(f"⚠️  平均推理时间 {avg_time:.0f}ms，可以考虑优化图像预处理")
        else:
            recommendations.append(f"✅  平均推理时间 {avg_time:.0f}ms，性能良好")
        
        # 基于字段准确率
        field_accuracy = results.get("field_accuracy", {})
        if field_accuracy.get("name", 0) < 90:
            recommendations.append("⚠️  卡牌名称识别率低于 90%，建议检查训练数据中的名称质量")
        if field_accuracy.get("hp", 0) < 90:
            recommendations.append("⚠️  HP 识别率低于 90%，建议增加 HP 字段的训练样本")
        if field_accuracy.get("attacks", 0) < 80:
            recommendations.append("⚠️  攻击识别率低于 80%，这是正常现象，攻击文本较长较复杂")
        
        return recommendations
    
    def _print_chinese_summary(self, report: Dict):
        """打印中文摘要"""
        print("\n" + "=" * 70)
        print("PTCG Qwen-VL 测试结果分析报告")
        print("=" * 70)
        
        print(f"\n📊 测试概况:")
        summary = report["summary"]
        print(f"  测试时间：{summary['test_timestamp']}")
        print(f"  测试样本：{summary['total_samples']} 张卡牌")
        print(f"  成功率：{summary['success_rate']:.1f}%")
        
        print(f"\n⏱️  性能指标:")
        timing = report["performance"]["timing"]
        print(f"  平均推理时间：{timing.get('mean_sec', 0)*1000:.1f} ms")
        print(f"  中位数时间：{timing.get('median_sec', 0)*1000:.1f} ms")
        print(f"  P95 延迟：{timing.get('p95_sec', 0)*1000:.1f} ms")
        print(f"  最快：{timing.get('min_sec', 0)*1000:.1f} ms")
        print(f"  最慢：{timing.get('max_sec', 0)*1000:.1f} ms")
        
        print(f"\n📝 识别准确率:")
        for field, acc in sorted(report["accuracy"]["field_accuracy"].items(), 
                                  key=lambda x: x[1], reverse=True):
            status = "✅" if acc >= 90 else "⚠️" if acc >= 80 else "❌"
            print(f"  {status} {field}: {acc:.1f}%")
        
        print(f"\n🔍 错误分析:")
        error_types = report["analysis"]["error_types"]
        for error_type, count in error_types.items():
            if count > 0:
                print(f"  - {error_type}: {count} 次")
        
        print(f"\n💡 优化建议:")
        for rec in report["recommendations"]:
            print(f"  {rec}")
        
        print("\n" + "=" * 70)
        print(f"详细报告已保存到：{self.benchmark_dir / 'analysis_report.json'}")
        print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description="PTCG Qwen-VL 结果分析工具")
    parser.add_argument(
        "--benchmark-dir",
        type=str,
        default="./benchmarks",
        help="基准测试结果目录"
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="输出报告路径"
    )
    
    args = parser.parse_args()
    
    results_path = Path(args.benchmark_dir) / "benchmark_results.json"
    
    if not os.path.exists(results_path):
        logger.error(f"结果文件不存在：{results_path}")
        sys.exit(1)
    
    analyzer = ResultAnalyzer(args.benchmark_dir)
    
    output_path = args.output or str(Path(args.benchmark_dir) / "analysis_report.json")
    report = analyzer.generate_report(results_path, output_path)
    
    logger.info("分析完成！")


if __name__ == "__main__":
    main()
