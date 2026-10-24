"""OCR 微服务：把现有识别管线包成一个 HTTP 接口，供 Cloudflare Worker 调用。

## 为什么单独拆出来

PaddleOCR 是 C++ 原生扩展 + 数百 MB 模型，**无法在 Cloudflare Worker 里运行**
（Worker 只支持 JS/WASM）。所以后端主逻辑搬去 Worker，OCR 留在容器里。

## 为什么不直接复用 services/api

那个服务绑了一整套东西（数据库、JWT、积分、支付）。OCR 只需要「图片 → 字段」，
拆开后能独立扩容，也避免把数据库连接带进无状态服务。

## 契约（Worker 侧按这个解析）

    POST /ocr   body=图片原始字节   → JSON（见 recognize 的返回）
    GET  /health                    → {"status":"ok","ocr_ready":bool}

金额单位是**元**（不是分），与 /api/records 的入参一致。
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse

# ⚠️ 本文件必须叫 ocr_app.py，不能叫 app.py：
# 否则 `from app.services.ocr_service import ...` 会命中本文件（模块名 app 遮蔽了
# services/api 下的 app 包），报 "No module named 'app.services'; 'app' is not a package"。
#
# 允许直接 `python -m uvicorn ocr_app:app` 从本目录启动
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "packages", "core"))

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="piaoxiaozhu-ocr", version="1.0.0")

# 管线是重对象（加载模型），整个进程只初始化一次
_pipeline: Any = None
_init_error: Optional[str] = None

MAX_IMAGE_BYTES = 15 * 1024 * 1024


def get_pipeline():
    """懒加载 OCR 管线。首次调用会加载模型（10–30 秒），之后复用。"""
    global _pipeline, _init_error
    if _pipeline is not None:
        return _pipeline
    if _init_error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"OCR 初始化失败：{_init_error}",
        )
    try:
        from app.services.ocr_service import OCRPipeline

        _pipeline = OCRPipeline()
        return _pipeline
    except Exception as e:  # noqa: BLE001 - 初始化失败要原样告诉调用方
        _init_error = f"{type(e).__name__}: {e}"
        logger.exception("OCR 管线初始化失败")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"OCR 初始化失败：{_init_error}",
        )


@app.get("/health")
async def health() -> dict:
    """健康检查。

    ocr_ready=False 表示进程活着但模型还没加载——这与「服务挂了」是两回事，
    分开报出来，Worker 侧才能决定是重试还是直接降级。
    """
    return {
        "status": "ok",
        "service": "piaoxiaozhu-ocr",
        "ocr_ready": _pipeline is not None,
        "error": _init_error,
    }


@app.post("/warmup")
async def warmup() -> dict:
    """预热：容器启动后由 Worker 或部署脚本调一次，把模型加载提前到用户上传之前。"""
    get_pipeline()
    return {"status": "ok", "initialized": True}


@app.post("/ocr")
async def recognize(request: Request) -> JSONResponse:
    body = await request.body()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="图片内容为空")
    if len(body) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"图片超过 {MAX_IMAGE_BYTES // 1024 // 1024}MB",
        )

    pipeline = get_pipeline()
    try:
        result = await pipeline.process(body)
    except Exception as e:  # noqa: BLE001
        logger.exception("识别失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"识别失败：{type(e).__name__}: {e}",
        )

    cat = result.get("categorize")
    return JSONResponse(
        {
            "raw_text": result.get("raw_text"),
            "ocr_confidence": result.get("ocr_confidence"),
            "merchant_name": result.get("merchant_name"),
            # 元，不是分
            "amount": result.get("amount"),
            "tax_amount": result.get("tax_amount"),
            "invoice_date": result.get("invoice_date"),
            "invoice_code": result.get("invoice_code"),
            "invoice_no": result.get("invoice_no"),
            "tax_no": result.get("tax_no"),
            "category": (
                {
                    "code": cat.category_code,
                    "l1": cat.category_l1,
                    "l2": cat.category_l2,
                    "confidence": cat.confidence,
                    "reason": cat.reason,
                }
                if cat
                else None
            ),
            "is_invoice": result.get("is_invoice", True),
            "invoice_warning": result.get("invoice_warning"),
            "line_check": result.get("line_check"),
        }
    )
