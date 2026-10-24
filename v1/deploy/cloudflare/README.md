# 部署到 Cloudflare（Workers + Containers）

> 架构：小程序 / H5 → Cloudflare Worker（边缘入口）→ Cloudflare Container（现有 FastAPI 镜像）
> **业务代码零改动**：容器里跑的就是 `services/api/Dockerfile.api` 构建的镜像。

## 0. 为什么这样部署

| 选择 | 理由 |
|---|---|
| 容器而非 Worker 代码 | 后端是 Python + PaddleOCR，改写成 Worker 等于重写 1 万行且 OCR 跑不了 |
| 保留 PostgreSQL（Neon） | 现有 SQLAlchemy 代码零改动；容器能直连 Neon |
| 保留 COS | 容器磁盘是**临时**的，上传文件必须落对象存储 |

⚠️ **常见坑**：`uploads/` 目录在容器里是临时的，重启即丢。
必须确保 `COS_*` 变量已配置，否则存储会静默回落到本地磁盘 → 用户票据图片全丢。

## 1. 前置条件

```bash
# 本机已装：Docker Desktop、Node 20+
# Cloudflare 账号已升级到 Workers Paid（$5/月，Containers 必需）
npx wrangler login
```

## 2. 配置 secrets

在 `v1/deploy/cloudflare/` 目录执行（**逐个粘贴，不要用 .env 文件上传**）：

```bash
npx wrangler secret put DATABASE_URL
#   → postgresql+asyncpg://...@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?ssl=require
#   注意：必须用 Neon 地址，不能用 localhost（容器里没有本地 PG）

npx wrangler secret put JWT_SECRET          # openssl rand -hex 32
npx wrangler secret put ADMIN_TOKEN         # openssl rand -hex 24

npx wrangler secret put WX_APPID
npx wrangler secret put WX_SECRET

npx wrangler secret put COS_SECRET_ID
npx wrangler secret put COS_SECRET_KEY
npx wrangler secret put COS_REGION          # ap-guangzhou
npx wrangler secret put COS_BUCKET_NAME     # 注意是 _NAME，写错会回落到本地磁盘

npx wrangler secret put LLM_BASE_URL
npx wrangler secret put LLM_API_KEY
npx wrangler secret put LLM_MODEL_NAME
```

## 3. 部署

```bash
cd v1/deploy/cloudflare
npm install
npx wrangler deploy
```

首次部署会：构建镜像（5–8 分钟，装 PaddleOCR）→ 推送到 Cloudflare → 启动容器 → 返回 URL。

## 4. 三道验证门（按顺序，前一道不过不要往下）

### 门 1：Worker 本身活着（不唤醒容器）

```bash
curl https://piaoxiaozhu-api.<你的子域>.workers.dev/__edge/health
# 期望：{"ok":true,"edge":"cloudflare-workers",...}
```

### 门 2：容器起来了

```bash
curl https://piaoxiaozhu-api.<你的子域>.workers.dev/health
# 期望：{"status":"ok","service":"piaoxiaozhu-api","version":"1.0.0"}
# 若返回 503：看 npx wrangler tail 的日志，通常是冷启动或镜像启动失败
```

### 门 3：业务接口通

```bash
curl -X POST https://.../api/auth/wechat/login \
  -H 'Content-Type: application/json' -d '{"code":"fake"}'
# 期望：400 invalid code（说明容器能访问 api.weixin.qq.com）
# 若 502：容器出网问题，跑 /api/admin/diagnostics/egress 定位
```

**门 3 是这次迁移的关键验收点**——之前在云托管上就是卡在这一步（容器连不上微信 API）。

## 5. 小程序切域名

```
mp.weixin.qq.com → 开发 → 开发设置 → 服务器域名
  request 合法域名：https://piaoxiaozhu-api.<子域>.workers.dev
  （如需自定义域名，在 Cloudflare 控制台加 Custom Domain，再用那个域名）
```

前端只改一处：

```ini
# v1/apps/miniapp/.env
TARO_APP_API_URL=https://piaoxiaozhu-api.<子域>.workers.dev
TARO_APP_USE_CALLCONTAINER=false
```

然后重新 `npm run build:weapp` 上传。

## 6. H5 部署（Pages）

H5 是 Next.js 15，需要 `@opennextjs/cloudflare` 适配器（纯静态导出不够，因为有 API routes）。

```bash
cd piaoxiaozhu-h5
npx @opennextjs/cloudflare build
npx wrangler pages deploy .open-next/assets --project-name piaoxiaozhu-h5
```

H5 的 API 地址指向同一个 Worker 域名 → **一套后端管两端**。

## 7. 成本估算

| 项 | 用量假设 | 月成本 |
|---|---|---|
| Workers Paid | 固定 | **$5** |
| 内存（standard-2，6 GiB） | 每天活跃 4h → 720 GiB-hrs | 超出 25 GiB-hrs 部分 ≈ **$6** |
| CPU | 轻度 | ≈ **$1** |
| 出口流量 | 图片走 COS，API 流量小 | ≈ **$0** |
| **合计** | | **≈ $12（¥85）** |

**常驻的代价**：如果把 `sleep_after` 调成 1 小时、基本不休眠，内存费用会涨到 **≈ $40/月**。
建议先用 10 分钟，观察一周实际活跃时长再调。

## 8. 已知风险（上线前必须实测）

| 风险 | 影响 | 怎么处理 |
|---|---|---|
| **OCR 冷启动 10–30s** | 用户拍票后要等很久 | 实测一次冷启动耗时；必要时把 `sleep_after` 调到 30m |
| **容器磁盘临时** | 上传文件丢 | 确认 `COS_*` 已配；`/health` 后查一次存储后端 |
| **Workers 请求超时** | AI 分析 13–25s 可能被截断 | Workers 默认 100s 上限，够用；但要确认不进 30s 限制 |
| **Neon 延迟** | 每次查询 +10–30ms | 可接受；若变慢再考虑 Hyperdrive |
| **未备案域名 + 小程序** | 已实测「能存进后台」，但**真机请求是否被拦未验证** | 部署后立刻用真机走一次登录 |

## 9. 回滚

容器部署有版本记录：

```bash
npx wrangler deployments list
npx wrangler rollback <deployment-id>
```

或者把小程序 `.env` 的 `TARO_APP_API_URL` 改回云托管地址，重新构建——**代码不动，只换地址**。
