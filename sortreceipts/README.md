# SortReceipts 前端

海外版 Web 前端。Next.js 15（App Router）+ OpenNext，部署在 Cloudflare Workers。

## 这个应用不负责什么

仓库里没有数据库连接、没有 LLM 调用、没有 OCR 引擎。这些能力全在独立的后端 Worker 里，前端通过 [`lib/api.ts`](lib/api.ts) 把请求转过去，地址由 `WORKER_API_URL` 决定。

前端只保留两类服务端逻辑：

- 把 httpOnly cookie 里的 JWT 换成 `Authorization` 头，浏览器 JS 拿不到令牌。
- 在 Next 自己的路由里做少量聚合，例如首页仪表盘（[`app/api/dashboard/route.ts`](app/api/dashboard/route.ts)）和 CSV 导出（[`app/api/export/csv/route.ts`](app/api/export/csv/route.ts)）。

后端代码在同仓库的 `v1/apps/api-worker`（Hono + Cloudflare D1）。数据库表结构的权威来源是那边的 `src/db/schema.sql`，这个目录下没有迁移文件。

## 目录

| 路径 | 作用 |
|---|---|
| `app/` | 路由。`(登录后)` 的工作台页面与营销页混在同一个 App Router 里 |
| `app/[lang]/` | 非根语言的落地页，按 `generateStaticParams` 生成 7 种 |
| `app/guide/`、`app/zh/guide/` | 指南与主题子文，长文放在独立 URL 供搜索引擎和 AI 抓取 |
| `lib/actions/` | 服务端动作。页面的所有写操作都从这里走 |
| `lib/api.ts` | 唯一的后端请求出口，负责带令牌、解析错误体 |
| `components/` | 展示组件，没有业务状态 |
| `tests/` | vitest 单元测试，覆盖纯计算模块 |

## 本地开发

```bash
npm install
cp .env.example .env      # 填 WORKER_API_URL 等
npm run dev               # http://localhost:3000
```

`WORKER_API_URL` 必须指向一个能访问的后端；不配的话，任何需要数据的页面都会报「未配置 WORKER_API_URL」。

## 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器（Turbopack） |
| `npm run build` | 生产构建 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint，失败即有问题 |
| `npm test` | vitest 单次运行 |
| `npm run cf:build` | OpenNext 打包成 Worker 产物（`.open-next/`） |
| `npm run cf:preview` | 本地起 Worker 预览 |
| `npm run cf:deploy` | 部署到 Cloudflare |

## 环境变量

分两类，改之前先确认属于哪一类。

**构建期写入产物**（改完必须重新 `cf:build`）：`NEXT_PUBLIC_*` 全部属于这一类，包括站点地区、币种、Turnstile Site Key、统计令牌、站点根地址。

**运行期读取**：`WORKER_API_URL`、`WECHAT_PAY_QR_URL`、`ALIPAY_QR_URL`、`STRIPE_SECRET_KEY`。前三项的默认值在 [`lib/env.ts`](lib/env.ts)，`wrangler.jsonc` 的 `vars` 里也配了一份 `WORKER_API_URL`。

密钥不进前端：LLM 与 OCR 的密钥只存在后端 Worker，收款用的渠道密钥同理。

## 部署

`wrangler.jsonc` 把 Worker 绑在 `sortreceipts.qianling-tech.top`。改 `compatibility_date` 要同时改后端 Worker，两边保持一致。

```bash
npm run cf:build && npm run cf:deploy
```

## 检查与测试

`tests/` 里三个文件覆盖纯计算模块：金额格式化、报表汇总、分类码映射。这些函数一旦算错，页面上的数字就错，而且错得很安静，所以优先给它们写测试。

CI 在仓库根的 `.github/workflows/sortreceipts.yml`，依次跑 typecheck、lint、test、build。四步都是硬门禁：`next.config.ts` 里的 `ignoreDuringBuilds` 已经关掉，所以 ESLint 报错会在 `npm run build` 这一步让构建直接失败。

## 已知缺口

按影响从大到小，都还没做：

1. **票据原图不能回看。** 后端 `GET /api/files/:id/url` 已就绪，前端没有调用方，记录序列化时 `imageUrl` 被写死成 `null`（[`lib/actions/record-actions.ts`](lib/actions/record-actions.ts)）。用户要更正 AI 认错的字段时，手上没有原图可对。
2. **月度简报没发出去。** 后端 `/api/insights/monthly-digest` 能生成简报，但没有页面入口，定时任务也只做支付对账。
3. **整站按需渲染。** 根布局为了拿 `x-locale` 调用了 `headers()`（[`app/layout.tsx`](app/layout.tsx)），营销页、指南页、法务页因此都无法静态化。改法是让 `lang` 从路由参数来，而不是从请求头来。
4. **界面只有中英双语。** 落地页有 8 种语言，应用内只有 `zh` / `en`，其余语言的访客进来看到英文。
5. **错误上报未接入。** [`app/error.tsx`](app/error.tsx) 里有一段 Sentry 分支，但 `instrumentation.ts` 没有初始化 Sentry，DSN 也没配，线上报错只会进浏览器控制台。

## 写作约定

仓库根目录的 `AGENTS.md` 约束所有面向人阅读的文本：文档、注释、提交信息、报错文案。改这个目录下的中文说明时一并遵守。
