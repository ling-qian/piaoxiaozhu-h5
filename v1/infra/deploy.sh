#!/bin/bash
# 票小助 Pro V1 · 本地编排部署（docker compose）
#
# 顺序：构建 → 启动 → 等健康 → 迁移 → 部署后自检（回归 + 边界体检）
# 任一步失败即中止；自检失败时「部署完成」不会打印。
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# compose 栈里的 Postgres 从宿主机看是 localhost:5432（compose 已映射该端口）。
# 自检脚本默认读 services/api/.env 的库地址，这里必须覆盖，否则会去校验另一个库。
COMPOSE_DB_URL="postgresql://postgres:postgres@localhost:5432/piaoxiaozhu"

echo "=== 票小助 Pro V1 部署 ==="

echo "--- 1/5 构建镜像 ---"
docker compose build

echo "--- 2/5 启动服务 ---"
docker compose up -d

echo "--- 3/5 等待 API 就绪 ---"
# 必须等健康再迁移：容器刚起时 exec 进去跑 alembic 可能连不上库，导致部署脚本假失败
READY=0
for i in $(seq 1 40); do
  if curl -s -m 2 --noproxy '*' http://127.0.0.1:8000/health 2>/dev/null | grep -q '"status":"ok"'; then
    echo "  API 已就绪（约 ${i}s）"
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "  ✗ 40 秒内 API 未就绪，查看日志：docker compose logs api"
  exit 1
fi

echo "--- 4/5 数据库迁移 ---"
docker compose exec -T api alembic upgrade head

echo "--- 5/5 部署后自检（回归冒烟 + 边界体检）---"
# 空库（首次部署）时两个脚本会返回 3，preflight 记为 SKIP，不算失败
REGRESSION_DATABASE_URL="$COMPOSE_DB_URL" bash "$SCRIPT_DIR/preflight.sh" --with-api

echo "=== 部署完成 ==="
echo "API: http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
