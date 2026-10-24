# 迁移到大陆云服务器（VPS）部署手册

> 目标：把 `v1` 从微信云托管迁到一台大陆云服务器，用自有备案域名对外服务。
> 迁移后，云托管容器「连不上 api.weixin.qq.com」的问题自动消失——普通服务器出网没有这个限制。

## 0. 为什么迁

| 问题 | 云托管现状 | 迁到 VPS 后 |
|---|---|---|
| 容器访问微信 API | ❌ 502（出网被拦） | ✅ 正常 |
| 默认域名能否配进小程序 | ❌ 微信拒绝 | ✅ 配自有备案域名 |
| 体验版 / 正式发布 | ❌ 不可用 | ✅ 可用 |
| 微信支付回调 | ⚠️ 需绕 | ✅ 直接可达 |
| 成本 | 按量（无流量时约 ¥15–30/月） | 固定 ¥60–80/月 |

## 1. 前置条件

### 1.1 服务器

| 项 | 要求 | 说明 |
|---|---|---|
| 配置 | **2 核 4 GiB** 起 | worker 要跑 PaddleOCR，内存低于 4G 容易 OOM |
| 系统 | Ubuntu 22.04 / 24.04 | 本文命令按 Ubuntu 写 |
| 磁盘 | 40 GiB 起 | 镜像约 2.5 GB + OCR 模型 ~1 GB + 上传文件 |
| 地域 | 与备案主体所在省份一致或邻近 | 备案时管局会看 |
| 带宽 | 3 Mbps 起 | 票据图片上传主要走 COS，服务器带宽压力不大 |

### 1.2 域名与备案

```
① 买域名（腾讯云/阿里云均可，¥30–60/年）
② 提交 ICP 备案（在服务器同一家云厂商后台提交）
   - 主体：个体工商户营业执照
   - 类型：企业备案（个体户按企业类提交）
   - 周期：1–3 周（管局审核）
③ 备案通过后，在云厂商控制台做域名解析 → 指向服务器公网 IP
```

⚠️ **域名注册人、备案主体、小程序主体三者必须一致**（同一个体户），否则会被驳回。

### 1.3 小程序后台（备案通过后再做）

```
mp.weixin.qq.com → 开发 → 开发设置 → 服务器域名
  request 合法域名：https://api.你的域名.com
  uploadFile 合法域名：https://api.你的域名.com（留着，兼容旧路径）

⚠️ 票据图片现在走 COS 直传，所以还要加：
  request 合法域名：https://piaoxiaozhu-1479901036.cos.ap-guangzhou.myqcloud.com
```

## 2. 服务器初始化

```bash
# 2.1 基础软件
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin git nginx certbot python3-certbot-nginx

# 2.2 让普通用户能用 docker（避免全程 sudo）
usermod -aG docker $USER && newgrp docker

# 2.3 创建部署目录
mkdir -p /opt/piaoxiaozhu && cd /opt/piaoxiaozhu
```

## 3. 上传代码

代码包需要包含 `v1/` 整个目录（**构建上下文是 v1/ 根**，因为要装 `packages/core`）。

```bash
# 方式 A：Git（推荐）
git clone <你的仓库地址> app && cd app/v1

# 方式 B：上传压缩包
#   本地：zip -r v1-deploy.zip v1 -x "*/node_modules/*" "*/venv*/*" "*/dist/*"
#   上传后：unzip v1-deploy.zip && cd v1
```

## 4. 准备环境变量

```bash
cd /opt/piaoxiaozhu/app/v1/infra
cp .env.example .env 2>/dev/null || touch .env
```

编辑 `.env`（**不要提交到 git**）：

```ini
# ── 必填 ──
JWT_SECRET=<openssl rand -hex 32 生成>
ADMIN_TOKEN=<openssl rand -hex 24 生成>
LLM_API_KEY=<你的模型 key>
LLM_BASE_URL=https://apihub.agnes-ai.com/v1
LLM_MODEL_NAME=agnes-2.0-flash

WX_APPID=wx097578daa9dd2a26
WX_SECRET=<小程序后台的 AppSecret>

# ── 对象存储（票据图片直传 COS）──
# 注意变量名是 COS_BUCKET_NAME（不是 COS_BUCKET），写错会静默回落到本机磁盘
COS_SECRET_ID=<你的>
COS_SECRET_KEY=<你的>
COS_BUCKET_NAME=piaoxiaozhu-1479901036
COS_REGION=ap-guangzhou

# ── 支付（个体户申请商户号后填）──
WX_MCH_ID=
WX_CERT_SERIAL_NO=
WX_PRIVATE_KEY_PATH=/app/certs/apiclient_key.pem
WX_PLATFORM_CERT_PATH=/app/certs/wechatpay_platform.pem
WX_NOTIFY_URL=https://api.你的域名.com/api/payments/wechat/notify

# ── 安全开关 ──
APP_ENV=production
ALLOW_DEV_LOGIN=false
PAYMENT_MOCK_ENABLED=false
CONTENT_SECURITY_ENABLED=true
WECHAT_OPENAPI_SIDECAR=false      # 换到 VPS 后不需要云托管旁加载
```

## 5. 启动

```bash
cd /opt/piaoxiaozhu/app/v1/infra

# 5.1 构建（首次约 5–8 分钟，worker 镜像要装 PaddleOCR）
docker compose build

# 5.2 起服务
docker compose up -d

# 5.3 数据库迁移（首次必做）
docker compose exec api alembic upgrade head

# 5.4 确认健康
curl -s http://127.0.0.1:8000/health
# 期望：{"status":"ok","service":"piaoxiaozhu-api","version":"1.0.0"}
```

## 6. Nginx + HTTPS

### 6.1 反向代理配置

```nginx
# /etc/nginx/sites-available/piaoxiaozhu
server {
    listen 80;
    server_name api.你的域名.com;

    client_max_body_size 20m;          # 票据图片

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;        # AI 分析可能 20s+
    }
}
```

```bash
ln -s /etc/nginx/sites-available/piaoxiaozhu /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 6.2 申请证书（自动续期）
certbot --nginx -d api.你的域名.com
```

### 6.3 验证 HTTPS

```bash
curl -s https://api.你的域名.com/health
```

## 7. 前端切换域名

```bash
cd /opt/piaoxiaozhu/app/v1/apps/miniapp
vi .env
```

```ini
TARO_APP_API_URL=https://api.你的域名.com
TARO_APP_USE_CALLCONTAINER=false
```

然后**在你本机**重新构建（沙箱里构建会写盘失败）：

```bash
npm run build:weapp
```

用微信开发者工具上传 dist，设为体验版。

## 8. 验收清单

| # | 检查 | 命令 / 操作 | 期望 |
|---|---|---|---|
| 1 | 服务健康 | `curl https://api.域名/health` | `{"status":"ok"}` |
| 2 | 登录 | 开发者工具打开小程序 | 拿到 token，首页有数据 |
| 3 | 微信接口连通 | `curl -X POST https://api.域名/api/auth/wechat/login -H 'Content-Type: application/json' -d '{"code":"fake"}'` | **400 invalid code**（不是 502） |
| 4 | 拍票上传 | 真机拍一张票 | 图片进 COS，识别出金额 |
| 5 | 报表 | 打开报表页 | 金额与记录数正确 |
| 6 | AI 分析 | 点「AI 分析」 | 15–25s 内出结果 |
| 7 | 问账 | 问「这个月花了多少」 | 返回金额 |
| 8 | 全量回归 | `python infra/regression_check.py` | 15/15 |
| 9 | 端到端 | `python infra/e2e_journey.py --prod` | 34/34 |

## 9. 日常运维

```bash
# 查看日志
docker compose logs -f api
docker compose logs -f worker

# 更新代码后
git pull && docker compose build api worker && docker compose up -d

# 数据库备份（每天 cron）
docker compose exec -T postgres pg_dump -U postgres piaoxiaozhu | gzip > /backup/db-$(date +%F).sql.gz

# 上传文件备份（本地存储兜底时）
tar czf /backup/uploads-$(date +%F).tar.gz /opt/piaoxiaozhu/app/v1/uploads
```

### 建议加的 cron

```cron
# 每天 03:00 备份数据库，保留 14 天
0 3 * * * cd /opt/piaoxiaozhu/app/v1/infra && docker compose exec -T postgres pg_dump -U postgres piaoxiaozhu | gzip > /backup/db-$(date +\%F).sql.gz && find /backup -name "db-*.sql.gz" -mtime +14 -delete
```

## 10. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `502 Bad Gateway` | api 容器没起来 | `docker compose logs api` 看启动报错 |
| 小程序报 `url not in domain list` | 域名没配进后台，或备案未通过 | 检查第 1.3 节 |
| 图片上传失败 | COS 域名没进 `request` 合法域名 | 见第 1.3 节 |
| AI 分析超时 | Nginx `proxy_read_timeout` 太短 | 调到 90s |
| worker 反复重启 | 内存不足（PaddleOCR 加载模型） | 升到 4 GiB，或加 swap |
| 登录 502 | 服务器出网问题 | `curl https://api.weixin.qq.com` 验证；正常 VPS 不该出现 |

## 11. 与云托管方案的取舍

| 维度 | 云托管 | VPS |
|---|---|---|
| 出网访问微信 API | ❌ 被拦 | ✅ 正常 |
| 备案要求 | 需自定义域名 + 备案 | 同样要备案 |
| 运维 | 免运维 | 自己管（本文已覆盖） |
| 成本 | 按量，¥15–30/月（低频） | 固定 ¥60–80/月 |
| 扩缩容 | 自动 | 手动 |
| 冷启动 | 有（可设常驻） | 无 |

**结论**：现阶段（用户量小、被出网问题卡死）选 VPS 更划算——多花的钱换来确定性。
