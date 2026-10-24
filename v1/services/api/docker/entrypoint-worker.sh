#!/bin/sh
# OCR worker 启动脚本（Celery，微信云托管 / 本地 compose 通用）
set -e

# 并发默认 1：PaddleOCR 是 CPU 密集且单个进程常驻数百 MB 内存，
# 默认并发调高在 2 核 4GiB 的实例上很容易被 OOM Kill。
# 需要吞吐时优先「加副本数」，而不是加单个容器的并发。
echo "[entrypoint] 启动 celery worker：concurrency=${CELERY_CONCURRENCY:-1}"
exec celery -A app.worker worker \
  --loglevel="${CELERY_LOGLEVEL:-info}" \
  --concurrency="${CELERY_CONCURRENCY:-1}" \
  --max-tasks-per-child="${CELERY_MAX_TASKS_PER_CHILD:-20}"
