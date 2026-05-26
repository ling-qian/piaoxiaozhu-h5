# 票小助 H5 版设计文档

**日期**: 2026-05-26
**版本**: v1.1
**目标**: 完整复刻微信小程序体验，构建 H5 Web 版本，部署到 Vercel

---

## 1. 项目概述

将票小助 V1 微信小程序的 8 个页面功能完整复刻为 H5 Web 应用，使用 Next.js 全栈架构，前后端一体部署到 Vercel。

### 核心决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 项目方式 | 全新项目 | 架构干净，专注移动端 |
| 后端 | Next.js Server Actions | 前后端一体，Vercel 零配置部署 |
| OCR | Tesseract.js (WASM) | 浏览器端运行，无需后端 C++ 依赖 |
| 数据库 | PostgreSQL (Neon) | Vercel 原生集成，Serverless 友好 |
| 认证 | NextAuth.js 邮箱密码 | 简单可靠，无需第三方审核 |
| 图片存储 | Vercel Blob | 与 Vercel 生态集成 |

---

## 2. 技术架构

```
┌─────────────────────────────────────────────┐
│              Vercel (Edge + Serverless)       │
│                                              │
│  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Next.js 15   │  │  Server Actions      │  │
│  │  App Router   │  │  + Route Handlers    │  │
│  │  + React 19   │  │  + API Routes        │  │
│  └──────┬───────┘  └──────────┬───────────┘  │
│         │                      │              │
│  ┌──────┴───────┐  ┌──────────┴───────────┐  │
│  │  Tailwind CSS  │  │  Prisma 6            │  │
│  │  3 + shadcn/ui │  │  + PostgreSQL(Neon)  │  │
│  └──────────────┘  └──────────────────────┘  │
│                                              │
│  ┌──────────────┐  ┌──────────────────────┐  │
│  │  NextAuth.js  │  │  Tesseract.js v5     │  │
│  │  Credentials  │  │  前端 OCR (WASM)     │  │
│  └──────────────┘  └──────────────────────┘  │
│                                              │
│  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Vercel Blob  │  │  NVIDIA LLM API      │  │
│  │  图片存储     │  │  StepFun 分类补充     │  │
│  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 技术栈详情

- **框架**: Next.js 15 (App Router) + React 19 + TypeScript 5
- **样式**: Tailwind CSS 3 + shadcn/ui (移动端定制)
- **数据库**: PostgreSQL via Neon + Prisma 6 ORM
- **认证**: NextAuth.js v5 (Credentials Provider)
- **OCR**: Tesseract.js v5 (WASM, 浏览器端运行)
- **LLM**: NVIDIA API (StepFun step-3.5-flash) — Server Action 调用
- **图片存储**: Vercel Blob (@vercel/blob)
- **导出**: xlsx 库 (Excel) + 自定义 CSV 生成
- **图表**: Recharts (报表页成本分布图)
- **部署**: Vercel (零配置)

---

## 3. 页面结构

### 3.1 路由映射

| 小程序页面 | H5 路由 | 功能描述 |
|-----------|---------|---------|
| index (首页) | `/` | 项目列表+选择，底部 TabBar |
| upload (上传) | `/upload` | 拍照/选图 → OCR → 识别结果 |
| result (结果) | `/result?id=xxx` | OCR 结果编辑/手动录入 |
| result (手动) | `/result?manual=1` | 手动录入表单 |
| project (项目) | `/project/[id]` | 项目详情+记录列表+统计 |
| report (报表) | `/report/[id]` | 利润报表+月份筛选+分布图 |
| toolkit (工具箱) | `/toolkit` | 税务知识+发票操作指南 |
| mine (我的) | `/mine` | 用户信息+配额+设置 |
| member (会员) | `/member` | 套餐列表+购买 |
| login | `/auth/login` | 邮箱密码登录 |
| register | `/auth/register` | 注册 |

### 3.2 底部 TabBar

5 个入口，固定底部：

```
[🏠 首页] [📷 上传] [📊 报表] [📖 工具箱] [👤 我的]
```

### 3.3 页面布局

所有页面统一布局：
- 顶部：渐变头部 (橙色 #FF6B35 → #FF8F5E)
- 中间：白底圆角卡片内容区
- 底部：固定 TabBar (56px 高)

移动端优先，max-width: 430px 居中显示（桌面端自动居中）。

---

## 4. UI 设计系统

### 4.1 设计 Token (复刻小程序)

```css
:root {
  --color-brand: #FF6B35;
  --color-brand-light: #FF8F5E;
  --color-brand-dark: #E55A28;
  --color-brand-bg: #FFF3ED;
  --color-success: #52C41A;
  --color-warning: #FAAD14;
  --color-error: #FF4D4F;
  --color-text-primary: #333333;
  --color-text-secondary: #666666;
  --color-text-hint: #999999;
  --color-bg-page: #F5F5F5;
  --color-bg-card: #FFFFFF;
  --color-border: #EEEEEE;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --shadow-card: 0 2px 12px rgba(0, 0, 0, 0.08);
}
```

### 4.2 组件规范

- **卡片**: 白底 + border-radius: 12px + box-shadow
- **按钮主色**: bg-[#FF6B35] text-white rounded-xl
- **输入框**: border border-[#EEEEEE] rounded-lg focus:border-[#FF6B35]
- **标签**: 小圆角胶囊，不同分类不同颜色
- **金额**: 收入绿色(#52C41A) + 前缀，支出红色(#FF4D4F) + 前缀

---

## 5. 数据模型

### 5.1 Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String?
  avatarUrl    String?
  planCode     String   @default("free")
  quotaTotal   Int      @default(10)
  quotaUsed    Int      @default(0)
  projects     Project[]
  records      Record[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("users")
}

model Project {
  id        String   @id @default(cuid())
  userId    String
  name      String
  industry  String   @default("restaurant")
  records   Record[]
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("projects")
}

model Record {
  id                String   @id @default(cuid())
  projectId         String
  userId            String
  direction         String   @default("out")
  merchantName      String?
  amount            Float
  taxAmount         Float?
  invoiceDate       String?
  invoiceType       String?
  categoryCode      String   @default("other")
  categoryL1        String   @default("其他")
  categoryL2        String?
  confidence        Float    @default(0.5)
  reason            String?
  isManualCorrected Boolean  @default(false)
  rawText           String?
  imageUrl          String?
  project           Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@map("records")
}

model Plan {
  id          String @id @default(cuid())
  code        String @unique
  name        String
  price       Float
  quotaLimit  Int
  duration    Int
  features    String
  createdAt   DateTime @default(now())

  @@map("plans")
}
```

### 5.2 金额单位

- 数据库 `amount` 字段存储**元** (Float)，如 123.45
- 前端显示直接使用元，格式化为 `¥123.45`
- 报表计算内部使用分 (cents) 避免浮点精度问题，显示时转换回元

---

## 6. 核心业务逻辑

### 6.1 分类引擎 (5 层)

从 V1 Python 核心包翻译为 TypeScript，位于 `lib/categorize.ts`：

1. **Layer 1 - 商户字典精确匹配**: 预定义商户→分类映射 (confidence=1.0)
2. **Layer 2 - 票据文本关键词**: 关键词→分类映射 (confidence=0.85)
3. **Layer 3 - 行业模板优先**: 餐饮行业默认分类规则
4. **Layer 4 - LLM 补充**: 调用 NVIDIA API 进行分类 (confidence=0.7)
5. **Layer 5 - 默认**: other (confidence=0.5)

### 6.2 分类编码

```typescript
const CATEGORY_NAMES: Record<string, string> = {
  food_material: "食材",
  rent: "房租",
  salary: "工资",
  utilities: "水电燃气",
  platform_fee: "平台佣金",
  advertising: "广告推广",
  office: "办公用品",
  other: "其他",
};
```

### 6.3 字段提取

位于 `lib/extract-fields.ts`，正则提取：
- 商户名: `销售方名称[：:](.+)` / `商户名称[：:](.+)`
- 金额: `价税合计[：:]¥?([\d,]+\.?\d*)` / `合计[：:]¥?([\d,]+\.?\d*)`
- 税额: `税额[：:]¥?([\d,]+\.?\d*)` / 从税率推算
- 日期: `(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})`
- 发票类型: 增值税普通/专用/电子/收据/小票

### 6.4 报表生成

位于 `lib/report.ts`：
- 总收入、总成本、毛利润、毛利率
- 按分类的成本分布
- 月份筛选

### 6.5 收入/支出方向

- `direction="out"` (支出): 金额显示红色 (#FF4D4F)，前缀 `¥`
- `direction="income"` (收入): 金额显示绿色 (#52C41A)，前缀 `¥`
- 手动录入页提供「支出/收入」切换开关
- OCR 识别默认为支出，用户可在结果页修改

### 6.6 记录列表分页

- 项目详情页记录列表采用游标分页 (cursor-based)
- 每页 20 条，下拉加载更多
- 支持按月份/分类筛选

---

## 7. OCR 流程

```
用户拍照/选择图片 (浏览器端)
    ↓
前端 Tesseract.js 识别
    ├─ 中文语言包 (chi_sim) — CDN 动态加载 (~25MB)
    ├─ 返回 rawText
    ├─ 显示进度条 (0%→100%)
    ↓
extract-fields.ts 提取结构化字段
    ├─ merchantName, amount, taxAmount, invoiceDate, invoiceType
    ↓
categorize.ts 5层分类
    ├─ categoryCode, categoryL1, confidence
    ↓
(可选) LLM 补充分类
    ├─ 通过 Server Action 调用 NVIDIA API
    ↓
Server Action 保存 Record
    ├─ 图片上传 Vercel Blob (服务端)
    ├─ 写入 PostgreSQL
    ├─ 返回 recordId
```

### Tesseract.js 配置

```typescript
import Tesseract from 'tesseract.js';

const result = await Tesseract.recognize(imageFile, 'chi_sim+eng', {
  logger: (info) => setProgress(info.progress),
});
const rawText = result.data.text;
```

> **注意**: chi_sim 语言包约 25MB，首次加载较慢。Tesseract.js 默认从 CDN
> (tessdata.projectnaptha.com) 自动下载语言数据，无需打包到项目中。
> 可在 `next.config.ts` 中配置 `images.remotePatterns` 允许图片预览。

### 图片上传策略

- OCR 在前端完成，图片先在浏览器中处理
- OCR 完成后，通过 Server Action 将图片上传到 Vercel Blob
- Vercel Blob 返回公开 URL，存入 Record.imageUrl
- 如果 OCR 失败，图片不上传，用户可重新拍照

---

## 8. 认证系统

### NextAuth.js 配置

```typescript
// auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      authorize: async (credentials) => {
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });
        if (!user) return null;
        const valid = await bcrypt.compare(
          credentials.password as string, user.passwordHash
        );
        return valid ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
  ],
  session: { strategy: "jwt" },
});
```

### 路由保护

- 所有 `/api/*` 和应用页面通过 middleware.ts 保护
- 登录/注册页面公开

---

## 9. 项目目录结构

```
piaoxiaozhu-h5/
├── app/
│   ├── layout.tsx              # 根布局 (字体/Provider)
│   ├── page.tsx                # 首页 (项目列表)
│   ├── upload/page.tsx         # 上传页
│   ├── result/page.tsx         # 识别结果/手动录入
│   ├── project/[id]/page.tsx   # 项目详情
│   ├── report/[id]/page.tsx    # 报表页
│   ├── toolkit/page.tsx        # 工具箱
│   ├── mine/page.tsx           # 我的
│   ├── member/page.tsx         # 会员
│   ├── auth/
│   │   ├── login/page.tsx      # 登录
│   │   └── register/page.tsx   # 注册
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       └── export/route.ts     # CSV/Excel 导出
├── components/
│   ├── ui/                     # shadcn/ui 组件
│   ├── tab-bar.tsx             # 底部 TabBar
│   ├── page-header.tsx         # 渐变头部
│   ├── category-tag.tsx        # 分类标签
│   ├── quota-card.tsx          # 配额卡片
│   ├── record-card.tsx         # 记录卡片
│   ├── stat-card.tsx           # 统计卡片
│   ├── cost-chart.tsx          # 成本分布图
│   └── ocr-progress.tsx        # OCR 进度条
├── lib/
│   ├── prisma.ts               # Prisma 客户端
│   ├── auth.ts                 # NextAuth 配置
│   ├── categorize.ts           # 5层分类引擎
│   ├── extract-fields.ts       # 字段提取
│   ├── report.ts               # 报表生成
│   ├── export.ts               # CSV/Excel 导出
│   ├── ocr.ts                  # Tesseract.js 封装
│   ├── llm.ts                  # NVIDIA LLM API
│   ├── constants.ts            # 分类编码/商户字典
│   └── utils.ts                # 工具函数
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                 # 初始数据 (套餐/工具包内容)
├── public/
│   └── icons/                  # TabBar 图标
├── middleware.ts               # 路由保护
├── next.config.ts
├── tailwind.config.ts
├── vercel.json
└── package.json
```

---

## 10. 环境变量

```env
# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require"
DIRECT_URL="postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require"

# Auth
AUTH_SECRET="random-secret-string"
AUTH_URL="https://your-domain.vercel.app"

# LLM (NVIDIA API)
LLM_BASE_URL="https://integrate.api.nvidia.com/v1"
LLM_API_KEY="nvapi-xxx"
LLM_MODEL_NAME="stepfun-ai/step-3.5-flash"

# Blob Storage
BLOB_READ_WRITE_TOKEN="vercel_blob_xxx"
```

---

## 11. 部署流程

1. GitHub 仓库连接 Vercel
2. Vercel 自动检测 Next.js，零配置部署
3. Neon PostgreSQL 创建数据库，连接字符串写入环境变量
4. `npx prisma migrate deploy` 执行数据库迁移
5. `npx prisma db seed` 初始化套餐/工具包数据
6. 域名配置 (vercel.app 子域名或自定义域名)

---

## 12. 与 V1 小程序的功能对照

| 功能 | V1 小程序 | H5 版本 | 备注 |
|------|----------|---------|------|
| 微信登录 | ✅ | ❌ → 邮箱密码 | H5 无法使用微信登录 |
| 拍照识别 | ✅ wx.chooseImage | ✅ input[type=file] + camera | H5 使用浏览器 API |
| OCR 识别 | ✅ PaddleOCR | ✅ Tesseract.js | 精度可能略低 |
| LLM 分类 | ✅ NVIDIA API | ✅ NVIDIA API | 相同 |
| 5层分类 | ✅ Python | ✅ TypeScript | 逻辑一致 |
| 手工录入 | ✅ | ✅ | 含方向切换 |
| 报表+月份 | ✅ | ✅ | 含成本分布图 |
| CSV 导出 | ✅ | ✅ | |
| Excel 导出 | ✅ | ✅ | |
| 工具箱 | ✅ Mock | ✅ 硬编码 | 同 V1 |
| 会员购买 | ✅ 微信支付 | ✅ 暂 Mock | 后续接入 Stripe |
| 图片存储 | ✅ 阿里云 OSS | ✅ Vercel Blob | |
