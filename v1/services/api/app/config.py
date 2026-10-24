from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # development / production。production 会开启启动体检的强校验（配置有问题直接拒绝启动）
    APP_ENV: str = "development"

    DATABASE_URL: str = "sqlite+aiosqlite:///./piaoxiaozhu.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7

    # 允许的跨域来源，逗号分隔。默认 "*" 便于本地联调；生产建议收敛为实际域名。
    # 小程序请求不走 CORS，此项只影响浏览器端（如 H5 分享页）。
    CORS_ALLOW_ORIGINS: str = "*"

    WX_APPID: Optional[str] = None
    WX_SECRET: Optional[str] = None
    # 云托管「开放接口服务」开关。开启后调用微信接口改走内网（http，免 access_token）。
    # 必须与控制台开关一致：
    #   控制台开了这里不开 → 仍走公网 https（云托管出网不通时表现为 502）
    #   控制台没开这里开   → 请求打到 http://api.weixin.qq.com 会被重定向，同样失败
    WECHAT_OPENAPI_SIDECAR: bool = False
    # 出网 TLS 校验。云托管的公网出口有透明中间人代理（自签证书），
    # 会报 CERTIFICATE_VERIFY_FAILED；那种环境设为 false。
    # 普通服务器保持默认 true。详见 app/services/http_client.py 的模块 docstring。
    WX_TLS_VERIFY: bool = True
    WX_MCH_ID: Optional[str] = None
    WX_API_KEY: Optional[str] = None
    # 微信支付 V3 参数
    WX_CERT_SERIAL_NO: Optional[str] = None       # 商户证书序列号，用于 Authorization 头
    WX_PRIVATE_KEY_PATH: Optional[str] = None     # 商户私钥 apiclient_key.pem，用于请求签名
    WX_PLATFORM_CERT_PATH: Optional[str] = None   # 微信支付平台证书，用于回调验签
    WX_NOTIFY_URL: Optional[str] = None           # 支付结果回调地址，必须是公网 HTTPS

    # 仅用于本地联调：开启后未配置微信支付也能免支付直接开通套餐。
    # 生产环境必须保持 False，否则用户可以零成本升级到付费套餐。
    PAYMENT_MOCK_ENABLED: bool = False

    # 仅用于本地联调：允许 "dev_" 前缀的假登录码，并允许在未配置微信凭据时
    # 静默放行登录。生产环境必须保持 False，否则任何人用 code="dev_任意值"
    # 即可绕过微信校验拿到 access_token。
    ALLOW_DEV_LOGIN: bool = False

    # 报表分享链接的对外域名（需与 H5 端的分享页部署域名一致）
    SHARE_BASE_URL: str = "https://app.piaoxiaozhu.com"

    # 内容安全（微信 imgSecCheck / msgSecCheck）：用户上传的票据图片、头像与
    # 昵称等 UGC 需过检测，提审要求项。关闭后上传链路不再调用微信接口。
    CONTENT_SECURITY_ENABLED: bool = True

    # 套餐到期提醒的订阅消息模板 id，在微信公众平台「订阅消息」中申请后填入。
    # 留空则不发送任何提醒（只记日志）——避免误用他人模板。
    # 模板的 keyword 名与字段类型须与 wx_subscribe.build_reminder_data 一致。
    WX_SUBSCRIBE_TEMPLATE_EXPIRE: Optional[str] = None

    # 默认值与 .env.example 保持一致，避免「没配环境变量」时静默指向另一个供应商
    LLM_BASE_URL: str = "https://apihub.agnes-ai.com/v1"
    LLM_API_KEY: str = ""
    LLM_MODEL_NAME: str = "agnes-2.0-flash"

    OSS_ACCESS_KEY_ID: Optional[str] = None
    OSS_ACCESS_KEY_SECRET: Optional[str] = None
    OSS_ENDPOINT: Optional[str] = None
    OSS_BUCKET_NAME: Optional[str] = None

    # 腾讯云 COS（与微信云托管同厂商，可走内网免流量费）。
    # 配了 COS_* 就优先走 COS，未配置则回落到 OSS，都未配置则落本地盘。
    COS_SECRET_ID: Optional[str] = None
    COS_SECRET_KEY: Optional[str] = None
    COS_REGION: Optional[str] = None        # 形如 ap-guangzhou
    COS_BUCKET_NAME: Optional[str] = None   # 形如 piaoxiaozhu-1250000000

    UPLOAD_DIR: str = "./uploads"

    # 管理后台访问令牌。为空时后台接口一律 403（默认关闭，避免裸奔）。
    # 生成方式：python -c "import secrets; print(secrets.token_urlsafe(32))"
    ADMIN_TOKEN: str = ""
    # 管理后台静态文件目录。默认指向仓库里的 apps/admin（容器内为 /app/admin）
    ADMIN_UI_DIR: str = "../apps/admin"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    def model_post_init(self, __context) -> None:
        # 生产环境绝不接受 SQLite 兜底。
        #
        # 这个校验必须放在配置加载时，而不是启动事件里：app/models/database.py
        # 在 import 阶段就 create_async_engine，比 startup 钩子更早执行。放到后面
        # 的话，生产库漏配 DATABASE_URL 时会先崩在 import（报
        # `No module named 'aiosqlite'` 的 100 行 traceback），真正的配置问题
        # 反而被埋掉。本地开发保留 SQLite 兜底，方便不装 PG 也能跑。
        if self.APP_ENV == "production" and self.DATABASE_URL.startswith("sqlite"):
            raise ValueError(
                "生产环境禁止使用 SQLite：DATABASE_URL 未配置或仍是 sqlite。\n"
                "容器/云托管里请在环境变量中显式设置，例如：\n"
                "  DATABASE_URL=postgresql+asyncpg://<user>:<pass>@<host>/<db>\n"
                "（注意驱动前缀是 postgresql+asyncpg，且不要在 URL 里带 ?sslmode= 参数）"
            )


settings = Settings()
