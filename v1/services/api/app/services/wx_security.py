"""微信内容安全接口封装。

提审要求：小程序内的用户生成内容（票据图片、头像、昵称）需经过微信内容安全检测。
这里封装两个同步接口，并把 access_token 做成进程内缓存（微信侧对该接口有频次限制，
每次都重新取 token 会很快打满）。

- 图片：POST /wxa/img_sec_check   （multipart，单图需 ≤1MB）
- 文本：POST /wxa/msg_sec_check   （JSON，v2 需 openid + scene）

设计原则：**内容安全不能成为主流程的单点故障**。凭据缺失、网络异常、接口报错
一律只记日志并按「放行」返回（SKIPPED）；只有微信明确判定违规（errcode=87014
或 suggest=risky/review）才返回 RISKY 由调用方拒绝。是否启用由
CONTENT_SECURITY_ENABLED 开关控制。
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional

import httpx

from app.config import settings

from app.services.http_client import wechat_client

logger = logging.getLogger(__name__)

# 地址改为运行时按「是否启用开放接口服务」拼接：
# 云托管里走公网可能连不上，开了旁加载就改走内网 http（见 services/wechat_openapi.py）
def _url(path: str) -> str:
    from app.services.wechat_openapi import url as _build

    return _build(path, settings.WECHAT_OPENAPI_SIDECAR)


TOKEN_URL = "/cgi-bin/token"
IMG_CHECK_URL = "/wxa/img_sec_check"
MSG_CHECK_URL = "/wxa/msg_sec_check"

# 微信侧唯一代表「判定违规」的业务错误码
ERRCODE_RISKY = 87014

# img_sec_check 对单张图片有 1MB 上限
IMG_CHECK_MAX_BYTES = 1024 * 1024

# 提前 5 分钟刷新，避免边界时刻取到刚过期的 token
TOKEN_EARLY_REFRESH_SECONDS = 300


class CheckStatus(str, Enum):
    OK = "ok"            # 检测通过
    RISKY = "risky"      # 微信判定违规，调用方应拒绝
    SKIPPED = "skipped"  # 未检测（未启用 / 无凭据 / 接口异常 / 图片无法处理）


@dataclass
class CheckResult:
    status: CheckStatus
    reason: str = ""

    @property
    def rejected(self) -> bool:
        return self.status is CheckStatus.RISKY


_token_cache: dict = {"value": None, "expire_at": 0.0}


async def get_access_token() -> Optional[str]:
    """取小程序 access_token（进程内缓存）。取不到返回 None，不抛异常。

    开启「开放接口服务」后由容器旁加载代管凭证，这里直接返回 None，
    调用方据此不带 token 参数——带上反而可能与环境共享的归属冲突。

    公开而非私有：订阅消息（wx_subscribe）也用它，两个模块共用同一份缓存，
    否则同一进程内会各自持有一份 token、互相把额度打满。
    """
    if settings.WECHAT_OPENAPI_SIDECAR:
        return None

    now = time.time()
    cached = _token_cache.get("value")
    if cached and _token_cache.get("expire_at", 0) > now:
        return cached

    if not settings.WX_APPID or not settings.WX_SECRET:
        return None

    try:
        async with wechat_client(verify=settings.WX_TLS_VERIFY, timeout=10.0) as client:
            resp = await client.get(
                _url(TOKEN_URL),
                params={
                    "grant_type": "client_credential",
                    "appid": settings.WX_APPID,
                    "secret": settings.WX_SECRET,
                },
            )
            data = resp.json()
    except Exception as e:
        logger.warning("获取微信 access_token 失败: %s", e)
        return None

    token = data.get("access_token")
    if not token:
        logger.warning(
            "获取微信 access_token 返回异常: errcode=%s errmsg=%s",
            data.get("errcode"),
            data.get("errmsg"),
        )
        return None

    expires_in = int(data.get("expires_in") or 7200)
    _token_cache["value"] = token
    _token_cache["expire_at"] = now + max(expires_in - TOKEN_EARLY_REFRESH_SECONDS, 60)
    return token


def _shrink_image_sync(content: bytes) -> Optional[bytes]:
    """把超过 1MB 的图片压到上限内；无法解码（如 HEIC）时返回 None。

    用 OpenCV 而非 Pillow：它已在 requirements 里显式声明，且能处理更多编码。
    """
    try:
        import cv2
        import numpy as np
    except Exception as e:
        logger.warning("图片压缩依赖不可用: %s", e)
        return None

    try:
        buf = np.frombuffer(content, dtype=np.uint8)
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if img is None:
            return None

        height, width = img.shape[:2]
        longest = max(height, width)
        if longest > 1600:
            scale = 1600 / longest
            img = cv2.resize(
                img, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA
            )

        for quality in (80, 60, 40):
            ok, encoded = cv2.imencode(
                ".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), quality]
            )
            if ok and len(encoded.tobytes()) <= IMG_CHECK_MAX_BYTES:
                return encoded.tobytes()
    except Exception as e:
        logger.warning("图片压缩失败: %s", e)

    return None


async def check_image(content: bytes) -> CheckResult:
    """图片内容安全检查。"""
    if not settings.CONTENT_SECURITY_ENABLED:
        return CheckResult(CheckStatus.SKIPPED, "内容安全未启用")

    token = await get_access_token()
    # 旁加载模式下 token 恒为 None（由容器代管），此时应当继续调用而不是跳过检测，
    # 否则内容安全会被静默关闭——审核通过后才发现，代价更大。
    if not token and not settings.WECHAT_OPENAPI_SIDECAR:
        return CheckResult(CheckStatus.SKIPPED, "微信凭据不可用")

    payload = content
    if len(payload) > IMG_CHECK_MAX_BYTES:
        # 压缩是 CPU 密集操作，放到线程里避免阻塞事件循环
        shrunk = await asyncio.to_thread(_shrink_image_sync, content)
        if shrunk is None:
            return CheckResult(CheckStatus.SKIPPED, "图片超过 1MB 且无法压缩")
        payload = shrunk

    try:
        async with wechat_client(verify=settings.WX_TLS_VERIFY, timeout=15.0) as client:
            resp = await client.post(
                IMG_CHECK_URL,
                params={"access_token": token},
                files={"media": ("invoice.jpg", payload, "image/jpeg")},
            )
            data = resp.json()
    except Exception as e:
        logger.warning("图片内容安全检查调用失败: %s", e)
        return CheckResult(CheckStatus.SKIPPED, "接口异常")

    errcode = data.get("errcode")
    if errcode == 0:
        return CheckResult(CheckStatus.OK)
    if errcode == ERRCODE_RISKY:
        return CheckResult(CheckStatus.RISKY, "图片包含违规内容")

    logger.warning(
        "图片内容安全检查返回非预期结果: errcode=%s errmsg=%s",
        errcode,
        data.get("errmsg"),
    )
    return CheckResult(CheckStatus.SKIPPED, f"errcode={errcode}")


async def check_text(content: str, openid: Optional[str] = None) -> CheckResult:
    """文本内容安全检查（昵称、商户名等用户手填内容）。"""
    text = (content or "").strip()
    if not text:
        return CheckResult(CheckStatus.OK)

    if not settings.CONTENT_SECURITY_ENABLED:
        return CheckResult(CheckStatus.SKIPPED, "内容安全未启用")

    token = await get_access_token()
    # 旁加载模式下 token 恒为 None（由容器代管），此时应当继续调用而不是跳过检测，
    # 否则内容安全会被静默关闭——审核通过后才发现，代价更大。
    if not token and not settings.WECHAT_OPENAPI_SIDECAR:
        return CheckResult(CheckStatus.SKIPPED, "微信凭据不可用")

    body = {
        "content": text,
        "version": 2,
        "scene": 2,  # 2 = 资料（昵称等）
        "openid": openid or "",
    }

    try:
        async with wechat_client(verify=settings.WX_TLS_VERIFY, timeout=10.0) as client:
            resp = await client.post(
                _url(MSG_CHECK_URL), params={"access_token": token} if token else {}, json=body
            )
            data = resp.json()
    except Exception as e:
        logger.warning("文本内容安全检查调用失败: %s", e)
        return CheckResult(CheckStatus.SKIPPED, "接口异常")

    errcode = data.get("errcode")
    if errcode == ERRCODE_RISKY:
        return CheckResult(CheckStatus.RISKY, "文本包含违规内容")

    suggest = (data.get("result") or {}).get("suggest")
    if errcode == 0 and suggest in ("pass", None):
        return CheckResult(CheckStatus.OK)
    if suggest in ("risky", "review"):
        # review 表示需人工复核，作为审核场景按不放行处理更安全
        return CheckResult(CheckStatus.RISKY, f"suggest={suggest}")

    logger.warning(
        "文本内容安全检查返回非预期结果: errcode=%s errmsg=%s suggest=%s",
        errcode,
        data.get("errmsg"),
        suggest,
    )
    return CheckResult(CheckStatus.SKIPPED, f"errcode={errcode}")
