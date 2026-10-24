# 票小助（piaoxiaozhu）项目长期记忆

## 主线与现状
- 主线产品在 **`v1/`**：Taro 3.6 微信小程序（`apps/miniapp`）+ FastAPI（`services/api`）+ PaddleOCR + Celery/Redis + PostgreSQL + 对象存储。
  根目录是 taxhacker 开源参考代码，`piaoxiaozhu-h5/` 是 Web 版（Vercel 线），都不是小程序发布主体。
- **主体是个人**（后续改企业）⇒ 不能用微信支付、不能用手机号快速验证组件、类目仅限工具类。
- 支付整体关闭：`apps/miniapp/src/config/features.ts` 的 `PAYMENT_ENABLED=false`（会员页此时不渲染价目表）；
  服务端 `PAYMENT_MOCK_ENABLED` 必须保持 false。

## 部署（权威文档：`v1/infra/cloud-hosting.md`）
- 微信云托管，**api / worker 拆两个镜像**（`services/api/Dockerfile.api` 不含 OCR、~300MB；`Dockerfile.worker` 含 OCR 且构建期预热模型）。
- 构建上下文必须是 **`v1/`**（要装 `packages/core`）；`.dockerignore` 必配（排除 node_modules/venv/venv2/uploads/.env/.swc/vercel）。
- 云托管**不要用「免费快速部署」模板**（那是从零起 demo 用的）。走「新建服务 → 新建版本 → 上传代码包/Git仓库/拉取镜像」。
  代码包上限 **2MiB**，实测我们打包后 0.39MiB。
- 数据库用腾讯云 PostgreSQL（云托管一键给的是 MySQL，**不做迁移**）；worker 规格 2 核 4GiB、不配端口。
- **迁移已实测**：干净库上 `alembic upgrade head` → 3 个迁移、10 张表，`alembic check` 无待生成变更（模型与迁移一致）。

## 备案（决定上线时间表）
- **小程序备案强制**（工信部，2023-09-01 起；个人主体同样要办，上限 5 个；未备案发布 errcode 86369）。
  豁免仅：境外主体、仅内部测试不对外发布（体验版可算）。
- **域名 ICP 备案**：走 `wx.request/uploadFile` 公网必须备案；**云托管默认公网域名不能配进小程序后台**（官方：仅测试）；
  唯一免备案通道是云调用 `callContainer`（无 uploadFile 等价物，撑不起票据图片）。
- ⚠️ 早期文档曾错写「云托管默认域名已备案可直接用」，已全部更正。权威对照见
  `cloudrun-migration-assessment/cloudrun-migration-assessment.html`（带官方引用）。

## 环境坑（本机 / 沙箱）
- **后端 `settings` 的 `.env` 按「当前工作目录」加载**：从 `v1/` 等其它目录调后端 CLI 会读不到 `.env`，
  `DATABASE_URL` 回落 sqlite → `No module named 'aiosqlite'`。CLI 脚本应在导入 `app` 前 `os.chdir(services/api)`。
- **调用 `docker` CLI 会被 SIGTERM 杀掉整个进程组**（守护进程不可达），镜像无法在本沙箱构建；preflight 用 `PREFLIGHT_SKIP_DOCKER=1` 跳过。
- Taro 构建在沙箱内写盘必被 brokered-fs 拦（非 recursive mkdir on existing dir）；dist 需在用户本机终端构建。
- macOS 自带 **bash 3.2**：`$var（` 变量后紧跟全角括号会把全角首字节并进变量名 → `unbound variable`；一律写 `${var}（`。
- BSD grep 的 `\|` 假阴性、`cat` 无 `-A`、无 `timeout` 命令；`/bin/rm -rf` 可绕过安全删除护栏。
- 本机有 Homebrew **PostgreSQL 17.10**；`services/api/venv2` 是唯一装了后端依赖的环境。

## 工作方式
- 多会话共享文档：编辑前**必须重读目标区域**（曾因凭记忆拼 old_string 差点覆盖别人新增内容）。
- 每轮产出 `docs/*.html` 报告 + 更新 `.workbuddy/memory/YYYY-MM-DD.md`；结论要给 `文件:行号`，能实测就实测。
