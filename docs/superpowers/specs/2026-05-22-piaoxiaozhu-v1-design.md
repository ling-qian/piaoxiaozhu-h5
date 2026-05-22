# 票小助 V1 架构设计

## 1. 方案结论

将 TaxHacker（现有 Web POC 仓库）的票据处理内核与数据设计思路迁移到全新项目 `piaoxiaozhu-v1`，新建微信小程序前端和 FastAPI 后端。

现有仓库保留为能力参考和后续 Web SaaS 基础。

## 2. 关键决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 项目位置 | 新建 `piaoxiaozhu-v1` + 迁移核心代码 | 独立演进，避免耦合 |
| 架构方案 | 全 Python 单体（方案 A） | core 和 api 同语言，PaddleOCR 原生 Python，4 周可交付 |
| OCR 方案 | PaddleOCR | 准确率高，免费，Python 原生 |
| 小程序框架 | Taro + React | 生态成熟，支持多端，与现有 React 经验一致 |

## 3. 项目结构

```
piaoxiaozhu-v1/
├── apps/
│   └── miniapp/                  # Taro 3 微信小程序
│       ├── src/
│       │   ├── pages/            # 小程序页面
│       │   │   ├── index/        # 首页
│       │   │   ├── upload/       # 上传页
│       │   │   ├── result/       # 识别结果页
│       │   │   ├── project/      # 项目详情页
│       │   │   ├── report/       # 报表页
│       │   │   ├── member/       # 会员中心
│       │   │   ├── toolkit/      # 副业工具包
│       │   │   └── mine/         # 我的
│       │   ├── components/       # 公共组件
│       │   ├── services/         # API 调用层
│       │   ├── store/            # 状态管理 (zustand)
│       │   ├── utils/            # 工具函数
│       │   └── app.config.ts     # Taro 页面路由配置
│       ├── package.json
│       └── project.config.json   # 微信小程序配置
│
├── services/
│   └── api/                      # FastAPI 后端
│       ├── app/
│       │   ├── main.py           # FastAPI 入口
│       │   ├── config.py         # 环境变量配置
│       │   ├── deps.py           # 依赖注入
│       │   ├── routers/          # API 路由
│       │   │   ├── auth.py       # 微信登录
│       │   │   ├── files.py      # 文件上传
│       │   │   ├── ocr.py        # OCR 识别
│       │   │   ├── records.py    # 票据记录 CRUD
│       │   │   ├── projects.py   # 项目管理
│       │   │   ├── reports.py    # 报表统计
│       │   │   ├── payments.py   # 微信支付
│       │   │   ├── plans.py      # 套餐额度
│       │   │   └── toolkit.py    # 工具包
│       │   ├── models/           # SQLAlchemy 模型
│       │   ├── schemas/          # Pydantic Schema
│       │   ├── services/         # 业务逻辑层
│       │   └── utils/            # 工具函数
│       ├── alembic/              # 数据库迁移
│       ├── requirements.txt
│       └── Dockerfile
│
├── packages/
│   └── core/                     # Python 核心能力包
│       ├── piaoxiaozhu_core/
│       │   ├── __init__.py
│       │   ├── categorize.py     # 分类规则引擎（迁移自 poc-categorize.ts）
│       │   ├── report.py         # 利润报表计算（迁移自 poc-report.ts）
│       │   ├── export.py         # CSV/Excel 导出（迁移自 export_and_import.ts）
│       │   ├── ocr.py            # PaddleOCR 封装
│       │   ├── llm.py            # LLM 补充分类（参考 llmProvider.ts）
│       │   └── templates/        # 行业模板
│       │       ├── restaurant.py # 餐饮模板（迁移自 defaults.ts）
│       │       └── __init__.py
│       ├── tests/
│       └── pyproject.toml
│
├── infra/
│   ├── docker-compose.yml        # 本地开发环境
│   ├── Dockerfile.miniapp        # 小程序构建（CI 用）
│   └── deploy.sh                 # 部署脚本
│
├── docs/
│   └── api/                      # API 文档（FastAPI 自动生成）
│
└── README.md
```

## 4. 数据模型

### users - 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| openid | String(128) UNIQUE | 微信 openid |
| unionid | String(128) UNIQUE | 微信 unionid（可选） |
| phone | String(20) | 手机号 |
| nickname | String(64) | 昵称 |
| avatar_url | String(512) | 头像 |
| plan_code | String(32) DEFAULT 'free' | 套餐代码 |
| quota_total | Integer DEFAULT 10 | 总额度 |
| quota_used | Integer DEFAULT 0 | 已用额度 |
| created_at | DateTime | 创建时间 |

### customers - 客户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK -> users | 所属副业党 |
| name | String(128) | 客户名称 |
| industry | String(32) DEFAULT 'restaurant' | 行业 |
| contact_name | String(64) | 联系人 |
| contact_phone | String(20) | 联系电话 |
| remark | Text | 备注 |
| created_at | DateTime | 创建时间 |

### projects - 项目表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK -> users | 所属用户 |
| customer_id | UUID FK -> customers | 可选，副业党场景 |
| name | String(128) | 项目名 |
| industry | String(32) DEFAULT 'restaurant' | 行业 |
| report_month | String(7) | "2026-05" |
| status | String(16) DEFAULT 'active' | active/completed |
| created_at | DateTime | 创建时间 |

### invoice_files - 票据文件表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| project_id | UUID FK -> projects | 所属项目 |
| user_id | UUID FK -> users | 所属用户 |
| file_url | String(512) | OSS/S3 地址 |
| file_key | String(256) | OSS object key |
| source | String(16) DEFAULT 'camera' | camera/album |
| ocr_status | String(16) DEFAULT 'pending' | pending/processing/done/failed |
| parse_status | String(16) DEFAULT 'pending' | pending/done/failed |
| created_at | DateTime | 创建时间 |

### invoice_records - 票据记录表（核心业务表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| project_id | UUID FK -> projects | 所属项目 |
| file_id | UUID FK -> invoice_files | 关联文件 |
| user_id | UUID FK -> users | 所属用户 |
| direction | String(8) DEFAULT 'cost' | income/cost |
| merchant_name | String(256) | 商户名 |
| tax_no | String(32) | 税号 |
| amount | Integer | 金额（分） |
| tax_amount | Integer | 税额（分） |
| invoice_date | Date | 开票日期 |
| category_code | String(32) | 分类代码 |
| category_l1 | String(32) | 一级分类：收入/成本/费用 |
| category_l2 | String(32) | 二级分类：食材/房租/... |
| confidence | Float DEFAULT 0.0 | 分类置信度 |
| raw_text | Text | OCR 原始文本 |
| reason | String(256) | 分类理由 |
| is_manual_corrected | Boolean DEFAULT False | 是否人工修正 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

### report_snapshots - 报表快照

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| project_id | UUID FK -> projects | 所属项目 |
| total_income | Integer DEFAULT 0 | 总收入（分） |
| total_cost | Integer DEFAULT 0 | 总成本（分） |
| gross_profit | Integer DEFAULT 0 | 毛利润（分） |
| gross_margin | Float DEFAULT 0.0 | 毛利率 |
| cost_structure | JSON | 成本结构 JSON |
| generated_at | DateTime | 生成时间 |

### plans - 套餐表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| code | String(32) UNIQUE | free/basic/pro/toolkit |
| name | String(64) | 免费版/基础版/专业版/工具包 |
| monthly_quota | Integer | 月额度 |
| price | Integer | 价格（分） |
| description | Text | 描述 |

### orders - 订单表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK -> users | 所属用户 |
| product_type | String(32) | plan/toolkit/training |
| product_code | String(32) | basic/pro/toolkit |
| amount | Integer | 金额（分） |
| status | String(16) DEFAULT 'pending' | pending/paid/refunded |
| channel | String(16) DEFAULT 'wechat' | 支付渠道 |
| wx_prepay_id | String(128) | 微信预支付 ID |
| wx_trade_no | String(128) | 微信支付流水号 |
| paid_at | DateTime | 支付时间 |
| created_at | DateTime | 创建时间 |

### quota_logs - 额度扣减日志

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK -> users | 所属用户 |
| file_id | UUID FK -> invoice_files | 关联文件 |
| action | String(16) | deduct/refund |
| amount | Integer DEFAULT 1 | 扣减数量 |
| created_at | DateTime | 创建时间 |

### 与现有仓库的映射

| 现有模型 | V1 模型 | 变化 |
|---------|---------|------|
| User | users | +openid/unionid/phone/plan_code/quota |
| Project | projects | +customer_id/industry/report_month |
| File | invoice_files | +file_url/file_key/ocr_status |
| Transaction | invoice_records | +direction/category_l1/l2/confidence/raw_text |
| Category | 行业模板内嵌 | 不再独立建表，改为模板配置 |
| Setting | 系统配置 | 不再建表，改为环境变量+模板 |
| - | customers | 新增：副业党客户管理 |
| - | report_snapshots | 新增：报表快照 |
| - | plans/orders/quota_logs | 新增：计费体系 |

## 5. 核心识别链路

```
小程序上传图片
    ↓
API: POST /files/upload → 写入 OSS/S3 → 返回 file_id
    ↓
API: POST /ocr/parse → 异步任务
    ↓
Step 1: PaddleOCR 提取文本+版面     ← "看清"
Step 2: 规则引擎提取字段            ← "结构化"
Step 3: 分类引擎规则匹配            ← "稳定"
Step 4: LLM 补充分类（低置信时）     ← "补缺"
Step 5: 保存 invoice_record        ← "落库"
Step 6: 更新项目报表快照             ← "汇总"
    ↓
小程序轮询结果 → 展示识别结果 → 允许人工修正
```

与现有仓库的关键差异：
- 现有仓库：图片 → LLM Vision → 结构化 JSON（一步到位）
- V1：图片 → PaddleOCR → 规则提取 → 规则分类 → LLM 补全（分步更稳）

## 6. 分类引擎

### 5 层优先级

1. **商户关键词词典**：精确匹配已知商户名，如"美团"→ platform_fee
2. **票据文本规则匹配**：关键词匹配，如"蔬菜/生鲜"→ food_material
3. **行业模板优先规则**：餐饮行业特有规则，如"外卖"→ platform_fee
4. **LLM 分类补充**：前三层均未命中或置信度低时调用
5. **人工修正回写**：用户修改后记录 is_manual_corrected=True

### 餐饮行业二级分类

| 一级 | 二级代码 | 二级名称 | 关键词 |
|------|---------|---------|--------|
| 成本 | food_material | 食材 | 蔬菜/生鲜/粮油/冻品/调味/肉禽/海鲜/米/面/食材/农贸 |
| 成本 | rent | 房租 | 房租/租赁/物业/场地/租金 |
| 成本 | salary | 工资 | 工资/薪资/劳务/用工/工资表 |
| 成本 | utilities | 水电 | 电费/水费/燃气/天然气/供电/供水 |
| 成本 | platform_fee | 平台佣金 | 美团/饿了么/抖音/平台服务费/技术服务费/佣金/平台扣点 |
| 成本 | advertising | 广告 | 广告/推广/营销/传单/宣传 |
| 成本 | office | 办公 | 办公/文具/打印/纸张/耗材 |
| 成本 | other | 其他 | 未命中任何规则 |
| 收入 | income | 营业收入 | 手工录入/营业额 |

LLM 补充分类只在 Layer 1-3 置信度 < 0.7 时触发，调用 OpenAI 兼容 API。

## 7. API 接口

```
认证
  POST /api/auth/wechat/login      # 微信登录（code → openid → token）
  POST /api/auth/wechat/bind-phone # 绑定手机号

文件上传
  POST /api/files/upload           # 上传图片到 OSS，返回 file_id
  POST /api/ocr/parse              # 触发 OCR 识别（异步）
  GET  /api/ocr/status/{file_id}   # 查询识别状态

票据记录
  GET    /api/projects/{id}/records         # 项目下的票据列表
  PATCH  /api/records/{id}                  # 修改票据（人工修正）
  DELETE /api/records/{id}                  # 删除票据

项目
  GET    /api/projects              # 项目列表
  POST   /api/projects              # 创建项目
  GET    /api/projects/{id}         # 项目详情

报表
  GET    /api/projects/{id}/report           # 获取报表
  GET    /api/projects/{id}/report/export    # 导出 CSV/Excel
  POST   /api/projects/{id}/report/share     # 生成分享链接

支付
  POST /api/payments/wechat/prepay  # 创建预支付订单
  POST /api/payments/wechat/notify  # 微信支付回调

会员
  GET /api/plans                    # 套餐列表
  GET /api/me/quota                 # 当前额度

工具包
  GET /api/toolkit/contents         # 工具包内容列表

用户
  GET /api/me                       # 当前用户信息
```

## 8. 小程序页面

```
首页 (index)
├── 剩余识别次数卡片
├── 最近项目列表 → 点击进入项目详情
├── 快速上传按钮 → 跳转上传页
├── 新手教程入口
└── 升级会员入口 → 会员中心

上传页 (upload)
├── 拍照上传
├── 相册上传（最多9张）
├── 选择/创建项目
├── 上传进度条
└── 上传完成 → 跳转识别结果页

识别结果页 (result)
├── 商户名称（可编辑）
├── 日期（可编辑）
├── 金额（可编辑）
├── 税额（可编辑）
├── 分类选择（下拉，可修改）
├── 分类置信度提示
│   ├── 规则分类 → "已按规则自动分类"
│   └── AI分类 → "AI 建议分类，建议确认"
├── 保存入项目
└── 下一张 → 继续识别

项目详情页 (project)
├── 项目基本信息
├── 票据列表（按分类筛选）
├── 金额汇总
├── 手工录入月营业额
└── 查看报表 → 报表页

报表页 (report)
├── 总收入 / 总成本 / 毛利润 / 毛利率
├── 成本结构饼图
├── 分类明细表
├── 导出 Excel
└── 分享

会员中心 (member)
├── 当前套餐
├── 剩余额度
├── 套餐列表（免费/基础/专业）
├── 购买 → 微信支付
└── 购买记录

副业工具包 (toolkit)
├── 教程视频列表
├── 话术模板
├── 合同模板
├── 定价模板
└── 案例展示

我的 (mine)
├── 头像/昵称
├── 手机绑定
├── 使用记录
└── 客服入口
```

## 9. 支付设计

### 支付流程

```
用户选择套餐 → POST /api/payments/wechat/prepay
    ↓
服务端创建 order（status=pending）→ 调用微信预支付 API → 返回 prepay_id
    ↓
小程序调起微信支付 → 用户完成支付
    ↓
微信回调 POST /api/payments/wechat/notify → 验签 → 更新 order（status=paid）→ 发放额度
    ↓
用户额度更新（quota_total += 套餐额度）
```

### 套餐定义

| product_code | 名称 | 月额度 | 价格 |
|-------------|------|--------|------|
| free | 免费版 | 10 张 | ¥0 |
| basic | 基础版 | 500 张 | ¥29/月 |
| pro | 专业版 | 3000 张 | ¥99/月 |
| toolkit | 工具包 | - | ¥49（一次性） |

### 额度扣减规则

- OCR 成功入队时扣减（不是上传时）
- 失败重试不重复扣减
- 每次扣减写入 quota_logs

## 10. 导出设计

### CSV 导出

导出字段：日期, 商户, 金额(元), 税额(元), 一级分类, 二级分类, 备注

金额从分转为元，保留2位小数。

### Excel 导出

包含两个 sheet：
- Sheet 1: 票据明细（同 CSV 字段）
- Sheet 2: 经营汇总（总收入/总成本/毛利润/毛利率/分类占比）

## 11. 分享设计（MVP）

```
用户点击"分享" → POST /api/projects/{id}/report/share
    ↓
生成 share_token（7天有效）→ 返回 H5 报表页 URL
    ↓
小程序内展示分享海报（Canvas 绘制）或复制 H5 链接
    ↓
H5 页面：只读报表，底部带"使用票小助整理票据"引导
```

## 12. 技术选型

| 层 | 技术 | 版本 |
|----|------|------|
| 小程序 | Taro + React + TypeScript | Taro 3.6+ |
| 状态管理 | zustand | 4.x |
| UI 组件 | @tarojs/components + 自定义 | - |
| 后端 | FastAPI | 0.110+ |
| ORM | SQLAlchemy 2.0 + Alembic | - |
| OCR | PaddleOCR | 2.7+ |
| LLM | OpenAI 兼容 API（NVIDIA/其他）| - |
| 数据库 | PostgreSQL 16 | - |
| 文件存储 | 阿里云 OSS | - |
| 缓存 | Redis | 7.x |
| 任务队列 | Celery + Redis | - |
| 微信支付 | wechatpay-python | - |
| 部署 | Docker + 腾讯云轻量应用服务器 | - |

## 13. 部署架构

```
腾讯云轻量应用服务器
├── Docker Compose
│   ├── api        (FastAPI, 2 workers)
│   ├── worker     (Celery worker, 处理 OCR 异步任务)
│   ├── redis      (任务队列 + 缓存)
│   └── postgres   (数据库)
├── OSS            (阿里云，票据图片存储)
└── Nginx          (反向代理 + HTTPS)
```

## 14. MVP 第 1 周开发范围

1. 初始化项目结构（目录 + 配置文件）
2. FastAPI 骨架 + 数据库模型 + Alembic 迁移
3. Taro 小程序骨架 + 页面路由 + 基础布局
4. 微信登录接口
5. packages/core：迁移分类规则 + 报表计算 + 导出逻辑
