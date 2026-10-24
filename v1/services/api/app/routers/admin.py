"""管理后台接口（只读）。

设计取舍：
- **只读**，不提供改数据的能力——后台的破坏力要最小，改数据走脚本/控制台。
- **单令牌鉴权**：请求头 `X-Admin-Token` 与 `ADMIN_TOKEN` 比对。为空时全部 403，
  默认关闭，避免部署时忘了配就直接裸奔。
- 分页统一 `page`（从 1 开始）+ `size`（上限 100），返回 `total` 便于前端算页数。
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_db
from app.models.plan import Order, QuotaLog
from app.models.invoice import InvoiceRecord
from app.models.project import Project
from app.models.user import User

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def require_admin(x_admin_token: Optional[str] = Header(default=None)) -> None:
    """校验管理令牌。未配置 ADMIN_TOKEN 时一律拒绝（默认关闭）。"""
    if not settings.ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="管理后台未启用：请在 .env 配置 ADMIN_TOKEN",
        )
    if not x_admin_token or x_admin_token != settings.ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="管理令牌无效"
        )


def mask_phone(phone: Optional[str]) -> Optional[str]:
    if not phone or len(phone) < 7:
        return phone
    return f"{phone[:3]}****{phone[-4:]}"


def _page_args(page: int, size: int) -> tuple[int, int]:
    page = max(page, 1)
    size = min(max(size, 1), 100)
    return size, (page - 1) * size


@router.get("/overview", dependencies=[Depends(require_admin)])
async def overview(db: AsyncSession = Depends(get_db)):
    """首屏概览：用户/订单/金额/记录/积分五个口径。"""
    user_total = await db.scalar(select(func.count()).select_from(User))
    user_today = await db.scalar(
        select(func.count()).select_from(User).where(User.created_at >= func.current_date())
    )
    order_total = await db.scalar(select(func.count()).select_from(Order))
    order_paid = await db.scalar(
        select(func.count()).select_from(Order).where(Order.status == "paid")
    )
    revenue = await db.scalar(
        select(func.coalesce(func.sum(Order.amount_cents), 0)).where(Order.status == "paid")
    )
    record_total = await db.scalar(select(func.count()).select_from(InvoiceRecord))
    project_total = await db.scalar(select(func.count()).select_from(Project))
    points_issued = await db.scalar(
        select(func.coalesce(func.sum(QuotaLog.delta), 0)).where(QuotaLog.delta > 0)
    )
    points_used = await db.scalar(
        select(func.coalesce(func.sum(QuotaLog.delta), 0)).where(QuotaLog.delta < 0)
    )

    return {
        "users": {"total": user_total, "today": user_today},
        "orders": {"total": order_total, "paid": order_paid},
        "revenue_cents": revenue,
        "records": record_total,
        "projects": project_total,
        "points": {"issued": points_issued, "used": abs(points_used or 0)},
    }


@router.get("/users", dependencies=[Depends(require_admin)])
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    plan: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """用户列表，附积分余额（实时从流水求和，不读冗余列）。"""
    limit, offset = _page_args(page, size)

    balance = (
        select(
            QuotaLog.user_id.label("uid"),
            func.coalesce(func.sum(QuotaLog.delta), 0).label("balance"),
        )
        .group_by(QuotaLog.user_id)
        .subquery()
    )

    stmt = (
        select(User, func.coalesce(balance.c.balance, 0).label("balance"))
        .outerjoin(balance, balance.c.uid == User.id)
        .order_by(User.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    count_stmt = select(func.count()).select_from(User)

    if keyword:
        kw = f"%{keyword.strip()}%"
        cond = or_(User.nickname.ilike(kw), User.phone.ilike(kw), User.openid.ilike(kw))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if plan:
        stmt = stmt.where(User.plan_code == plan)
        count_stmt = count_stmt.where(User.plan_code == plan)

    rows = (await db.execute(stmt)).all()
    total = await db.scalar(count_stmt)

    return {
        "total": total,
        "page": page,
        "items": [
            {
                "id": str(u.id),
                "nickname": u.nickname,
                "phone": mask_phone(u.phone),
                "plan_code": u.plan_code,
                "plan_expires_at": u.plan_expires_at.isoformat() if u.plan_expires_at else None,
                "points_balance": bal,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u, bal in rows
        ],
    }


@router.get("/orders", dependencies=[Depends(require_admin)])
async def list_orders(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    order_status: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
):
    """订单列表，带下单用户信息（手机号打码）。"""
    limit, offset = _page_args(page, size)

    stmt = (
        select(Order, User.nickname, User.phone)
        .outerjoin(User, User.id == Order.user_id)
        .order_by(Order.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    count_stmt = select(func.count()).select_from(Order)
    if order_status:
        stmt = stmt.where(Order.status == order_status)
        count_stmt = count_stmt.where(Order.status == order_status)

    rows = (await db.execute(stmt)).all()
    total = await db.scalar(count_stmt)

    return {
        "total": total,
        "page": page,
        "items": [
            {
                "id": str(o.id),
                "plan_code": o.plan_code,
                "amount_cents": o.amount_cents,
                "period_months": o.period_months,
                "status": o.status,
                "user_nickname": nickname,
                "user_phone": mask_phone(phone),
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "paid_at": o.paid_at.isoformat() if o.paid_at else None,
            }
            for o, nickname, phone in rows
        ],
    }


@router.get("/points", dependencies=[Depends(require_admin)])
async def list_points(
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """积分流水查询：按动作类型或用户过滤。"""
    limit, offset = _page_args(page, size)

    stmt = (
        select(QuotaLog, User.nickname, User.phone)
        .outerjoin(User, User.id == QuotaLog.user_id)
        .order_by(QuotaLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    count_stmt = select(func.count()).select_from(QuotaLog)

    if action:
        stmt = stmt.where(QuotaLog.action == action)
        count_stmt = count_stmt.where(QuotaLog.action == action)
    if user_id:
        stmt = stmt.where(QuotaLog.user_id == user_id)
        count_stmt = count_stmt.where(QuotaLog.user_id == user_id)

    rows = (await db.execute(stmt)).all()
    total = await db.scalar(count_stmt)

    available_actions = (
        await db.execute(select(QuotaLog.action).distinct().order_by(QuotaLog.action))
    ).scalars().all()

    return {
        "total": total,
        "page": page,
        "actions": list(available_actions),
        "items": [
            {
                "id": str(log.id),
                "user_nickname": nickname,
                "user_phone": mask_phone(phone),
                "user_id": str(log.user_id),
                "action": log.action,
                "delta": log.delta,
                "reason": log.reason,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log, nickname, phone in rows
        ],
    }


# --------------------------------------------------------------------------- 出网诊断

@router.get("/diagnostics/egress")
async def diagnostics_egress(dependencies=[Depends(require_admin)]):
    """诊断容器的出网能力，逐个环节给出结论。

    为什么需要它：登录失败的报错只有「网络不通」四个字，
    但病因可能是 DNS 解析失败、TCP 连不上、协议族不对、或者 TSL 握手失败。
    从外部只能看到 502，看不到是哪一步断的。这个接口把每一环单独测一遍，
    一次部署就能定位，不用反复猜。

    使用：带上 X-Admin-Token 请求本接口。
    """
    import socket
    import ssl
    import time

    import httpx

    targets = ["api.weixin.qq.com", "apihub.agnes-ai.com"]
    out: dict = {"dns": {}, "tcp": {}, "https": {}, "env": {}}

    # 1) DNS：分别看 A / AAAA
    for host in targets:
        entry: dict = {}
        for family, label in ((socket.AF_INET, "ipv4"), (socket.AF_INET6, "ipv6")):
            t0 = time.perf_counter()
            try:
                infos = socket.getaddrinfo(host, 443, family, socket.SOCK_STREAM)
                entry[label] = {
                    "ok": True,
                    "addrs": sorted({i[4][0] for i in infos}),
                    "ms": round((time.perf_counter() - t0) * 1000, 1),
                }
            except Exception as e:
                entry[label] = {
                    "ok": False,
                    "error": f"{type(e).__name__}: {e}",
                    "ms": round((time.perf_counter() - t0) * 1000, 1),
                }
        out["dns"][host] = entry

    # 2) TCP 直连（IPv4），单独看端口通不通
    for host in targets:
        t0 = time.perf_counter()
        try:
            infos = socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)
            addr = infos[0][4][0]
            with socket.create_connection((addr, 443), timeout=8):
                out["tcp"][host] = {"ok": True, "addr": addr,
                                    "ms": round((time.perf_counter() - t0) * 1000, 1)}
        except Exception as e:
            out["tcp"][host] = {"ok": False, "error": f"{type(e).__name__}: {e}",
                                "ms": round((time.perf_counter() - t0) * 1000, 1)}

    # 3) 完整 HTTPS 请求（绕开代理 + 强制 IPv4，与线上登录同一条路径）
    for host in targets:
        url = f"https://{host}/" if host != "api.weixin.qq.com" else \
              "https://api.weixin.qq.com/sns/jscode2session?appid=x&secret=x&js_code=x&grant_type=authorization_code"
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(
                timeout=15.0,
                trust_env=False,
                transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"),
            ) as client:
                r = await client.get(url)
            out["https"][host] = {
                "ok": True, "status": r.status_code,
                "body_head": r.text[:120],
                "ms": round((time.perf_counter() - t0) * 1000, 1),
            }
        except Exception as e:
            out["https"][host] = {"ok": False, "error": f"{type(e).__name__}: {e}",
                                  "ms": round((time.perf_counter() - t0) * 1000, 1)}

    # 4) 环境变量：代理类变量会干扰出网，列出来便于核对
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
                "http_proxy", "https_proxy", "no_proxy"):
        if key in __import__("os").environ:
            out["env"][key] = __import__("os").environ[key]

    out["summary"] = _summarize_egress(out, "api.weixin.qq.com")
    return out


def _summarize_egress(out: dict, host: str) -> str:
    """把四步结果翻译成一句人话，避免对着 JSON 猜。"""
    dns4 = out["dns"].get(host, {}).get("ipv4", {})
    dns6 = out["dns"].get(host, {}).get("ipv6", {})
    tcp = out["tcp"].get(host, {})
    https = out["https"].get(host, {})

    if not dns4.get("ok") and not dns6.get("ok"):
        return f"{host} 域名解析失败：容器内 DNS 不可用，需要检查云托管网络配置"
    if not tcp.get("ok"):
        return f"{host} 解析成功（{dns4.get('addrs', [])[:1]}）但 443 端口连不上：出网被拦或目标不可达"
    if not https.get("ok"):
        return f"{host} 端口通但 HTTPS 请求失败：可能是 TLS 握手或应用层问题"
    return f"{host} 完全可达（{https.get('ms')}ms）——若登录仍失败，问题在业务参数（appid/secret）"
