#!/bin/bash
set -e
echo "=== 票小助 V1 部署 ==="
cd "$(dirname "$0")"

# Build and start
docker compose build
docker compose up -d

# Run migrations
docker compose exec api alembic upgrade head

echo "=== 部署完成 ==="
echo "API: http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
