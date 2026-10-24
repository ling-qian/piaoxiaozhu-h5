"""微信订阅消息（小程序一次性订阅）发送封装。

用途：套餐到期前提醒用户续费。小程序端必须先让用户点一次授权
（`wx.requestSubscribeMessage({tmplIds: [模板 id]})`），拿到授权后才能发一次；
未授权时微信返回 errcode=43101，属于预期结果，不是故障。

设计原则与 wx_security.py 一致：**提醒失败不能影响主流程**。本模块只被 Celery
定时任务调用，任何异常都收敛成返回值 + 日志，不向上抛。

模板依赖：模板需在微信公众平台「订阅消息」中申请，审核通过后把模板 id 填到
settings.WX_SUBSCRIBE_TEMPLATE_EXPIRE。**未配置模板时一律不发送**，只记日志——
否则会误用他人模板或向微信发无效请求。
"""

from __future__ import annotations

import logging
from datetime import datetime

import httpx

from app.config import settings
from app.services.wx_security import get_access_token

from app.services.http_client import wechat_client

logger = logging.getLogger(__name__)

SUBSCRIBE_SEND_URL = "https://api.weixin.qq.com/cgi-bin/message/subscribe/send"

# 用户未授权 / 已拒绝接受该模板消息。属预期结果，重试也没有意义。
ERRCODE_USER_REFUSED = 43101

# 提醒点开后跳转的页面
REMIND_PAGE = "pages/member/index"

# 发送结果
STATUS_SENT = "sent"
STATUS_SKIPPED = "skipped"  # 未配置模板 / 用户未授权等，未真正发送
STATUS_FAILED = "failed"


def build_reminder_data(
    plan_name: str, expires_at: datetime, days_left: int
) -> dict:
    """组装订阅消息的 data。

    ⚠️ keyword 名（thing1 / date2 / number3）与字段类型必须与微信后台**审批通过的
    模板**一致，模板未申请下来之前无法验证。申请后请对照后台模板详情修改此处。
    当前取值是最常见的「套餐名称 + 到期日期 + 剩余天数」组合。
    """
    return {
        # thing 类型限 20 个字符以内
        "thing1": {"value": (plan_name or "付费套餐")[:20]},
        "date2": {"value": expires_at.strftime("%Y-%m-%d")},
        # number 类型只接受数字
        "number3": {"value": str(max(days_left, 0))},
    }


async def send_expiry_reminder(
    openid: str,
    *,
    plan_name: str,
    expires_at: datetime,
    days_left: int,
    page: str = REMIND_PAGE,
) -> str:
    """发送一条到期提醒，返回 STATUS_SENT / STATUS_SKIPPED / STATUS_FAILED。"""
    template_id = settings.WX_SUBSCRIBE_TEMPLATE_EXPIRE
    if not template_id:
        # 没配模板就不发。这样上线时不会因为忘配置而向微信打无效请求。
        logger.info("未配置订阅消息模板，跳过到期提醒: openid=%s", openid)
        return STATUS_SKIPPED

    token = await get_access_token()
    if not token:
        logger.warning("微信凭据不可用，到期提醒未发送: openid=%s", openid)
        return STATUS_SKIPPED

    body = {
        "touser": openid,
        "template_id": template_id,
        "page": page,
        "data": build_reminder_data(plan_name, expires_at, days_left),
    }

    try:
        async with wechat_client(verify=settings.WX_TLS_VERIFY, timeout=10.0) as client:
            resp = await client.post(
                SUBSCRIBE_SEND_URL, params={"access_token": token}, json=body
            )
            data = resp.json()
    except Exception as e:
        logger.warning("订阅消息发送失败（网络异常）: openid=%s err=%s", openid, e)
        return STATUS_FAILED

    errcode = data.get("errcode")
    if errcode == 0:
        return STATUS_SENT

    if errcode == ERRCODE_USER_REFUSED:
        # 用户没授权或已拒绝。调用方仍应记录「已提醒」档位，否则会天天重试。
        logger.info("用户未授权订阅消息，本次提醒跳过: openid=%s", openid)
        return STATUS_SKIPPED

    logger.warning(
        "订阅消息发送返回异常: openid=%s errcode=%s errmsg=%s",
        openid,
        errcode,
        data.get("errmsg"),
    )
    # 模板 id 无效、access_token 失效等需要人工排查，归为 failed 便于统计
    return STATUS_FAILED
