# OCR 微服务：只做「图片 → 字段」，不含数据库与业务逻辑。
#
# 构建上下文必须是 v1/（要拿 packages/core）：
#   cd v1 && docker build -f services/ocr/Dockerfile -t piaoxiaozhu-ocr .
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # PaddleOCR 的模型与缓存目录固定在镜像里，避免每次启动重新下载
    PADDLE_HOME=/root/.paddleocr \
    HF_HOME=/root/.cache/huggingface

WORKDIR /app

# Paddle 运行需要这些系统库（libGL 是 cv2 依赖，缺了会 import 失败）
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY services/api/requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

COPY packages/core /app/packages/core
COPY services/api/app /app/app
COPY services/ocr/app.py /app/ocr_app.py

# 装 core 为可导入包（ocr_service 依赖 piaoxiaozhu_core）
RUN pip install -e /app/packages/core

# 构建期预热模型：让首次请求不必等 10–30 秒加载。
# 失败不阻断构建（离线环境也能出镜像），运行时 /warmup 可再补。
RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(use_textline_orientation=False)" || \
    echo "warn: 模型预热失败，将在首次请求时加载"

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
    CMD curl -fsS http://127.0.0.1:8080/health || exit 1

CMD ["uvicorn", "ocr_app:app", "--host", "0.0.0.0", "--port", "8080"]
