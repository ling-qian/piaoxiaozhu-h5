from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# --------------------------------------------------------------------------- 引擎
# Neon 的「连接池地址」是 PgBouncer（transaction 模式）。它不支持服务端预编译语句，
# 而 asyncpg 默认会缓存 prepared statement ⇒ 并发稍高就会报
#   prepared statement "__asyncpg_stmt_1__" already exists
# 所以走 Neon 时必须关掉 statement cache；本地 PG 保持默认（性能更好）。
_is_neon = "neon.tech" in settings.DATABASE_URL


def async_connect_args(url: str) -> dict:
    """asyncpg 的 SSL 开关是 `ssl=`，不是 URL 里的 `sslmode=`。

    SQLAlchemy 会把 URL 查询参数原样当成 connect() 的 kwargs，
    写 `?sslmode=require` 会直接 TypeError。所以 URL 保持干净，
    SSL 与 statement cache 都在这里显式传。
    alembic/env.py 也复用这个函数。
    """
    if "neon.tech" not in url:
        return {}
    return {
        "ssl": "require",                  # Neon 强制 TLS
        "statement_cache_size": 0,          # PgBouncer 不支持预编译语句
        "prepared_statement_cache_size": 0,
    }


_connect_args = async_connect_args(settings.DATABASE_URL)

# 免费层/小规格实例连接数有限，应用侧池子不必开太大：
# 20+10 的池子在多副本下会迅速吃满数据库连接上限。
#
# pool_pre_ping 在跨地域链路上代价很高：每取一次连接就多一个往返，
# 实测（中国 → 新加坡 RTT≈240ms）每个请求白加 0.4 秒。
# 改用 pool_recycle=240（小于 Neon 的 5 分钟休眠阈值）：连接在被挂起前主动回收，
# 既不付探活的往返，也不会拿到休眠后的死连接。
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=5 if _is_neon else 20,
    max_overflow=5 if _is_neon else 10,
    pool_pre_ping=not _is_neon,
    pool_recycle=240 if _is_neon else -1,
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass
