from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.database import AsyncSessionLocal
from app.models.user import User
from app.schemas.auth import WechatLoginRequest, WechatLoginResponse, UserBrief, BindPhoneRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
        plan_code=user_obj.plan_code,
    )


async def _find_or_create_user(db: AsyncSession, openid: str, unionid: Optional[str] = None) -> User:
    result = await db.execute(select(User).where(User.openid == openid))
    user_obj = result.scalar_one_or_none()
    if user_obj is None:
        user_obj = User(openid=openid, unionid=unionid)
        db.add(user_obj)
        await db.commit()
        await db.refresh(user_obj)
    return user_obj


@router.post("/wechat/login", response_model=WechatLoginResponse)
async def wechat_login(body: WechatLoginRequest):
    code = body.code
    openid: Optional[str] = None
    unionid: Optional[str] = None

    if settings.WX_APPID:
        import httpx

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.weixin.qq.com/sns/jscode2session",
                params={
                    "appid": settings.WX_APPID,
                    "secret": settings.WX_SECRET,
                    "js_code": code,
                    "grant_type": "authorization_code",
                },
            )
            data = resp.json()
            if "errcode" in data and data["errcode"] != 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"WeChat API error: {data.get('errmsg', 'unknown')}",
                )
            openid = data["openid"]
            unionid = data.get("unionid")
    else:
        openid = f"dev_openid_{code}"

    async with AsyncSessionLocal() as db:
        user_obj = await _find_or_create_user(db, openid, unionid)
        user = _user_to_brief(user_obj)

    access_token = _create_access_token(user.id)
    return WechatLoginResponse(access_token=access_token, user=user)


@router.post("/wechat/bind-phone")
async def wechat_bind_phone(body: BindPhoneRequest):
    if not settings.WX_APPID:
        phone = "13800138000"
        async with AsyncSessionLocal() as db:
            current_user.phone = phone
            await db.commit()
        return {"phone": phone, "bound": True}

    import httpx

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.weixin.qq.com/cgi-bin/token",
            params={"grant_type": "client_credential", "appid": settings.WX_APPID, "secret": settings.WX_SECRET},
        )
        token_data = resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to get WeChat access token")

        phone_resp = await client.post(
            "https://api.weixin.qq.com/wxa/business/getuserphonenumber",
            params={"access_token": access_token},
            json={"code": body.phone_code},
        )
        phone_data = phone_resp.json()
        if phone_data.get("errcode", 0) != 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to get phone number")

    phone = phone_data["phone_info"]["phoneNumber"]
    if current_user:
        async with AsyncSessionLocal() as db:
            current_user.phone = phone
            await db.commit()

    return {"phone": phone, "bound": True}
