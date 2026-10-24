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


class PhoneLoginRequest(BaseModel):
    """手机号登录/找回：用 getPhoneNumber 的 code 换手机号，再按手机号定位账号。"""

    phone_code: str = Field(..., description="WeChat getPhoneNumber code")


class UserUpdate(BaseModel):
    """昵称/头像更新入参。

    必须显式声明类型：之前用裸 dict 接收，传数字会在写库时抛 asyncpg
    DataError 变成 500，传超长值也会撞上列长度限制。
    """

    nickname: Optional[str] = Field(None, max_length=64)
    avatar_url: Optional[str] = Field(None, max_length=512)


WechatLoginResponse.model_rebuild()
