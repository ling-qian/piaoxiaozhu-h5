import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.config import settings
from app.routers import auth, files, records, projects, reports, payments, plans, toolkit, users, manual_income, analysis, points, admin, insights
from app.services import storage

logger = logging.getLogger(__name__)

app = FastAPI(title="PiaoXiaoZhu API", version="1.0.0", docs_url="/docs", redoc_url="/redoc")

_cors_origins = [o.strip() for o in settings.CORS_ALLOW_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 生产环境必须替换掉的示例默认值
INSECURE_JWT_SECRETS = {"change-me-in-production", "change-this-to-a-random-string"}
# 弱密钥不止「示例默认值」一种：短密钥同样可被暴力穷举，HS256 建议 >= 32 字节
MIN_JWT_SECRET_LENGTH = 32


def _check_runtime_config() -> None:
    """启动体检：把「生产环境配漏了」提前到进程启动时暴露，
    而不是等用户登录、上传或识别时才踩到。"""
    problems = []

    if (
        settings.JWT_SECRET in INSECURE_JWT_SECRETS
        or len(settings.JWT_SECRET) < MIN_JWT_SECRET_LENGTH
    ):
        problems.append(
            f"JWT_SECRET 过弱（示例默认值或长度不足 {MIN_JWT_SECRET_LENGTH} 位），任何人都能伪造登录 token"
        )
    if settings.DATABASE_URL.startswith("sqlite"):
        problems.append("DATABASE_URL 仍指向 SQLite，多副本部署请改为 PostgreSQL")
    if not settings.LLM_API_KEY:
        problems.append("LLM_API_KEY 未配置，票据分类的大模型后处理会直接失败")
    # 未配对象存储时票据图片落在容器本地盘，多副本/重启即丢，且分享与报表的
    # 历史图片全部失效——对「缴费用户」是可感知的数据丢失，生产不能产线运行。
    # 判定必须走 storage 抽象：只查 OSS_* 会把「只配了 COS」误判成未配置。
    if not storage.is_remote_configured():
        problems.append(
            "未配置对象存储（COS_* 或 OSS_*），票据图片会落在容器本地盘，重启即丢失"
        )

    for item in problems:
        logger.error("配置体检未通过：%s", item)

    if settings.APP_ENV == "production" and problems:
        raise RuntimeError("生产环境配置体检未通过，拒绝启动：" + "；".join(problems))

    # 非致命项只提醒
    logger.info("对象存储后端：%s", storage.describe_backend())
    if settings.SHARE_BASE_URL.startswith("https://app."):
        logger.warning(
            "SHARE_BASE_URL 仍是默认域名（%s），报表分享链接可能不可达",
            settings.SHARE_BASE_URL,
        )

    logger.info(
        "LLM 配置：base_url=%s model=%s enabled=%s",
        settings.LLM_BASE_URL,
        settings.LLM_MODEL_NAME,
        bool(settings.LLM_API_KEY),
    )
    logger.info("内容安全检查：%s", "已启用" if settings.CONTENT_SECURITY_ENABLED else "已关闭")


app.include_router(auth.router)
app.include_router(files.router)
app.include_router(records.router)
app.include_router(projects.router)
app.include_router(reports.router)
app.include_router(payments.router)
app.include_router(plans.router)
app.include_router(toolkit.router)
app.include_router(users.router)
app.include_router(manual_income.router)
app.include_router(analysis.router)
app.include_router(points.router)
app.include_router(admin.router)
app.include_router(insights.router)

upload_dir = Path("uploads")
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/files/static", StaticFiles(directory="uploads"), name="static_uploads")

# 管理后台：纯静态页面，不引入前端构建链。
# 目录不存在时跳过挂载（例如容器里没拷贝 UI），接口仍然可用。
# 候选路径：显式配置 > 仓库布局（v1/apps/admin）> 容器布局（/app/admin）
_here = Path(__file__).resolve().parent          # services/api/app
_admin_candidates = [
    Path(settings.ADMIN_UI_DIR),                  # 允许 .env 覆盖
    _here.parent.parent.parent / "apps" / "admin",  # 仓库：v1/apps/admin
    _here.parent / "admin",                       # 容器：/app/admin
]
_admin_dir = next((p for p in _admin_candidates if p.is_dir()), None)
if _admin_dir is not None:
    app.mount("/admin", StaticFiles(directory=str(_admin_dir), html=True), name="admin_ui")
    logger.info("管理后台已挂载：%s", _admin_dir)
else:
    logger.warning(
        "管理后台目录不存在，跳过挂载；候选路径：%s",
        "、".join(str(p) for p in _admin_candidates),
    )


@app.on_event("startup")
async def startup():
    _check_runtime_config()

    from app.seed import seed
    await seed()

    # 支付配置体检：让「配漏了 / 配错了」在服务启动时就暴露，而不是等用户
    # 点升级、甚至等付款回调进来才发现（那时钱已经扣了）。未通过的具体原因
    # 由 wechat_pay_ready() 写入日志。
    if payments.wechat_pay_ready():
        logger.info("微信支付配置校验通过，可发起真实支付")
    else:
        logger.warning(
            "微信支付未就绪，/api/payments/wechat/prepay 将返回「支付功能暂未开放」"
        )


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "piaoxiaozhu-api", "version": "1.0.0"}
