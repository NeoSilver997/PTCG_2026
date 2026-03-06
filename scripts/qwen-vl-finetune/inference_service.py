#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTCG Qwen-VL Inference Service

生产环境推理服务，提供 REST API 接口用于卡牌图像文本提取。

功能:
- 单张卡牌图像提取
- 批量处理
- 置信度评分
- 低置信度标记

API 端点:
- POST /api/cards/extract-from-image - 从图像提取卡牌信息
- POST /api/cards/batch-extract - 批量提取
- GET /health - 健康检查

使用方法:
    # 直接运行
    python inference_service.py --model-path ./outputs/final --port 8000
    
    # 使用 uvicorn
    uvicorn inference_service:app --host 0.0.0.0 --port 8000
"""

import os
import sys
import json
import time
import logging
import base64
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from contextlib import asynccontextmanager
from io import BytesIO

import torch
from PIL import Image
import numpy as np
from pydantic import BaseModel, Field

# FastAPI
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# 配置
# ============================================================================

class Config:
    """服务配置"""
    MODEL_PATH: str = os.getenv("MODEL_PATH", "./outputs/final")
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    CONFIDENCE_THRESHOLD: float = 0.7
    MAX_BATCH_SIZE: int = 10
    DEVICE: str = "cuda" if torch.cuda.is_available() else "cpu"


# ============================================================================
# Pydantic 模型
# ============================================================================

class CardExtraction(BaseModel):
    """卡牌提取结果"""
    name: Optional[str] = None
    hp: Optional[int] = None
    type: Optional[str] = None
    types: Optional[List[str]] = None
    subtype: Optional[str] = None
    subtypes: Optional[List[str]] = None
    supertype: Optional[str] = None
    abilities: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    attacks: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    weakness: Optional[Any] = None
    resistance: Optional[Any] = None
    retreatCost: Optional[Any] = None
    setCode: Optional[str] = None
    cardNumber: Optional[str] = None
    rarity: Optional[str] = None
    artist: Optional[str] = None
    evolutionStage: Optional[str] = None
    evolvesFrom: Optional[str] = None
    flavorText: Optional[str] = None


class ExtractionResponse(BaseModel):
    """提取响应"""
    success: bool
    data: Optional[CardExtraction] = None
    confidence: float = 0.0
    inference_time_ms: float = 0.0
    warnings: List[str] = Field(default_factory=list)
    error: Optional[str] = None


class BatchExtractionRequest(BaseModel):
    """批量提取请求"""
    images: List[str]  # base64 编码的图片列表


class BatchExtractionResponse(BaseModel):
    """批量提取响应"""
    success: bool
    results: List[ExtractionResponse]
    total_time_ms: float


# ============================================================================
# 模型推理类
# ============================================================================

class CardExtractor:
    """卡牌图像提取器"""
    
    def __init__(self, model_path: str, device: str = "cuda"):
        self.model_path = model_path
        self.device = device
        self.model = None
        self.processor = None
        self.is_loaded = False
    
    def load(self):
        """加载模型"""
        if self.is_loaded:
            return
        
        logger.info(f"加载模型：{self.model_path}")
        
        try:
            from transformers import AutoProcessor, AutoModelForVision2Seq
            
            self.processor = AutoProcessor.from_pretrained(
                self.model_path,
                trust_remote_code=True,
            )
            
            self.model = AutoModelForVision2Seq.from_pretrained(
                self.model_path,
                trust_remote_code=True,
                torch_dtype=torch.bfloat16 if self.device == "cuda" else torch.float32,
                device_map="auto" if self.device == "cuda" else None,
            )
            
            if self.device != "cuda":
                self.model = self.model.to(self.device)
            
            self.model.eval()
            self.is_loaded = True
            
            logger.info(f"✓ 模型加载完成，设备：{self.device}")
            
        except Exception as e:
            logger.error(f"模型加载失败：{e}")
            raise
    
    def predict(
        self,
        image: Image.Image,
        language: str = "en-US",
        max_new_tokens: int = 512,
    ) -> Tuple[CardExtraction, float, float]:
        """
        从图像提取卡牌信息
        
        Args:
            image: PIL 图片对象
            language: 语言 (ja-JP, zh-HK, en-US)
            max_new_tokens: 最大生成 token 数
        
        Returns:
            (提取结果，置信度，推理时间 ms)
        """
        if not self.is_loaded:
            raise RuntimeError("模型未加载")
        
        start_time = time.time()
        
        # 构建提示词
        prompt = self._get_prompt(language)
        
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
                    temperature=0.1,
                    do_sample=False,
                    pad_token_id=self.processor.tokenizer.pad_token_id,
                )
            
            # 解码
            generated_ids = outputs[0][inputs["input_ids"].shape[1]:]
            generated_text = self.processor.decode(
                generated_ids,
                skip_special_tokens=True,
            ).strip()
            
            # 解析 JSON
            extraction = self._parse_extraction(generated_text)
            
            # 计算置信度
            confidence = self._calculate_confidence(extraction, generated_text)
            
            inference_time = (time.time() - start_time) * 1000
            
            return extraction, confidence, inference_time
            
        except Exception as e:
            logger.error(f"推理失败：{e}")
            raise
    
    def _get_prompt(self, language: str) -> str:
        """获取对应语言的提示词"""
        prompts = {
            "ja-JP": "カードのすべての情報を JSON 形式で抽出してください。フィールド：name, hp, type, subtype, abilities (name/effect の配列), attacks (name/cost/damage/effect の配列), weakness, resistance, retreatCost, setCode, cardNumber, rarity, artist",
            "zh-HK": "以 JSON 格式提取所有卡牌資訊，包含欄位：name, hp, type, subtype, abilities (name/effect 陣列), attacks (name/cost/damage/effect 陣列), weakness, resistance, retreatCost, setCode, cardNumber, rarity, artist",
            "en-US": "Extract all card information in JSON format with fields: name, hp, type, subtype, abilities (array with name/effect), attacks (array with name/cost/damage/effect), weakness, resistance, retreatCost, setCode, cardNumber, rarity, artist"
        }
        return prompts.get(language, prompts["en-US"])
    
    def _parse_extraction(self, text: str) -> CardExtraction:
        """解析提取的文本为 CardExtraction 对象"""
        import re
        
        # 尝试直接解析
        try:
            data = json.loads(text)
            return CardExtraction(**data)
        except:
            pass
        
        # 尝试提取 JSON
        json_match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group(1))
                return CardExtraction(**data)
            except:
                pass
        
        # 尝试提取 { } 内容
        start = text.find('{')
        end = text.rfind('}') + 1
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start:end])
                return CardExtraction(**data)
            except:
                pass
        
        # 返回空对象
        return CardExtraction()
    
    def _calculate_confidence(
        self,
        extraction: CardExtraction,
        raw_text: str
    ) -> float:
        """
        计算置信度分数
        
        基于:
        - 提取字段的完整性
        - JSON 解析是否成功
        - 关键字段是否存在
        """
        confidence = 0.5  # 基础置信度
        
        # 检查关键字段
        key_fields = ["name", "hp", "type"]
        for field in key_fields:
            if getattr(extraction, field, None):
                confidence += 0.1
        
        # 检查 attacks 或 abilities
        if extraction.attacks or extraction.abilities:
            confidence += 0.1
        
        # 检查 JSON 是否有效解析
        if extraction.name:
            confidence += 0.1
        
        return min(confidence, 1.0)


# 全局提取器实例
extractor: Optional[CardExtractor] = None


# ============================================================================
# FastAPI 应用
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global extractor
    
    # 启动时加载模型
    extractor = CardExtractor(Config.MODEL_PATH, Config.DEVICE)
    extractor.load()
    
    yield
    
    # 关闭时清理（如果需要）
    logger.info("服务关闭")


app = FastAPI(
    title="PTCG Card Extraction API",
    description="宝可梦卡牌图像文本提取 API",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check():
    """健康检查"""
    if extractor and extractor.is_loaded:
        return {"status": "healthy", "model_loaded": True}
    return {"status": "unhealthy", "model_loaded": False}


@app.post("/api/cards/extract-from-image", response_model=ExtractionResponse)
async def extract_from_image(
    image: UploadFile = File(..., description="卡牌图像"),
    language: str = "en-US",
):
    """
    从卡牌图像提取信息
    
    Args:
        image: 卡牌图像文件
        language: 输出语言 (ja-JP, zh-HK, en-US)
    
    Returns:
        提取的卡牌信息
    """
    if not extractor or not extractor.is_loaded:
        raise HTTPException(status_code=503, detail="模型未就绪")
    
    # 验证文件
    if not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="必须是图像文件")
    
    contents = await image.read()
    if len(contents) > Config.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"文件过大，最大 {Config.MAX_FILE_SIZE // 1024 // 1024}MB")
    
    try:
        # 加载图像
        image_data = Image.open(BytesIO(contents)).convert("RGB")
        
        # 推理
        extraction, confidence, inference_time = extractor.predict(
            image_data,
            language=language,
        )
        
        # 检查置信度
        warnings = []
        if confidence < Config.CONFIDENCE_THRESHOLD:
            warnings.append(f"低置信度：{confidence:.2f} < {Config.CONFIDENCE_THRESHOLD}")
        
        return ExtractionResponse(
            success=True,
            data=extraction,
            confidence=confidence,
            inference_time_ms=inference_time,
            warnings=warnings,
        )
        
    except Exception as e:
        logger.error(f"提取失败：{e}")
        return ExtractionResponse(
            success=False,
            confidence=0.0,
            inference_time_ms=0.0,
            error=str(e),
        )


@app.post("/api/cards/extract-from-base64", response_model=ExtractionResponse)
async def extract_from_base64(
    image_base64: str,
    language: str = "en-US",
):
    """
    从 base64 编码的图像提取信息
    
    Args:
        image_base64: base64 编码的图像
        language: 输出语言
    
    Returns:
        提取的卡牌信息
    """
    if not extractor or not extractor.is_loaded:
        raise HTTPException(status_code=503, detail="模型未就绪")
    
    try:
        # 解码 base64
        image_data = base64.b64decode(image_base64)
        image = Image.open(BytesIO(image_data)).convert("RGB")
        
        # 推理
        extraction, confidence, inference_time = extractor.predict(
            image,
            language=language,
        )
        
        warnings = []
        if confidence < Config.CONFIDENCE_THRESHOLD:
            warnings.append(f"低置信度：{confidence:.2f}")
        
        return ExtractionResponse(
            success=True,
            data=extraction,
            confidence=confidence,
            inference_time_ms=inference_time,
            warnings=warnings,
        )
        
    except Exception as e:
        logger.error(f"提取失败：{e}")
        return ExtractionResponse(
            success=False,
            confidence=0.0,
            inference_time_ms=0.0,
            error=str(e),
        )


@app.post("/api/cards/batch-extract", response_model=BatchExtractionResponse)
async def batch_extract(
    request: BatchExtractionRequest,
    language: str = "en-US",
):
    """
    批量提取卡牌信息
    
    Args:
        request: 包含 base64 图像列表的请求
        language: 输出语言
    
    Returns:
        批量提取结果
    """
    if not extractor or not extractor.is_loaded:
        raise HTTPException(status_code=503, detail="模型未就绪")
    
    if len(request.images) > Config.MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"批量大小过大，最大 {Config.MAX_BATCH_SIZE}"
        )
    
    start_time = time.time()
    results = []
    
    for i, image_base64 in enumerate(request.images):
        try:
            image_data = base64.b64decode(image_base64)
            image = Image.open(BytesIO(image_data)).convert("RGB")
            
            extraction, confidence, inference_time = extractor.predict(
                image,
                language=language,
            )
            
            warnings = []
            if confidence < Config.CONFIDENCE_THRESHOLD:
                warnings.append(f"低置信度：{confidence:.2f}")
            
            results.append(ExtractionResponse(
                success=True,
                data=extraction,
                confidence=confidence,
                inference_time_ms=inference_time,
                warnings=warnings,
            ))
            
        except Exception as e:
            results.append(ExtractionResponse(
                success=False,
                confidence=0.0,
                inference_time_ms=0.0,
                error=str(e),
            ))
    
    total_time = (time.time() - start_time) * 1000
    
    return BatchExtractionResponse(
        success=True,
        results=results,
        total_time_ms=total_time,
    )


# ============================================================================
# CLI 入口
# ============================================================================

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="PTCG Qwen-VL 推理服务")
    parser.add_argument("--model-path", type=str, default=Config.MODEL_PATH,
                       help="模型路径")
    parser.add_argument("--port", type=int, default=Config.PORT,
                       help="服务端口")
    parser.add_argument("--host", type=str, default=Config.HOST,
                       help="服务主机")
    parser.add_argument("--device", type=str, default=Config.DEVICE,
                       help="运行设备")
    
    args = parser.parse_args()
    
    # 更新配置
    Config.MODEL_PATH = args.model_path
    Config.PORT = args.port
    Config.HOST = args.host
    Config.DEVICE = args.device
    
    # 启动服务
    import uvicorn
    
    logger.info(f"启动服务：http://{args.host}:{args.port}")
    logger.info(f"模型路径：{args.model_path}")
    logger.info(f"设备：{args.device}")
    
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
    )


if __name__ == "__main__":
    main()
