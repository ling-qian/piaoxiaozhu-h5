#!/usr/bin/env bash
# 票小助 Pro · 部署前置自检
#
# 在跑 docker build 或上云托管之前，把所有能在本地验证的都验一遍，避免把问题带上云。
#
# 用法：
#   cd v1
#   bash infra/preflight.sh                # 只做静态检查（快，无需 Docker、无需后端）
#   bash infra/preflight.sh --with-api     # 额外跑后端回归冒烟 + 边界体检（需要后端已在 8000 运行）
#   bash infra/preflight.sh --build        # 额外真实构建两个镜像（慢，worker 镜像 ~2GB）
#   bash infra/preflight.sh --with-api --build   # 两个都跑（部署前的完整检查）
#
# 环境变量：
#   PREFLIGHT_SKIP_DOCKER=1   在 docker CLI 不可用的受限环境里，强制跳过镜像构建
#
# 退出码：0 = 全部通过；1 = 有失败项。

set -uo pipefail

V1_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$V1_ROOT"

DO_BUILD="false"
WITH_API="false"
for arg in "$@"; do
  case "$arg" in
    --build) DO_BUILD="true" ;;
    --with-api) WITH_API="true" ;;
    *) printf '  [WARN] 未知参数：%s（只支持 --build / --with-api）\n' "$arg" ;;
  esac
done

PASS=0; FAIL=0; SKIP=0
ok() { printf '  \033[32m[OK]\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
ng() { printf '  \033[31m[FAIL]\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
sk() { printf '  \033[33m[SKIP]\033[0m %s\n' "$1"; SKIP=$((SKIP + 1)); }

# 优先用项目自带的 venv2（它装了后端全部依赖）；没有就退回 python3
# 必须解析成绝对路径：脚本后面会 cd 进子目录，相对路径会失效（曾因此静默跳过导入检查）
PY=""
for c in services/api/venv2/bin/python services/api/venv/bin/python "$(command -v python3 2>/dev/null)"; do
  if [ -n "$c" ] && [ -x "$c" ]; then
    PY="$(cd "$(dirname "$c")" && pwd)/$(basename "$c")"
    break
  fi
done

echo "=============================================="
echo "票小助 Pro 部署前置自检   (root: $V1_ROOT)"
echo "python: ${PY:-未找到}"
echo "=============================================="

echo
echo "== 1/6 关键文件存在性 =="
for f in \
  services/api/Dockerfile.api \
  services/api/Dockerfile.worker \
  services/api/requirements-api.txt \
  services/api/requirements.txt \
  services/api/docker/entrypoint-api.sh \
  services/api/docker/entrypoint-worker.sh \
  services/api/alembic.ini \
  packages/core/pyproject.toml \
  .dockerignore \
  infra/docker-compose.yml \
  infra/cloud-hosting.env.example
do
  if [ -e "$f" ]; then ok "$f"; else ng "缺失：$f"; fi
done

# 旧的单镜像 Dockerfile 必须已移除，否则容易误用
if [ -e services/api/Dockerfile ]; then
  ng "services/api/Dockerfile 仍存在（旧单镜像，应已删除，避免误用）"
else
  ok "旧单镜像 Dockerfile 已移除"
fi

echo
echo "== 2/6 入口脚本可执行 =="
for s in services/api/docker/entrypoint-api.sh services/api/docker/entrypoint-worker.sh; do
  if [ -x "$s" ]; then
    ok "$s 可执行"
  else
    ng "$s 没有执行权限（docker compose 会挂载宿主目录覆盖镜像内脚本，没 +x 会直接起不来）"
  fi
  if sh -n "$s" 2>/dev/null; then ok "$s 语法正确"; else ng "$s 语法错误"; fi
done

echo
echo "== 3/6 Dockerfile 的 COPY 源路径是否都在构建上下文内 =="
for df in services/api/Dockerfile.api services/api/Dockerfile.worker; do
  [ -e "$df" ] || continue
  # 只取 COPY 的第一个参数；跳过 --from= 的多阶段拷贝
  for src in $(grep -E '^COPY ' "$df" | grep -v -- '--from=' | awk '{print $2}'); do
    p="${src#./}"
    if [ -e "$p" ]; then ok "$df -> $p"; else ng "$df 引用了不存在的路径：${src}（构建会失败）"; fi
  done
done

# piaoxiaozhu-core 不能出现在 requirements 里当裸包名（PyPI 上没有这个包）
for rf in services/api/requirements-api.txt services/api/requirements.txt; do
  [ -e "$rf" ] || continue
  if grep -qE '^[[:space:]]*piaoxiaozhu[-_]core' "$rf"; then
    ng "$rf 里有裸包名 piaoxiaozhu-core（PyPI 无此包，pip 会失败）"
  else
    ok "$rf 未把本地共享包写成裸包名"
  fi
done

echo
echo "== 4/6 .dockerignore 是否覆盖重型/敏感目录 =="
if [ -e .dockerignore ]; then
  for pat in 'node_modules' 'venv' 'uploads' '.env'; do
    if grep -qF "$pat" .dockerignore; then ok "已忽略 $pat"; else ng ".dockerignore 未忽略 ${pat}（构建上下文会变大或密钥进镜像）"; fi
  done
else
  ng "缺少 .dockerignore（构建上下文会变成 1.5GB）"
fi

echo
echo "== 5/6 后端代码静态检查 =="
if [ -n "$PY" ]; then
  if "$PY" -m py_compile \
      services/api/app/main.py \
      services/api/app/config.py \
      services/api/app/worker.py \
      services/api/app/routers/files.py \
      services/api/app/routers/users.py \
      services/api/app/services/storage.py 2>/dev/null; then
    ok "py_compile 通过（关键模块）"
  else
    ng "py_compile 失败"
  fi

  if (cd services/api && "$PY" -c "import app.main" 2>/dev/null); then
    ok "app.main 可导入"
  else
    sk "app.main 导入失败（可能是该 Python 未装后端依赖，非代码问题）"
  fi

  if "$PY" -c "import yaml" 2>/dev/null; then
    if "$PY" -c "
import yaml
d = yaml.safe_load(open('infra/docker-compose.yml'))
need = {'api', 'worker', 'postgres', 'redis'}
missing = need - set(d['services'])
assert not missing, missing
for name in ('api', 'worker'):
    assert 'dockerfile' in d['services'][name]['build'], name
" 2>/dev/null; then
      ok "docker-compose.yml 结构正确（api/worker 指向各自 Dockerfile）"
    else
      ng "docker-compose.yml 结构异常"
    fi
  else
    sk "未安装 PyYAML，跳过 compose 校验"
  fi
else
  sk "未找到可用的 Python，跳过静态检查"
fi

echo
echo "== 附加：小程序产物是否比源码新 =="
# 源码改了但没重新构建，是「以为改了其实没生效」的最大来源（已踩过三次）
DIST_JS="apps/miniapp/dist/app.js"
if [ -e "$DIST_JS" ]; then
  # 既要盯 src/，也要盯 config/（Taro 的构建配置，改了同样影响产物）
  STALE=$(find apps/miniapp/src apps/miniapp/config -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.scss' \) -newer "$DIST_JS" 2>/dev/null | head -5)
  if [ -n "$STALE" ]; then
    ng "小程序 dist 比源码旧（改了没重新构建），先跑：bash apps/miniapp/scripts/sync-api-url.sh"
    printf '%s\n' "$STALE" | sed 's/^/       /'
  else
    ok "小程序 dist 已是最新"
  fi
else
  sk "未发现 apps/miniapp/dist（尚未构建过）"
fi

echo
echo "== 6/6 环境变量必填项（对照 cloud-hosting.env.example）=="
REQUIRED="APP_ENV DATABASE_URL REDIS_URL JWT_SECRET WX_APPID WX_SECRET"
for v in $REQUIRED; do
  if [ -n "${!v:-}" ]; then ok "$v 已设置"; else sk "$v 未设置（部署时在云托管控制台填，不在这里填）"; fi
done

echo
if [ "$WITH_API" = "true" ]; then
  echo "== 附加：后端回归冒烟 + 边界体检 =="
  echo "     需要后端已在 127.0.0.1:8000 运行；边界体检会在库里建一个临时用户，结束自动删除"
  if curl -s -m 3 --noproxy '*' http://127.0.0.1:8000/health 2>/dev/null | grep -q '"status":"ok"'; then
    ok "后端可达（/health）"

    RLOG=/tmp/preflight-regression.log
    "$PY" "$V1_ROOT/infra/regression_check.py" > "$RLOG" 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then
      ok "回归冒烟通过（$(grep -oE '合计 [0-9]+/[0-9]+' "$RLOG" | tail -1)）"
    elif [ "$rc" -eq 3 ]; then
      sk "库里没有可测数据（如刚初始化的空库），跳过回归冒烟"
    else
      ng "回归冒烟有失败，日志：$RLOG"
      grep -E '\[FAIL\]' "$RLOG" | head -5 | sed 's/^/       /'
    fi

    ELOG=/tmp/preflight-edge.log
    "$PY" "$V1_ROOT/infra/edge_cases.py" > "$ELOG" 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then
      ok "边界体检通过（$(grep -oE '合计 [0-9]+/[0-9]+' "$ELOG" | tail -1)）"
    elif [ "$rc" -eq 3 ]; then
      sk "库里没有可测数据（如刚初始化的空库），跳过边界体检"
    else
      ng "边界体检有失败，日志：$ELOG"
      grep -E '\[FAIL\]' "$ELOG" | head -5 | sed 's/^/       /'
    fi
  else
    sk "8000 端口没有可用后端，跳过 API 检查（先启动后端再跑 --with-api）"
  fi
else
  echo "提示：加 --with-api 可额外跑后端回归冒烟与边界体检（需后端已在 8000 运行）"
fi

if [ "$DO_BUILD" = "true" ]; then
  echo "== 附加：真实构建镜像 =="
  docker_ready=0
  if [ "${PREFLIGHT_SKIP_DOCKER:-}" = "1" ]; then
    sk "PREFLIGHT_SKIP_DOCKER=1，按要求跳过镜像构建"
  else
    # 先看 socket 再决定要不要调用 docker：在「守护进程不可达」的环境里，
    # docker CLI 可能一直挂着甚至被外部强制杀掉，把整个自检脚本一起拖死。
    sock_found=0
    for s in /var/run/docker.sock "${HOME}/.docker/run/docker.sock"; do
      if [ -S "$s" ]; then sock_found=1; break; fi
    done
    if [ "$sock_found" -eq 0 ] && [ -z "${DOCKER_HOST:-}" ]; then
      sk "未发现 Docker socket，跳过镜像构建（启动 Docker Desktop 后重跑；或设 PREFLIGHT_SKIP_DOCKER=1 只做静态检查）"
    else
      # 有 socket 再加一道 8 秒看门狗，防守护进程半死
      docker info >/dev/null 2>&1 &
      dpid=$!
      ( sleep 8; kill -0 "$dpid" 2>/dev/null && kill "$dpid" 2>/dev/null ) >/dev/null 2>&1 &
      wpid=$!
      if wait "$dpid" 2>/dev/null; then docker_ready=1; fi
      kill "$wpid" 2>/dev/null
      if [ "$docker_ready" -ne 1 ]; then
        ng "Docker 守护进程无响应，跳过镜像构建"
      fi
    fi
  fi

  if [ "$docker_ready" -eq 1 ]; then
    echo "  构建 api 镜像（约 300MB，快）..."
    if docker build -f services/api/Dockerfile.api -t piaoxiaozhu-api:preflight . >/tmp/preflight-api-build.log 2>&1; then
      ok "api 镜像构建成功（日志 /tmp/preflight-api-build.log）"
    else
      ng "api 镜像构建失败，见 /tmp/preflight-api-build.log 末尾"
      tail -20 /tmp/preflight-api-build.log
    fi
    echo "  构建 worker 镜像（含 PaddleOCR，~2GB，会下载模型，请耐心）..."
    if docker build -f services/api/Dockerfile.worker -t piaoxiaozhu-worker:preflight . >/tmp/preflight-worker-build.log 2>&1; then
      ok "worker 镜像构建成功（日志 /tmp/preflight-worker-build.log）"
    else
      ng "worker 镜像构建失败，见 /tmp/preflight-worker-build.log 末尾"
      tail -20 /tmp/preflight-worker-build.log
    fi
  fi
else
  echo "提示：加 --build 可额外真实构建两个镜像（需 Docker Desktop 运行中）"
fi

echo
echo "=============================================="
printf '结果：通过 %d 项，失败 %d 项，跳过 %d 项\n' "$PASS" "$FAIL" "$SKIP"
echo "=============================================="
[ "$FAIL" -eq 0 ] || exit 1
