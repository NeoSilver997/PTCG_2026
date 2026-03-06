#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Qwen-VL Training Data Exporter (Memory Optimized for 16GB VRAM)

从 Prisma 数据库导出宝可梦卡牌数据，转换为 Qwen-VL 微调格式。
针对 RTX 5070 Ti 16GB VRAM 优化：
- 图像预处理：缩放到 512x512 减少显存占用
- 流式处理：避免一次性加载所有数据
- 4-bit QLoRA 兼容格式

使用方法:
    python export_training_data.py --output-dir ./datasets --samples 1800

依赖:
    pip install prisma python-dotenv pillow
"""

import os
import sys
import json
import argparse
import logging
import random
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from types import SimpleNamespace
from dotenv import load_dotenv
from PIL import Image
import io
import psycopg2
import psycopg2.extras

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('export.log', encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)

# 加载环境变量
load_dotenv()

# 设置路径
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent.parent
DATABASE_URL = os.getenv("DATABASE_URL", "")

# 图像预处理配置
IMAGE_CONFIG = {
    "max_size": 512,  # 最大边长（减少 VRAM 占用）
    "quality": 95,
    "format": "JPEG"
}


def setup_prisma():
    """初始化数据库连接（psycopg2 直连 PostgreSQL）"""
    if not DATABASE_URL:
        logger.error("请设置 DATABASE_URL 环境变量")
        sys.exit(1)
    try:
        # Strip Prisma-specific query params (e.g. ?schema=public) unsupported by psycopg2
        from urllib.parse import urlparse, urlencode, parse_qs, urlunparse
        parsed = urlparse(DATABASE_URL)
        params = parse_qs(parsed.query)
        params.pop("schema", None)
        clean_query = urlencode({k: v[0] for k, v in params.items()})
        clean_url = urlunparse(parsed._replace(query=clean_query))
        conn = psycopg2.connect(clean_url, cursor_factory=psycopg2.extras.RealDictCursor)
        logger.info("✓ 数据库连接成功")
        return conn
    except Exception as e:
        logger.error(f"✗ 数据库连接失败：{e}")
        sys.exit(1)


def connect_database(db):
    """验证数据库连接（psycopg2 直连模式下为空操作）"""
    return True


def preprocess_image(image_path: str, output_dir: Optional[Path] = None) -> Optional[str]:
    """
    预处理图像以减少显存占用
    
    Args:
        image_path: 原始图像路径
        output_dir: 输出目录（如果提供则保存预处理后的图像）
    
    Returns:
        预处理后的图像路径或 base64 编码
    """
    try:
        # 尝试加载图像
        if not os.path.exists(image_path):
            return None
        
        with Image.open(image_path) as img:
            # 转换为 RGB（如果需要）
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # 计算缩放比例
            max_size = IMAGE_CONFIG["max_size"]
            width, height = img.size
            
            if width > height:
                if width > max_size:
                    new_width = max_size
                    new_height = int(height * max_size / width)
                else:
                    new_width, new_height = width, height
            else:
                if height > max_size:
                    new_height = max_size
                    new_width = int(width * max_size / height)
                else:
                    new_width, new_height = width, height
            
            # 缩放图像
            if new_width != width or new_height != height:
                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # 保存或返回 base64
            if output_dir:
                output_path = output_dir / f"preprocessed_{Path(image_path).name}"
                img.save(output_path, format=IMAGE_CONFIG["format"], quality=IMAGE_CONFIG["quality"])
                return str(output_path)
            else:
                # 返回 base64 用于嵌入 JSON
                buffer = io.BytesIO()
                img.save(buffer, format=IMAGE_CONFIG["format"], quality=IMAGE_CONFIG["quality"])
                import base64
                return f"data:image/jpeg;base64,{base64.b64encode(buffer.getvalue()).decode('utf-8')}"
    
    except Exception as e:
        logger.warning(f"图像预处理失败 {image_path}: {e}")
        return None


def get_language_code(lang: str) -> str:
    """转换语言代码到标准格式"""
    mapping = {
        "JA_JP": "ja-JP",
        "ZH_TW": "zh-HK",
        "EN_US": "en-US"
    }
    return mapping.get(lang, lang)


def calculate_complexity(card: Any) -> str:
    """
    计算卡牌复杂度（用于平衡训练集）
    
    simple: 基础宝可梦，1-2 个攻击
    medium: 1 进化，1-2 个能力，2-3 个攻击
    complex: 2 进化，2+ 能力，3+ 攻击，或特殊机制（ex/V/VSTAR）
    """
    complexity_score = 0
    
    # 检查能力
    if card.abilities:
        if isinstance(card.abilities, list):
            complexity_score += len(card.abilities)
        else:
            complexity_score += 1
    
    # 检查攻击
    if card.attacks:
        if isinstance(card.attacks, list):
            complexity_score += len(card.attacks)
        else:
            complexity_score += 1
    
    # 检查进化阶段
    if card.evolutionStage:
        if card.evolutionStage == "STAGE_1":
            complexity_score += 1
        elif card.evolutionStage == "STAGE_2":
            complexity_score += 2
    
    # 检查特殊机制
    if card.ruleBox:
        complexity_score += 2
    
    if complexity_score <= 2:
        return "simple"
    elif complexity_score <= 4:
        return "medium"
    else:
        return "complex"


def format_card_for_training(
    card: Any, 
    image_path: str,
    preprocess_images: bool = True,
    output_dir: Optional[Path] = None
) -> Optional[Dict[str, Any]]:
    """
    将卡牌数据转换为 Qwen-VL 训练格式
    
    返回 Qwen 对话格式:
    {
        "messages": [
            {"role": "user", "content": [{"type": "image", "image": "path"}, {"type": "text", "text": "prompt"}]},
            {"role": "assistant", "content": [{"type": "text", "text": "json_response"}]}
        ],
        "metadata": {...}
    }
    """
    try:
        # 构建期望的 JSON 输出
        card_data = {
            "name": card.name,
            "hp": card.hp,
            "type": card.types[0] if card.types else None,
            "types": card.types,
            "subtype": card.subtypes[0] if card.subtypes else None,
            "subtypes": card.subtypes,
            "supertype": card.supertype,
            "abilities": card.abilities if card.abilities else [],
            "attacks": card.attacks if card.attacks else [],
            "weakness": None,
            "resistance": None,
            "retreatCost": None,
            "setCode": card.regionalExpansion.code if card.regionalExpansion else None,
            "cardNumber": card.cardNumber,
            "rarity": card.rarity,
            "artist": card.artist,
            "evolutionStage": card.evolutionStage,
            "evolvesFrom": card.evolvesFrom,
            "evolvesTo": card.evolvesTo,
            "flavorText": card.flavorText,
            "regulationMark": card.regulationMark,
            "language": get_language_code(card.language),
            "primaryCardId": card.primaryCardId,
            "webCardId": card.webCardId
        }
        
        # 清理 None 值
        card_data = {k: v for k, v in card_data.items() if v is not None}
        
        # 构建多语言提示词
        language = card.language
        if language == "JA_JP":
            prompt = "カードのすべての情報を JSON 形式で抽出してください。フィールド：name, hp, type, subtype, abilities (name/effect の配列), attacks (name/cost/damage/effect の配列), weakness, resistance, retreatCost, setCode, cardNumber, rarity, artist"
        elif language == "ZH_TW":
            prompt = "以 JSON 格式提取所有卡牌資訊，包含欄位：name, hp, type, subtype, abilities (name/effect 陣列), attacks (name/cost/damage/effect 陣列), weakness, resistance, retreatCost, setCode, cardNumber, rarity, artist"
        else:  # EN_US
            prompt = "Extract all card information in JSON format with fields: name, hp, type, subtype, abilities (array with name/effect), attacks (array with name/cost/damage/effect), weakness, resistance, retreatCost, setCode, cardNumber, rarity, artist"
        
        # 处理图像
        processed_image_path = None
        is_url = image_path.startswith("http://") or image_path.startswith("https://")
        
        if preprocess_images and not is_url:
            # 预处理本地图像（缩放）
            processed_image_path = preprocess_image(image_path, output_dir)
            if not processed_image_path:
                # 如果预处理失败，尝试使用原始路径
                if os.path.exists(image_path):
                    processed_image_path = image_path
                else:
                    logger.warning(f"  ⚠ 图像不可用：{image_path}")
                    return None
        elif is_url:
            # URL图像：直接使用URL（Qwen-VL支持URL图像）
            processed_image_path = image_path
        else:
            # 使用原始本地路径
            if os.path.exists(image_path):
                processed_image_path = image_path
            else:
                logger.warning(f"  ⚠ 图像不存在：{image_path}")
                return None
        
        return {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": processed_image_path},
                        {"type": "text", "text": prompt}
                    ]
                },
                {
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": json.dumps(card_data, ensure_ascii=False, indent=2)}
                    ]
                }
            ],
            "metadata": {
                "webCardId": card.webCardId,
                "language": get_language_code(card.language),
                "hasAbilities": len(card.abilities) > 0 if card.abilities else False,
                "hasAttacks": len(card.attacks) > 0 if card.attacks else False,
                "supertype": card.supertype,
                "complexity": calculate_complexity(card),
                "originalImagePath": image_path,
                "processedImagePath": processed_image_path
            }
        }
    except Exception as e:
        logger.error(f"  ✗ 处理卡牌 {card.webCardId} 时出错：{e}")
        return None


def get_image_path(card: Any, data_dir: Path) -> Tuple[str, bool]:
    """
    获取卡牌图像的本地路径
    
    Returns:
        (图像路径，是否找到)
    """
    wid = card.webCardId
    exp_code = card.regionalExpansion.code if card.regionalExpansion else None

    # Determine region subdir based on language
    lang = card.language
    if lang == "JA_JP":
        region_dirs = ["japan", "japan_legacy"]
    elif lang in ("ZH_TW", "ZH_HK"):
        region_dirs = ["hk"]
    else:
        region_dirs = ["en"]

    # 1. Search in data/images/cards/{region}/{expansion}/{webCardId}.{ext}
    for rdir in region_dirs:
        base = data_dir / "images" / "cards" / rdir
        subdirs = [exp_code] if exp_code else []
        # Also search all expansion subdirs as fallback
        try:
            subdirs += [d.name for d in base.iterdir() if d.is_dir() and d.name != exp_code]
        except Exception:
            pass
        for sub in subdirs:
            for ext in ("jpg", "png", "jpeg", "webp"):
                p = base / sub / f"{wid}.{ext}"
                if p.exists():
                    return str(p), True
        # Flat within region dir
        for ext in ("jpg", "png", "jpeg", "webp"):
            p = base / f"{wid}.{ext}"
            if p.exists():
                return str(p), True

    # 2. Flat fallback in data/images/cards/
    for ext in ("jpg", "png", "jpeg", "webp"):
        p = data_dir / "images" / "cards" / f"{wid}.{ext}"
        if p.exists():
            return str(p), True

    # 3. Legacy flat path data/cards/
    for ext in ("jpg", "png"):
        p = data_dir / "cards" / f"{wid}.{ext}"
        if p.exists():
            return str(p), True

    # 4. Fall back to database URL
    if card.imageUrlHiRes:
        return card.imageUrlHiRes, False  # False = URL, not local file
    elif card.imageUrl:
        return card.imageUrl, False

    return "", False


def _rows_to_cards(rows) -> List[Any]:
    """Convert psycopg2 RealDict rows to SimpleNamespace objects matching old Prisma API."""
    cards = []
    for row in rows:
        re_code = row.get("expansionCode")
        regional_expansion = SimpleNamespace(code=re_code) if re_code else None
        abilities = row.get("abilities")
        if isinstance(abilities, str):
            try:
                abilities = json.loads(abilities)
            except Exception:
                abilities = []
        attacks = row.get("attacks")
        if isinstance(attacks, str):
            try:
                attacks = json.loads(attacks)
            except Exception:
                attacks = []
        card = SimpleNamespace(
            id=row.get("id"),
            primaryCardId=row.get("primaryCardId"),
            webCardId=row.get("webCardId"),
            language=row.get("language"),
            variantType=row.get("variantType"),
            name=row.get("name") or "",
            supertype=row.get("supertype"),
            subtypes=list(row.get("subtypes") or []),
            hp=row.get("hp"),
            types=list(row.get("types") or []),
            ruleBox=row.get("ruleBox"),
            abilities=abilities if abilities else [],
            attacks=attacks if attacks else [],
            flavorText=row.get("flavorText"),
            artist=row.get("artist"),
            rarity=row.get("rarity"),
            regulationMark=row.get("regulationMark"),
            imageUrl=row.get("imageUrl"),
            imageUrlHiRes=row.get("imageUrlHiRes"),
            createdAt=row.get("createdAt"),
            evolutionStage=row.get("evolutionStage"),
            regionalExpansionId=row.get("regionalExpansionId"),
            evolvesFrom=row.get("evolvesFrom"),
            evolvesTo=row.get("evolvesTo"),
            cardNumber=row.get("cardNumber"),
            regionalExpansion=regional_expansion,
        )
        cards.append(card)
    return cards


def _query_cards(conn, language: str, supertype: str, limit: int) -> List[Any]:
    """Execute SQL to fetch cards with regionalExpansion and primaryCard data."""
    sql = """
        SELECT
            c.id, c."primaryCardId", c."webCardId", c.language, c."variantType",
            c.name, c.supertype, c.subtypes, c.hp, c.types, c."ruleBox",
            c.abilities, c.attacks, c."flavorText", c.artist, c.rarity,
            c."regulationMark", c."imageUrl", c."imageUrlHiRes", c."createdAt",
            c."evolutionStage", c."regionalExpansionId", c."evolvesFrom", c."evolvesTo",
            re.code AS "expansionCode",
            pc."cardNumber"
        FROM cards c
        LEFT JOIN regional_expansions re ON c."regionalExpansionId" = re.id
        LEFT JOIN primary_cards pc ON c."primaryCardId" = pc.id
        WHERE c.language = %s
          AND c.supertype = %s
          AND c.name IS NOT NULL AND c.name != ''
          AND (%s != 'POKEMON' OR c.hp IS NOT NULL)
        ORDER BY c."createdAt" DESC
        LIMIT %s
    """
    with conn.cursor() as cur:
        cur.execute(sql, (language, supertype, supertype, limit))
        rows = cur.fetchall()
    return _rows_to_cards(rows)


def query_cards_with_balance(
    db,
    target_samples: int = 1800,
    data_dir: Optional[Path] = None
) -> List[Any]:
    """
    查询数据库中的卡牌，确保语言平衡和复杂度平衡
    
    目标：每种语言至少 500 张，总计 target_samples 张
    复杂度分布：simple 40%, medium 40%, complex 20%
    """
    languages = ["JA_JP", "ZH_TW", "EN_US"]
    samples_per_language = target_samples // len(languages)
    
    all_cards = []
    
    for lang in languages:
        logger.info(f"\n正在查询 {lang} 语言卡牌...")
        
        try:
            # 查询具有完整信息的卡牌
            cards = _query_cards(db, lang, "POKEMON", samples_per_language + 200)
            
            # 过滤掉没有图像的卡牌
            valid_cards = []
            for card in cards:
                image_path, found = get_image_path(card, data_dir) if data_dir else ("", False)
                
                # 检查是否有图像
                has_image = (
                    found or
                    card.imageUrl or 
                    card.imageUrlHiRes
                )
                
                if has_image:
                    valid_cards.append(card)
            
            logger.info(f"  ✓ 找到 {len(valid_cards)} 张有效卡牌")
            
            # 按复杂度分层采样
            complexity_groups = {"simple": [], "medium": [], "complex": []}
            for card in valid_cards:
                complexity = calculate_complexity(card)
                complexity_groups[complexity].append(card)
            
            # 目标复杂度分布
            target_distribution = {"simple": 0.4, "medium": 0.4, "complex": 0.2}
            sampled_cards = []
            
            for complexity, target_ratio in target_distribution.items():
                target_count = int(samples_per_language * target_ratio)
                available = complexity_groups[complexity]
                
                if len(available) >= target_count:
                    sampled = random.sample(available, target_count)
                else:
                    sampled = available
                
                sampled_cards.extend(sampled)
                logger.info(f"    {complexity}: {len(sampled)} 张")
            
            # 如果不够，补充
            if len(sampled_cards) < samples_per_language:
                remaining = samples_per_language - len(sampled_cards)
                all_available = [c for c in valid_cards if c not in sampled_cards]
                if len(all_available) > remaining:
                    sampled_cards.extend(random.sample(all_available, remaining))
                else:
                    sampled_cards.extend(all_available)
            
            all_cards.extend(sampled_cards)
            
        except Exception as e:
            logger.error(f"  ✗ 查询 {lang} 失败：{e}")
    
    # 如果宝可梦卡不够，补充训练师卡
    if len(all_cards) < target_samples:
        logger.info("\n补充训练师卡...")
        remaining = target_samples - len(all_cards)
        
        for lang in languages:
            trainer_cards = _query_cards(db, lang, "TRAINER", remaining // len(languages) + 50)
            
            valid_trainers = []
            for card in trainer_cards:
                image_path, found = get_image_path(card, data_dir) if data_dir else ("", False)
                has_image = found or card.imageUrl or card.imageUrlHiRes
                if has_image:
                    valid_trainers.append(card)
            
            if len(valid_trainers) > remaining // len(languages):
                sampled = random.sample(valid_trainers, remaining // len(languages))
            else:
                sampled = valid_trainers
            
            all_cards.extend(sampled)
            
            if len(all_cards) >= target_samples:
                break
    
    return all_cards[:target_samples]


def export_to_jsonl(
    cards: List[Any], 
    output_path: Path,
    data_dir: Optional[Path] = None,
    preprocess_images: bool = False,
    preprocessed_dir: Optional[Path] = None
) -> Tuple[int, int]:
    """
    导出为 JSONL 格式（每行一个样本，节省内存）
    
    Returns:
        (成功数量，失败数量)
    """
    success_count = 0
    failure_count = 0
    
    if preprocess_images and preprocessed_dir:
        preprocessed_dir.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as f:
        for i, card in enumerate(cards):
            image_path, found = get_image_path(card, data_dir) if data_dir else ("", False)
            
            training_sample = format_card_for_training(
                card, 
                image_path,
                preprocess_images=preprocess_images,
                output_dir=preprocessed_dir if preprocess_images else None
            )
            
            if training_sample:
                # JSONL 格式：每行一个 JSON 对象
                f.write(json.dumps(training_sample, ensure_ascii=False) + "\n")
                success_count += 1
            else:
                failure_count += 1
            
            if (i + 1) % 100 == 0:
                logger.info(f"  处理进度：{i + 1}/{len(cards)}")
    
    logger.info(f"\n✓ 导出完成：{success_count} 成功，{failure_count} 失败")
    logger.info(f"  输出文件：{output_path}")
    
    return success_count, failure_count


def split_dataset_jsonl(
    input_path: Path, 
    output_dir: Path, 
    ratios: Tuple[float, float, float] = (0.8, 0.1, 0.1)
):
    """
    分割 JSONL 数据集为训练/验证/测试集
    
    使用流式读取避免内存溢出
    """
    logger.info(f"\n正在分割数据集...")
    
    # 第一遍：读取所有行到列表（对于 1800 条数据，内存占用可控）
    all_samples = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                all_samples.append(json.loads(line))
    
    # 按语言和复杂度分组
    groups = {
        "ja-JP": {"simple": [], "medium": [], "complex": []},
        "zh-HK": {"simple": [], "medium": [], "complex": []},
        "en-US": {"simple": [], "medium": [], "complex": []}
    }
    
    for sample in all_samples:
        lang = sample["metadata"]["language"]
        complexity = sample["metadata"]["complexity"]
        if lang in groups and complexity in groups[lang]:
            groups[lang][complexity].append(sample)
    
    # 从每组中按比例分割
    train_data = []
    val_data = []
    test_data = []
    
    for lang in groups:
        for complexity in groups[lang]:
            samples = groups[lang][complexity]
            random.shuffle(samples)
            
            n = len(samples)
            train_end = int(n * ratios[0])
            val_end = train_end + int(n * ratios[1])
            
            train_data.extend(samples[:train_end])
            val_data.extend(samples[train_end:val_end])
            test_data.extend(samples[val_end:])
    
    # 再次打乱
    random.shuffle(train_data)
    random.shuffle(val_data)
    random.shuffle(test_data)
    
    # 保存分割后的数据集（JSONL 格式）
    train_path = output_dir / "train.jsonl"
    val_path = output_dir / "validation.jsonl"
    test_path = output_dir / "test.jsonl"
    
    with open(train_path, "w", encoding="utf-8") as f:
        for sample in train_data:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")
    
    with open(val_path, "w", encoding="utf-8") as f:
        for sample in val_data:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")
    
    with open(test_path, "w", encoding="utf-8") as f:
        for sample in test_data:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")
    
    # 统计信息
    logger.info(f"\n数据集分割统计:")
    logger.info(f"  训练集：{len(train_data)} 样本 ({ratios[0]*100:.0f}%)")
    logger.info(f"  验证集：{len(val_data)} 样本 ({ratios[1]*100:.0f}%)")
    logger.info(f"  测试集：{len(test_data)} 样本 ({ratios[2]*100:.0f}%)")
    
    # 语言分布
    for split_name, split_data in [("训练集", train_data), ("验证集", val_data), ("测试集", test_data)]:
        lang_counts = {}
        complexity_counts = {}
        for sample in split_data:
            lang = sample["metadata"]["language"]
            complexity = sample["metadata"]["complexity"]
            lang_counts[lang] = lang_counts.get(lang, 0) + 1
            complexity_counts[complexity] = complexity_counts.get(complexity, 0) + 1
        
        logger.info(f"  {split_name} 语言分布：{lang_counts}")
        logger.info(f"  {split_name} 复杂度分布：{complexity_counts}")
    
    # 创建数据集信息文件
    dataset_info = {
        "total_samples": len(all_samples),
        "train_samples": len(train_data),
        "val_samples": len(val_data),
        "test_samples": len(test_data),
        "language_distribution": {
            lang: {
                complexity: len(samples)
                for complexity, samples in groups[lang].items()
            }
            for lang in groups
        },
        "split_ratios": ratios,
        "created_at": datetime.now().isoformat(),
        "image_config": IMAGE_CONFIG
    }
    
    with open(output_dir / "dataset_info.json", "w", encoding="utf-8") as f:
        json.dump(dataset_info, f, ensure_ascii=False, indent=2)
    
    logger.info(f"\n✓ 数据集信息已保存到：{output_dir / 'dataset_info.json'}")
    
    return train_path, val_path, test_path


def create_huggingface_dataset(output_dir: Path):
    """
    创建 HuggingFace Dataset 格式（可选）
    """
    try:
        from datasets import Dataset, DatasetDict
        
        logger.info("\n正在创建 HuggingFace Dataset 格式...")
        
        # 读取 JSONL 文件
        train_data = []
        with open(output_dir / "train.jsonl", "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    train_data.append(json.loads(line))
        
        val_data = []
        with open(output_dir / "validation.jsonl", "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    val_data.append(json.loads(line))
        
        test_data = []
        with open(output_dir / "test.jsonl", "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    test_data.append(json.loads(line))
        
        # 创建 Dataset
        train_dataset = Dataset.from_list(train_data)
        val_dataset = Dataset.from_list(val_data)
        test_dataset = Dataset.from_list(test_data)
        
        # 创建 DatasetDict
        dataset_dict = DatasetDict({
            "train": train_dataset,
            "validation": val_dataset,
            "test": test_dataset
        })
        
        # 保存
        dataset_dict.save_to_disk(str(output_dir / "hf_dataset"))
        
        logger.info(f"✓ HuggingFace Dataset 已保存到：{output_dir / 'hf_dataset'}")
        
    except ImportError:
        logger.warning("⚠ datasets 库未安装，跳过 HuggingFace Dataset 创建")
        logger.warning("   安装：pip install datasets")
    except Exception as e:
        logger.error(f"✗ 创建 HuggingFace Dataset 失败：{e}")


def main():
    parser = argparse.ArgumentParser(
        description="PTCG Qwen-VL 训练数据导出器 (16GB VRAM 优化版)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 导出 1800 张卡牌
  python export_training_data.py --samples 1800
  
  # 预处理图像（缩放到 512x512）
  python export_training_data.py --samples 1800 --preprocess-images
  
  # 跳过数据库查询，仅处理现有数据
  python export_training_data.py --skip-db
        """
    )
    
    parser.add_argument(
        "--output-dir", 
        type=str, 
        default="./datasets",
        help="输出目录"
    )
    parser.add_argument(
        "--samples", 
        type=int, 
        default=1800,
        help="目标样本数量"
    )
    parser.add_argument(
        "--skip-db", 
        action="store_true",
        help="跳过数据库查询，仅处理现有数据"
    )
    parser.add_argument(
        "--preprocess-images", 
        action="store_true",
        help="预处理图像（缩放到 512x512，减少 VRAM 占用）"
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default="../../data",
        help="数据目录（包含卡牌图像）"
    )
    
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    data_dir = Path(args.data_dir)
    
    # 创建预处理图像目录
    preprocessed_dir = output_dir / "preprocessed_images" if args.preprocess_images else None
    
    logger.info("=" * 70)
    logger.info("PTCG Qwen-VL 训练数据导出器 (RTX 5070 Ti 16GB 优化)")
    logger.info("=" * 70)
    logger.info(f"目标样本数：{args.samples}")
    logger.info(f"输出目录：{output_dir}")
    logger.info(f"图像预处理：{'启用' if args.preprocess_images else '禁用'}")
    if args.preprocess_images:
        logger.info(f"图像配置：{IMAGE_CONFIG['max_size']}x{IMAGE_CONFIG['max_size']} max")
    logger.info("=" * 70)
    
    if not args.skip_db:
        # 初始化 Prisma
        db = setup_prisma()
        connect_database(db)
        
        # 查询卡牌
        cards = query_cards_with_balance(db, args.samples, data_dir)
        logger.info(f"\n总共查询到 {len(cards)} 张卡牌")
        
        # 导出为 JSONL 格式
        raw_output = output_dir / "raw_cards.jsonl"
        export_to_jsonl(
            cards, 
            raw_output,
            data_dir=data_dir if data_dir.exists() else None,
            preprocess_images=args.preprocess_images,
            preprocessed_dir=preprocessed_dir
        )
        
        # 分割数据集
        split_dataset_jsonl(raw_output, output_dir)
        
        # 创建 HuggingFace Dataset 格式
        create_huggingface_dataset(output_dir)
        
        # 关闭数据库连接
        db.close()
    else:
        logger.info("跳过数据库查询模式")
        # 处理现有数据
        raw_output = output_dir / "raw_cards.jsonl"
        if raw_output.exists():
            split_dataset_jsonl(raw_output, output_dir)
            create_huggingface_dataset(output_dir)
        else:
            logger.error("错误：未找到原始数据文件")
            sys.exit(1)
    
    logger.info("\n" + "=" * 70)
    logger.info("数据导出完成！")
    logger.info("=" * 70)
    logger.info(f"\n输出文件:")
    logger.info(f"  - 训练集：{output_dir / 'train.jsonl'}")
    logger.info(f"  - 验证集：{output_dir / 'validation.jsonl'}")
    logger.info(f"  - 测试集：{output_dir / 'test.jsonl'}")
    logger.info(f"  - 数据集信息：{output_dir / 'dataset_info.json'}")
    if args.preprocess_images:
        logger.info(f"  - 预处理图像：{preprocessed_dir}")
    logger.info("\n下一步:")
    logger.info("  1. 检查数据集信息：cat dataset_info.json")
    logger.info("  2. 开始微调：python finetune_qwen_vl.py --data-dir ./datasets")
    logger.info("=" * 70)


if __name__ == "__main__":
    main()
