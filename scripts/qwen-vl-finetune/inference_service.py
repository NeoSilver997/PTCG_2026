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
import re
import time
import logging
import base64
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from contextlib import asynccontextmanager
from io import BytesIO

import torch
from PIL import Image
from pydantic import BaseModel, Field

# FastAPI
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# 設置日志
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ============================================================================
# 配置
# ============================================================================

class Config:
    """服務配置"""
    # BnB 4-bit + LoRA adapter path (proven 99% accuracy)
    ADAPTER_PATH: str = os.getenv("ADAPTER_PATH", "./outputs/qlora_v4/final")
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    CONFIDENCE_THRESHOLD: float = 0.7
    MAX_BATCH_SIZE: int = 10
    COMPILE: bool = os.getenv("TORCH_COMPILE", "1") == "1"
    FLASH_ATTN: bool = os.getenv("FLASH_ATTN", "0") == "1"
    # Quantization: "4bit" (BnB nf4, default), "int8" (BnB int8), "bf16" (no quant)
    QUANTIZE: str = os.getenv("QUANTIZE", "4bit")
    # Image resolution: reduce to speed up prefill (lower → faster, may reduce accuracy)
    MAX_PIXELS: int = int(os.getenv("MAX_PIXELS", str(1280 * 28 * 28)))  # default full-res
    MIN_PIXELS: int = int(os.getenv("MIN_PIXELS", str(256 * 28 * 28)))


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
    prefill_ms: float = 0.0      # time to first token (prefill phase)
    decode_ms: float = 0.0       # generation time after first token
    tokens_in: int = 0           # input token count (visual + text)
    tokens_out: int = 0          # output token count generated
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
    """卡牌圖像提取器 – BnB 4-bit nf4 + LoRA adapter (proven 99% accuracy)"""

    PROMPT = (
        '{"name": "...", "hp": ..., "types": [...], "supertype": "...", "subtype": "...", '
        '"rarity": "...", "expansion": "...", "card_number": "...", '
        '"attacks": [{"name": "...", "cost": [...], "damage": "...", "effect": "..."}], '
        '"abilities": [{"name": "...", "type": "...", "effect": "..."}], '
        '"retreat_cost": ..., "artist": "..."}'
    )
    PROMPT_TEXT = (
        "Look at this Pokemon Trading Card Game card image. "
        "Extract ALL visible information and return ONLY a JSON object. "
        "Return null for any field not visible. Format: " + PROMPT
    )

    def __init__(self, adapter_path: str, compile_model: bool = True):
        self.adapter_path = Path(adapter_path)
        self.compile_model = compile_model
        self.model = None
        self.processor = None
        self.is_loaded = False

    def load(self):
        """Load model + LoRA adapter — stays in VRAM.
        
        Quantize modes:
          4bit  – BnB nf4, 6.1 GB VRAM, ~17 tok/s decode (current default)
          int8  – BnB int8, 8.0 GB VRAM, ~25 tok/s decode (estimated)
          bf16  – no quantization, ~14 GB VRAM, ~40 tok/s decode (estimated)
        """
        if self.is_loaded:
            return

        from transformers import AutoProcessor, BitsAndBytesConfig
        try:
            from transformers import AutoModelForVision2Seq
        except ImportError:
            from transformers import AutoModelForImageTextToText as AutoModelForVision2Seq
        from peft import PeftModel, PeftConfig

        logger.info(f"Loading adapter from: {self.adapter_path}")
        peft_cfg = PeftConfig.from_pretrained(str(self.adapter_path))
        base_id = peft_cfg.base_model_name_or_path
        logger.info(f"Base model: {base_id}")

        logger.info(f"max_pixels={Config.MAX_PIXELS} min_pixels={Config.MIN_PIXELS}")
        self.processor = AutoProcessor.from_pretrained(
            base_id,
            trust_remote_code=True,
            min_pixels=Config.MIN_PIXELS,
            max_pixels=Config.MAX_PIXELS,
        )
        self.processor.tokenizer.padding_side = "left"  # required for batch generate

        attn_impl = "flash_attention_2" if Config.FLASH_ATTN else "sdpa"
        logger.info(f"Quantize mode: {Config.QUANTIZE} | Attention: {attn_impl}")

        if Config.QUANTIZE == "bf16":
            base_model = AutoModelForVision2Seq.from_pretrained(
                base_id,
                torch_dtype=torch.bfloat16,
                device_map="auto",
                attn_implementation=attn_impl,
                trust_remote_code=True,
            )
        elif Config.QUANTIZE == "int8":
            bnb_config = BitsAndBytesConfig(load_in_8bit=True)
            base_model = AutoModelForVision2Seq.from_pretrained(
                base_id,
                quantization_config=bnb_config,
                device_map="auto",
                attn_implementation=attn_impl,
                trust_remote_code=True,
            )
        else:  # 4bit (default)
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
            )
            base_model = AutoModelForVision2Seq.from_pretrained(
                base_id,
                quantization_config=bnb_config,
                device_map="auto",
                attn_implementation=attn_impl,
                trust_remote_code=True,
            )
        self.model = PeftModel.from_pretrained(base_model, str(self.adapter_path))
        self.model.eval()

        # Enable cuDNN flash attention (fastest on Windows without nvcc)
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.enable_cudnn_sdp(True)
        torch.backends.cuda.enable_flash_sdp(True)
        torch.backends.cuda.enable_mem_efficient_sdp(True)

        if self.compile_model:
            try:
                self.model = torch.compile(self.model, mode="default", fullgraph=False)
                logger.info("torch.compile applied (mode=default)")
            except Exception as e:
                logger.warning(f"torch.compile skipped: {e}")

        vram = torch.cuda.memory_allocated() / 1e9
        logger.info(f"Model ready. VRAM used: {vram:.2f} GB")
        self.is_loaded = True
    
    @staticmethod
    def _estimate_max_tokens(image: Image.Image) -> int:
        """
        Dynamic token budget based on image size proxy.
        Larger images = more card text = more output tokens needed.
        Benchmarks show complex JP cards need 350-450 tokens; simple Energy/Basic ~180.
        """
        px = image.width * image.height
        if px < 150_000:   # small/thumbnail
            return 300
        if px < 400_000:   # medium (448px card)
            return 420
        return 512          # full-res card (safe max)

    def predict(
        self,
        image: Image.Image,
        max_new_tokens: Optional[int] = None,
    ) -> Tuple[CardExtraction, float, float, float, float, int, int]:
        """
        Extract card info from image.
        Returns (extraction, confidence, total_ms, prefill_ms, decode_ms, n_in, n_out)
        """
        if not self.is_loaded:
            raise RuntimeError("Model not loaded – call load() first")

        tokens = max_new_tokens or self._estimate_max_tokens(image)

        conversation = [{
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text",  "text": self.PROMPT_TEXT},
            ],
        }]

        inputs = self.processor.apply_chat_template(
            conversation,
            tokenize=True,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
        )
        inputs = {k: v.to(self.model.device) if hasattr(v, "to") else v
                  for k, v in inputs.items()}

        n_in = inputs["input_ids"].shape[1]

        t0 = time.time()
        with torch.no_grad():
            out = self.model.generate(
                **inputs,
                max_new_tokens=tokens,
                do_sample=False,
                pad_token_id=self.processor.tokenizer.eos_token_id,
                eos_token_id=self.processor.tokenizer.eos_token_id,
            )
        t_total = time.time() - t0

        gen_ids = out[0][n_in:]
        text = self.processor.decode(gen_ids, skip_special_tokens=True).strip()

        n_out = len(gen_ids)
        logger.info(
            f"Tokens: in={n_in} out={n_out} | total={t_total:.2f}s "
            f"({n_out/max(t_total, 0.01):.1f} tok/s)"
        )

        extraction = self._parse_extraction(text)
        confidence = self._calculate_confidence(extraction, text)
        return extraction, confidence, t_total * 1000, 0.0, t_total * 1000, n_in, n_out

    def batch_predict(
        self,
        images: List[Image.Image],
        max_new_tokens: Optional[int] = None,
    ) -> List[Tuple[CardExtraction, float, float]]:
        """
        True-batch inference: process N images simultaneously via model.generate(batch).
        ~3.5× faster per-card for batch=4 vs sequential predict() calls.
        Returns list of (extraction, confidence, inference_time_ms) per image.
        """
        if not self.is_loaded:
            raise RuntimeError("Model not loaded – call load() first")

        tokens = max_new_tokens or max(self._estimate_max_tokens(img) for img in images)

        conversations = [
            [{"role": "user", "content": [
                {"type": "image", "image": img},
                {"type": "text",  "text": self.PROMPT_TEXT},
            ]}]
            for img in images
        ]

        inputs = self.processor.apply_chat_template(
            conversations,
            tokenize=True,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
            padding=True,
        )
        inputs = {k: v.to(self.model.device) if hasattr(v, "to") else v
                  for k, v in inputs.items()}

        n_in = inputs["input_ids"].shape[1]  # padded input length (same for all)

        t0 = time.time()
        with torch.no_grad():
            out = self.model.generate(
                **inputs,
                max_new_tokens=tokens,
                do_sample=False,
                pad_token_id=self.processor.tokenizer.eos_token_id,
                eos_token_id=self.processor.tokenizer.eos_token_id,
            )
        t_total = time.time() - t0
        ms_per_card = t_total * 1000 / len(images)

        results = []
        total_out = 0
        eos_id = self.processor.tokenizer.eos_token_id
        for i in range(len(images)):
            gen_ids = out[i][n_in:]
            # Trim at first EOS to remove padding
            eos_pos = (gen_ids == eos_id).nonzero(as_tuple=True)[0]
            if len(eos_pos) > 0:
                gen_ids = gen_ids[:eos_pos[0]]
            total_out += len(gen_ids)
            text = self.processor.decode(gen_ids, skip_special_tokens=True).strip()
            extraction = self._parse_extraction(text)
            confidence = self._calculate_confidence(extraction, text)
            results.append((extraction, confidence, ms_per_card))

        logger.info(
            f"Batch={len(images)}: total_out={total_out} | "
            f"{t_total:.2f}s total | {t_total/len(images):.2f}s/card | "
            f"{total_out/max(t_total, 0.01):.1f} tok/s"
        )
        return results

    def _parse_extraction(self, text: str) -> CardExtraction:
        """Parse model output → CardExtraction, tolerant of markdown fences."""
        for attempt in (text,
                        re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL) and
                        re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL).group(1)):
            if not attempt:
                continue
            try:
                return CardExtraction(**json.loads(attempt))
            except Exception:
                pass
        # last resort: grab first {...}
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            try:
                return CardExtraction(**json.loads(m.group()))
            except Exception:
                pass
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


# ── Global extractor (loaded once at startup) ────────────────────────────────
extractor: Optional[CardExtractor] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global extractor
    extractor = CardExtractor(
        adapter_path=Config.ADAPTER_PATH,
        compile_model=Config.COMPILE,
    )
    extractor.load()
    logger.info("Service ready")
    yield
    logger.info("Service shutdown")


app = FastAPI(
    title="PTCG Card Extraction API",
    description="Pokemon TCG card image text extraction – BnB 4-bit (99% accuracy)",
    version="2.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
        extraction, confidence, inference_time, prefill_ms, decode_ms, n_in, n_out = extractor.predict(image_data)

        # 检查置信度
        warnings = []
        if confidence < Config.CONFIDENCE_THRESHOLD:
            warnings.append(f"低置信度：{confidence:.2f} < {Config.CONFIDENCE_THRESHOLD}")
        
        return ExtractionResponse(
            success=True,
            data=extraction,
            confidence=confidence,
            inference_time_ms=inference_time,
            prefill_ms=prefill_ms,
            decode_ms=decode_ms,
            tokens_in=n_in,
            tokens_out=n_out,
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
        extraction, confidence, inference_time, prefill_ms, decode_ms, n_in, n_out = extractor.predict(image)

        warnings = []
        if confidence < Config.CONFIDENCE_THRESHOLD:
            warnings.append(f"Low confidence: {confidence:.2f}")

        return ExtractionResponse(
            success=True,
            data=extraction,
            confidence=confidence,
            inference_time_ms=inference_time,
            prefill_ms=prefill_ms,
            decode_ms=decode_ms,
            tokens_in=n_in,
            tokens_out=n_out,
            warnings=warnings,
        )

    except Exception as e:
        logger.error(f"extraction failed: {e}")
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

    # Decode all images first
    images: list[Image.Image] = []
    decode_errors: list[str | None] = []
    for image_base64 in request.images:
        try:
            image_data = base64.b64decode(image_base64)
            images.append(Image.open(BytesIO(image_data)).convert("RGB"))
            decode_errors.append(None)
        except Exception as e:
            images.append(None)  # placeholder
            decode_errors.append(str(e))

    # Split into valid/invalid images for true batch inference
    valid_indices = [i for i, img in enumerate(images) if img is not None]
    valid_images  = [images[i] for i in valid_indices]

    # Run true batch inference (~3.5× faster than sequential for batch=4)
    batch_results: list[tuple] = []
    if valid_images:
        try:
            batch_results = extractor.batch_predict(valid_images)
        except Exception as e:
            logger.error(f"batch_predict failed: {e}")
            # Fall back to sequential on error
            for img in valid_images:
                try:
                    extraction, confidence, ms, _, _, _, _ = extractor.predict(img)
                    batch_results.append((extraction, confidence, ms))
                except Exception as e2:
                    batch_results.append((CardExtraction(), 0.0, 0.0))

    # Build result list in original order
    batch_iter = iter(batch_results)
    results = []
    for i in range(len(request.images)):
        if decode_errors[i] is not None:
            results.append(ExtractionResponse(
                success=False, confidence=0.0, inference_time_ms=0.0,
                error=decode_errors[i],
            ))
        else:
            extraction, confidence, ms_per_card = next(batch_iter)
            warnings = []
            if confidence < Config.CONFIDENCE_THRESHOLD:
                warnings.append(f"Low confidence: {confidence:.2f}")
            results.append(ExtractionResponse(
                success=True, data=extraction, confidence=confidence,
                inference_time_ms=ms_per_card, warnings=warnings,
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

    parser = argparse.ArgumentParser(description="PTCG card extraction API (BnB 4-bit)")
    parser.add_argument("--adapter", type=str, default=Config.ADAPTER_PATH,
                        help="Path to LoRA adapter (default: ./outputs/qlora_v4/final)")
    parser.add_argument("--port",    type=int, default=Config.PORT)
    parser.add_argument("--host",    type=str, default=Config.HOST)
    parser.add_argument("--no-compile", action="store_true",
                        help="Disable torch.compile (saves ~30s startup, loses ~15% speed)")
    parser.add_argument("--flash-attn", action="store_true",
                        help="Use flash_attention_2 instead of sdpa (requires flash-attn package)")
    parser.add_argument("--quantize", type=str, default=Config.QUANTIZE,
                        choices=["4bit", "int8", "bf16"],
                        help="Quantization mode: 4bit (6GB, ~17 tok/s), int8 (8GB, ~25 tok/s), bf16 (14GB, ~40 tok/s)")
    parser.add_argument("--max-pixels", type=int, default=Config.MAX_PIXELS,
                        help=f"Max image pixels for processor (default {Config.MAX_PIXELS}=1280*28*28). "
                             "Reduce to speed up prefill: e.g. 501760 (640*28*28), 200704 (256*28*28)")
    parser.add_argument("--min-pixels", type=int, default=Config.MIN_PIXELS,
                        help=f"Min image pixels for processor (default {Config.MIN_PIXELS}=256*28*28)")
    args = parser.parse_args()

    Config.ADAPTER_PATH = args.adapter
    Config.PORT = args.port
    Config.HOST = args.host
    Config.COMPILE = not args.no_compile
    Config.FLASH_ATTN = args.flash_attn
    Config.QUANTIZE = args.quantize
    Config.MAX_PIXELS = args.max_pixels
    Config.MIN_PIXELS = args.min_pixels

    import uvicorn
    logger.info(f"Starting service at http://{args.host}:{args.port}")
    logger.info(f"Adapter: {Config.ADAPTER_PATH}")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
