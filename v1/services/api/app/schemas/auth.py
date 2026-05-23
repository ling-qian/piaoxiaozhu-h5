from typing import Optional

from pydantic import BaseModel, Field


class WechatLoginRequest(BaseModel):
    code: str = Field(..., description="WeChat login code from wx.login()")


class WechatLoginResponse(BaseModel):
    access_token: str
    user: "UserBrief"


class UserBrief(BaseModel):
    id: str
    openid: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    plan_code: str = "free"

    model_config = {"from_attributes": True}


class BindPhoneRequest(BaseModel):
    phone_code: str = Field(..., description="WeChat getPhoneNumber code")


WechatLoginResponse.model_rebuild()
