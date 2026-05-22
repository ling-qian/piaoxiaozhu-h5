from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from jose import jwt

from app.config import settings
from app.schemas.auth import WechatLoginRequest, WechatLoginResponse, UserBrief, BindPhoneRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])

MOCK_USER = UserBrief(
    id="00000000-0000-0000-0000-000000000001",
    openid="mock_openid_123456",
    nickname="测试用户",
    avatar_url="https://thirdwx.qlogo.cn/mmopen/vi_32/mock/132",
    phone=None,
    plan_code="free",
)


def _create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


@router.post("/wechat/login", response_model=WechatLoginResponse)
async def wechat_login(body: WechatLoginRequest):
    code = body.code

    if not settings.WX_APPID:
        openid = f"mock_openid_{code}"
        user = MOCK_USER.model_copy(update={"openid": openid})
    else:
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

        from sqlalchemy import select
        from app.models.database import AsyncSessionLocal
        from app.models.user import User

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.openid == openid))
            user_obj = result.scalar_one_or_none()
            if user_obj is None:
                user_obj = User(openid=openid, unionid=unionid)
                db.add(user_obj)
                await db.commit()
                await db.refresh(user_obj)
            user = UserBrief(
                id=str(user_obj.id),
                openid=user_obj.openid,
                nickname=user_obj.nickname,
                avatar_url=user_obj.avatar_url,
                phone=user_obj.phone,
                plan_code=user_obj.plan_code,
            )

    access_token = _create_access_token(user.id)
    return WechatLoginResponse(access_token=access_token, user=user)


@router.post("/wechat/bind-phone")
async def wechat_bind_phone(body: BindPhoneRequest):
    if not settings.WX_APPID:
        return {"phone": "13800138000", "bound": True}

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

    return {"phone": phone_data["phone_info"]["phoneNumber"], "bound": True}
