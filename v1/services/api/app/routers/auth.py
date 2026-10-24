import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services import wechat_openapi
from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.auth import (
    WechatLoginRequest,
    WechatLoginResponse,
    UserBrief,
    BindPhoneRequest,
    PhoneLoginRequest,
)
from app.services.wx_security import get_access_token
from app.services.subscription import effective_plan_code

router = APIRouter(prefix="/api/auth", tags=["auth"])

logger = logging.getLogger(__name__)


def _create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _user_to_brief(user_obj: User) -> UserBrief:
    return UserBrief(
        id=str(user_obj.id),
        openid=user_obj.openid,
        nickname=user_obj.nickname,
        avatar_url=user_obj.avatar_url,
        phone=user_obj.phone,
        # 返回有效套餐而不是库里的原值：到期后仍会写回 free，
        # 前端不必再自行判断有效期，也避免两端口径不一致。
        plan_code=effective_plan_code(user_obj.plan_code, user_obj.plan_expires_at),
    )


async def _find_or_create_user(db: AsyncSession, openid: str, unionid: Optional[str] = None) -> User:
    result = await db.execute(select(User).where(User.openid == openid))
    user_obj = result.scalar_one_or_none()
    if user_obj is None:
        user_obj = User(openid=openid, unionid=unionid)
        db.add(user_obj)
        await db.commit()
        await db.refresh(user_obj)
        # 注册赠送积分。放在建号之后、同一请求内完成，失败也不阻断登录
        # （用户先能进来比拿不到赠分重要），但要记日志便于补发。
        try:
            from app.services.points import grant_signup_bonus

            await grant_signup_bonus(db, user_obj.id)
        except Exception as e:  # noqa: BLE001 - 赠分失败不应导致登录失败
            logger.error("新用户 %s 注册赠分失败: %s", user_obj.id, e)
    return user_obj


def _wechat_client():
    """访问微信接口的 HTTP 客户端。

    两个关键设置，都是踩过的坑：
    1. trust_env=False：容器里若注入了代理环境变量，httpx 会走一个不可用代理；
    2. local_address="0.0.0.0"：绑定 IPv4 通配地址，使底层只发起 IPv4 连接。
       微信部分接口对 IPv6 支持不完整（社区有明确故障案例），而云托管容器
       往往同时有 IPv6 出口，优先解析 AAAA 时会连不上——表现为「网络不通」。
    """
    from app.services.http_client import wechat_client

    return wechat_client(verify=settings.WX_TLS_VERIFY, timeout=20.0)


async def _wechat_code2session(code: str) -> dict:
    """拿 code 换 openid。

    这一步要出网调用 api.weixin.qq.com，是登录链路里唯一依赖外网的环节，
    因此网络/代理/非 JSON 响应都必须显式处理：否则任何异常都会变成
    500 Internal Server Error，前端只看到「登录失败」，排查时没有任何线索。
    """
    import httpx

    try:
        async with _wechat_client() as client:
            resp = await client.get(
                wechat_openapi.url("/sns/jscode2session", settings.WECHAT_OPENAPI_SIDECAR),
                params={
                    "appid": settings.WX_APPID,
                    "secret": settings.WX_SECRET,
                    "js_code": code,
                    "grant_type": "authorization_code",
                },
            )
        data = resp.json()
    except httpx.TimeoutException as e:
        # 超时与连不上是两种病：前者多半是出网慢，后者是路由/DNS/协议族问题。
        # 分开记，排查时不用再猜。
        logger.error("调用微信 jscode2session 超时(%s): %s", type(e).__name__, e)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="微信登录服务响应超时，请稍后重试",
        )
    except httpx.HTTPError as e:
        logger.error("调用微信 jscode2session 网络失败: %s: %s", type(e).__name__, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="微信登录服务网络不通，请稍后重试",
        )
    except ValueError:
        logger.error("微信返回了非 JSON 响应: %s", resp.text[:200])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="微信登录服务返回异常，请稍后重试",
        )

    if "errcode" in data and data["errcode"] != 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"WeChat API error: {data.get('errmsg', 'unknown')} (errcode={data.get('errcode')})",
        )
    if "openid" not in data:
        logger.error("微信未返回 openid，响应: %s", str(data)[:200])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="微信登录服务返回异常，请稍后重试",
        )
    return data


@router.post("/wechat/login", response_model=WechatLoginResponse)
async def wechat_login(body: WechatLoginRequest):
    code = body.code
    openid: Optional[str] = None
    unionid: Optional[str] = None

    if code.startswith("dev_"):
        # 联调专用假登录。此前该分支无条件放行，等于在生产环境开了一道后门：
        # 任何人提交 code="dev_任意值" 都能跳过微信校验换到 access_token。
        # 现在必须显式开启 ALLOW_DEV_LOGIN 才可用。
        if not settings.ALLOW_DEV_LOGIN:
            logger.warning("收到 dev_ 前缀的登录码但未开启联调开关，已拒绝")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="登录凭证非法",
            )
        openid = f"dev_openid_{code}"
        unionid = None
    elif not settings.WX_APPID or not settings.WX_SECRET:
        # 微信凭据缺失时不再静默生成假 openid（那等于关掉登录鉴权），
        # 改为显式失败，让配置缺失在部署阶段就暴露。
        logger.error("未配置 WX_APPID / WX_SECRET，无法向微信换取 openid")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="登录服务暂未开放",
        )
    else:
        data = await _wechat_code2session(code)
        openid = data["openid"]
        unionid = data.get("unionid")

    from app.models.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        user_obj = await _find_or_create_user(db, openid, unionid)
        user = _user_to_brief(user_obj)

    access_token = _create_access_token(user.id)
    return WechatLoginResponse(access_token=access_token, user=user)


# 微信手机号接口的错误码 → 可操作的中文提示。
# 前三个取自该接口文档自身的错误码表，其余来自通用错误码/实战。
_PHONE_ERRCODE_HINTS = {
    -1: "微信系统繁忙，请稍后重试",
    40013: "小程序 AppID 与获取 code 的小程序不一致，请检查 WX_APPID 是否配错",
    40029: "授权码已失效（有效期 5 分钟且只能用一次），请重新点击绑定",
    45011: "接口调用过于频繁（分钟级限额），请稍后再试",
    48001: "手机号快速验证能力未开通：请到小程序后台「开发管理 → 接口设置」申请后再试",
    40001: "微信凭据异常（access_token 无效），请稍后重试；持续失败请检查 WX_SECRET",
    40125: "微信凭据无效，请检查 WX_SECRET 是否与小程序后台一致",
    40163: "授权码已被使用，请重新点击绑定",
    45009: "接口调用过于频繁，请稍后再试",
}


async def _get_phone_by_code(phone_code: str, openid: Optional[str] = None) -> str:
    """用 getPhoneNumber 的 code 换手机号；失败抛带中文提示的 HTTPException。

    绑定与手机号登录共用这一条链路，避免两处各写一遍（错误码处理容易写歪）。
    """
    if not settings.WX_APPID or not settings.WX_SECRET:
        # 未配置微信凭据时不再写入占位号（历史问题：曾写 13800138000，用户以为绑上了）
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="手机号能力暂未开放（未配置微信凭据）",
        )

    import httpx

    # 走「开放接口服务」时，token 由容器内的旁加载代管，不需要自己取。
    access_token = None
    if not settings.WECHAT_OPENAPI_SIDECAR:
        access_token = await get_access_token()
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="获取微信 access_token 失败，请稍后重试",
            )

    # 官方文档里 openid 是可选参数，但传了会校验「code 与 openid 的绑定关系」，
    # 不匹配直接报错。这是一道免费的防串号校验，有 openid 就该带上。
    payload: dict = {"code": phone_code}
    if openid:
        payload["openid"] = openid

    async with _wechat_client() as client:
        resp = await client.post(
            wechat_openapi.url("/wxa/business/getuserphonenumber", settings.WECHAT_OPENAPI_SIDECAR),
            # 旁加载模式下不能再带 access_token：带了会被原样透传，可能与代管的凭证冲突
            params={"access_token": access_token} if access_token else {},
            json=payload,
        )
        data = resp.json()

    errcode = data.get("errcode", 0)
    if errcode != 0:
        # 把 errcode 打进日志与提示，才能区分「频控(45011)」和「授权码失效(40029)」
        logger.warning("手机号获取失败 errcode=%s errmsg=%s", errcode, data.get("errmsg"))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_PHONE_ERRCODE_HINTS.get(errcode, f"获取手机号失败（errcode={errcode}）"),
        )

    info = data.get("phone_info") or {}
    # phoneNumber 是带区号的完整号码，purePhoneNumber 是纯号码；两者取其一兜底
    phone = info.get("phoneNumber") or info.get("purePhoneNumber")
    if not phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="微信未返回手机号，请重试",
        )
    return phone


@router.post("/wechat/bind-phone")
async def wechat_bind_phone(
    body: BindPhoneRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    phone = await _get_phone_by_code(body.phone_code, current_user.openid)

    # 手机号是账号的第二身份（库里有唯一索引兜底），这里先给友好提示：
    # 该号码已属于另一个账号时不能静默覆盖，否则会造出两个同号账号，
    # 后续按手机号统计/找回都会错乱。
    existing = await db.execute(
        select(User).where(User.phone == phone, User.id != current_user.id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该手机号已绑定其他账号。如需合并账号数据请联系客服。",
        )

    current_user.phone = phone
    await db.commit()
    logger.info("用户 %s 绑定手机号成功", current_user.id)

    return {"phone": phone, "bound": True}


@router.post("/wechat/phone-login", response_model=WechatLoginResponse)
async def wechat_phone_login(body: PhoneLoginRequest):
    """手机号登录/找回。

    场景：用户换了微信号（openid 变了），静默登录会得到一个空白新账号，
    此时用手机号回到原账号。找不到账号时明确提示先绑定，而不是凭空建号。
    """
    phone = await _get_phone_by_code(body.phone_code)

    from app.models.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.phone == phone))
        user_obj = result.scalar_one_or_none()
        if user_obj is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="该手机号还没有绑定过账号，请先在「我的 → 编辑资料」里绑定手机号",
            )
        user = _user_to_brief(user_obj)

    logger.info("用户 %s 通过手机号登录", user.id)
    return WechatLoginResponse(access_token=_create_access_token(user.id), user=user)
