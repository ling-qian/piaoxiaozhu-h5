# 票小助 V1 — 餐饮票据整理微信小程序

面向副业党和小微老板的微信小程序产品，帮助用户快速整理餐饮票据、自动识别票据信息、智能分类归档。

## 架构

Taro 小程序 + FastAPI 后端 + PaddleOCR + PostgreSQL

## 项目结构

```
piaoxiaozhu-v1/
├── apps/
│   └── miniapp/          # Taro 微信小程序前端
├── services/
│   └── api/              # FastAPI 后端服务
├── packages/
│   └── core/             # 共享核心包
├── infra/                # 基础设施配置
│   ├── docker-compose.yml
│   └── deploy.sh
├── .env.example
├── .gitignore
└── README.md
```

## 快速开始

```bash
# 1. 启动后端服务
cd infra
docker compose up -d

# 2. 运行数据库迁移
docker compose exec api alembic upgrade head

# 3. 启动小程序开发
cd ../apps/miniapp
npm install
npm run dev:weapp

# 4. 打开微信开发者工具导入 dist 目录
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 小程序前端 | Taro + React + TypeScript |
| 后端服务 | FastAPI + SQLAlchemy + Alembic |
| 任务队列 | Celery + Redis |
| OCR 识别 | PaddleOCR |
| 数据库 | PostgreSQL 16 |
| 对象存储 | 阿里云 OSS |
| 大语言模型 | NVIDIA NIM (Nemotron) |
| 容器化 | Docker + Docker Compose |

## License

MIT
