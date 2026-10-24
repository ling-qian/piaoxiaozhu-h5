#!/bin/sh
# api 服务启动脚本（微信云托管 / 本地 compose 通用）
set -e

# 云托管的「服务端口」若配成 80，平台会注入 PORT=80；本地 compose 不注入则用 8000。
# 这样同一份镜像两种环境都能直接跑，不必改配置。
PORT="${PORT:-8000}"

# 数据库迁移：默认不执行。
# 云托管多副本同时启动会并发跑迁移、互相抢 alembic 锁，因此建议：
#   - 首次部署或改表后，临时把 RUN_MIGRATIONS 置 true 跑一次，再改回 false；或
#   - 用云托管的「任务」功能单独执行一次 alembic upgrade head。
# 注意 app 启动时的 seed() 会 create_all 建表，所以即便不跑迁移，空库也能起来。
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] RUN_MIGRATIONS=true，执行 alembic upgrade head ..."
  alembic upgrade head
  echo "[entrypoint] 迁移完成"
fi

echo "[entrypoint] 启动 api：监听 0.0.0.0:${PORT}"
# --proxy-headers / --forwarded-allow-ips：云托管前面有一层网关，
# 不加这两项，request.client 与 X-Forwarded-Proto 都拿不到真实值。
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --workers "${UVICORN_WORKERS:-1}" \
  --proxy-headers \
  --forwarded-allow-ips '*'
