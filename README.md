<div align="center"><a name="readme-top"></a>

<br>

# 票小助 — 餐饮票据整理助手

[![License](https://img.shields.io/badge/license-MIT-ffcb47?labelColor=black&style=flat-square)](https://github.com/ling-qian/piaoxiaozhu/blob/main/LICENSE)

</div>

票小助是一款面向餐饮行业的智能票据整理工具，帮助小餐饮店主、个体经营者快速完成发票/收据的 AI 识别、自动分类和利润统计。

上传票据照片或 PDF，票小助会自动识别商户名称、金额、日期、税额等关键信息，结合规则引擎自动归类（食材、房租、工资、水电、平台佣金等），还可以手工录入月营业额，一键查看毛利润和毛利率，并导出 CSV 报表。

> ⚠️ 本项目仍处于早期开发阶段（POC），请谨慎用于生产环境。

## ✨ 核心功能

### `1` AI 票据识别 + 自动分类

上传收据照片或发票 PDF，AI 自动识别并提取关键信息：

- **智能 OCR**：支持拍照上传、PDF 上传，自动识别商户、金额、日期、税额等
- **规则分类引擎**：基于关键词的规则分类覆盖 LLM 结果，分类更稳定可靠
  - 🥬 食材（蔬菜/生鲜/粮油/冻品/调味/肉禽/海鲜…）
  - 🏠 房租（房租/租赁/物业/场地…）
  - 💰 工资（工资/薪资/劳务/用工…）
  - 💧 水电（电费/水费/燃气…）
  - 📱 平台佣金（美团/饿了么/抖音/技术服务费/佣金…）
  - 📦 其他
- **可手动修改**：规则分类结果可手动调整，AI 识别字段均可编辑

### `2` 手工录入营业额 + 利润统计

- **月度营业额录入**：手工输入每月营业额，系统自动计算毛利润和毛利率
- **利润概览**：总收入、总成本、毛利润、毛利率一目了然
- **分类成本占比**：按分类查看成本构成（食材占多少、房租占多少…）

### `3` CSV 导出

- 按月份筛选，一键导出交易记录为 CSV
- 包含日期、商户、金额、税额、分类、备注等完整字段
- 可直接用于财务报表或交给会计

### `4` 多 LLM 支持

票小助支持多种 LLM 提供商，可按优先级排序：

| 提供商 | 默认模型 | 说明 |
|--------|---------|------|
| **OpenAI 兼容** | 自定义 | 支持 NVIDIA NIM、Ollama、LM Studio、vLLM 等 |
| **OpenAI** | gpt-4o-mini | 官方 API |
| **Google** | gemini-2.5-flash | 免费额度大，支持 Vision |
| **Mistral** | mistral-medium-latest | 欧洲提供商 |

排在前面的提供商优先使用，失败后自动降级到下一个。

### `5` 自托管，数据自主

- **本地部署**：数据完全存储在你自己的服务器上
- **Docker 支持**：一键 Docker Compose 部署
- **无供应商锁定**：随时导出全部数据

## 🛳 部署

### Docker Compose（推荐）

```bash
curl -O https://raw.githubusercontent.com/ling-qian/piaoxiaozhu/main/docker-compose.yml

docker compose up
```

### Vercel + Neon（免费方案）

1. 在 [Neon](https://neon.tech) 创建免费 PostgreSQL 数据库
2. 在 [Vercel](https://vercel.com) 导入 GitHub 仓库
3. 配置环境变量（见下方）
4. 部署

### 环境变量

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接字符串 | `postgresql://user@localhost:5432/piaoxiaozhu` |
| `BETTER_AUTH_SECRET` | ✅ | 认证密钥（至少 16 字符） | `your-secure-random-key` |
| `BASE_URL` | ❌ | 应用基础 URL | `http://localhost:7331` |
| `PORT` | ❌ | 端口号 | `7331`（默认） |
| `SELF_HOSTED_MODE` | ❌ | 自托管模式，跳过注册 | `true` |
| `OPENAI_COMPATIBLE_API_KEY` | ❌ | OpenAI 兼容 API 密钥 | `nvapi-...` |
| `OPENAI_COMPATIBLE_MODEL_NAME` | ❌ | OpenAI 兼容模型名称 | `nvidia/nemotron-nano-12b-v2-vl` |
| `OPENAI_COMPATIBLE_BASE_URL` | ❌ | OpenAI 兼容 API 地址 | `https://integrate.api.nvidia.com/v1` |
| `OPENAI_API_KEY` | ❌ | OpenAI API 密钥 | `sk-...` |
| `GOOGLE_API_KEY` | ❌ | Google AI API 密钥 | `AIza...` |
| `MISTRAL_API_KEY` | ❌ | Mistral API 密钥 | `...` |

## ⌨️ 本地开发

技术栈：

- **Next.js 15+**（App Router + Server Actions + Turbopack）
- **Prisma** ORM + **PostgreSQL**（金额单位为分）
- **LangChain** + 多 LLM 提供商
- **Vision API** 用于票据图片 OCR

```bash
# 克隆仓库
git clone https://github.com/ling-qian/piaoxiaozhu.git
cd piaoxiaozhu

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，设置 DATABASE_URL 和 LLM API Key

# 初始化数据库
npx prisma generate && npx prisma migrate dev

# 启动开发服务器
npm run dev
```

访问 http://localhost:7331 即可使用。

生产构建：

```bash
npm run build
npm run start
```

## 📄 许可证

票小助基于 [MIT License](LICENSE) 开源。
