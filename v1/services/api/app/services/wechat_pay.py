"""微信支付 V3 接口封装：下单、小程序调起支付签名、回调验签与解密。

V3 与 V2 的关键差异（原实现把两者混用了，是修复的重点）：
1. 请求体和回调体都是 JSON，V2 才使用 XML；
2. 回调必须校验 Wechatpay-Signature 签名头，否则任何人都能伪造请求开通套餐；
3. 回调 resource 字段用 AEAD_AES_256_GCM 加密，必须用 APIv3 密钥解密。
"""

import base64
import json
import time
import uuid
from typing import Any, Mapping, Optional

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.x509 import load_pem_x509_certificate

from app.services.http_client import wechat_client
from app.config import settings

WECHAT_PAY_HOST = "https://api.mch.weixin.qq.com"
JSAPI_PREPAY_PATH = "/v3/pay/transactions/jsapi"

# 回调时间戳容忍偏差，用于抵御重放攻击
NOTIFY_MAX_SKEW_SECONDS = 300

# APIv3 密钥长度固定为 32 字节
APIV3_KEY_LENGTH = 32


class WeChatPayError(Exception):
    """微信支付接口调用或验签失败"""


def _load_pem(value: str) -> bytes:
    """兼容传入 PEM 内容或文件路径"""
    if not value:
        raise WeChatPayError("证书/密钥配置为空")
    if "-----BEGIN" in value:
        return value.encode("utf-8")
    try:
        with open(value, "rb") as f:
            return f.read()
    except OSError as e:
        # 包装成 WeChatPayError，否则 FileNotFoundError 会绕过上层 except 变成 500
        raise WeChatPayError(f"无法读取证书/密钥文件: {value}") from e


def _load_private_key(value: str):
    try:
        return serialization.load_pem_private_key(_load_pem(value), password=None)
    except ValueError as e:
        raise WeChatPayError("商户私钥格式非法，需为 PEM 格式的 RSA 私钥") from e


def _load_platform_public_key(value: str):
    """平台证书可能是 X.509 证书，也可能是裸公钥，两种都支持"""
    pem = _load_pem(value)
    try:
        if b"-----BEGIN CERTIFICATE-----" in pem:
            return load_pem_x509_certificate(pem).public_key()
        return serialization.load_pem_public_key(pem)
    except ValueError as e:
        raise WeChatPayError("微信支付平台证书格式非法，需为 PEM 格式证书或公钥") from e


def validate_credentials(
    *,
    private_key_value: str,
    platform_cert_value: str,
    apiv3_key: str,
) -> None:
    """体检商户凭证：APIv3 密钥长度、私钥与平台证书能否真正加载。

    只判断环境变量非空是不够的——路径写错、密钥长度不对，都要等用户
    付款后才暴露（下单签名失败，或回调验签失败而钱已扣）。在发起支付前
    调用本函数，可以把问题提前到部署阶段。任一环节不通过抛 WeChatPayError。
    """
    key_bytes = len(apiv3_key.encode("utf-8"))
    if key_bytes != APIV3_KEY_LENGTH:
        raise WeChatPayError(
            f"APIv3 密钥必须为 {APIV3_KEY_LENGTH} 字节，当前为 {key_bytes} 字节"
        )

    _load_private_key(private_key_value)
    _load_platform_public_key(platform_cert_value)


def sign_message(private_key_pem: str, message: str) -> str:
    """用商户私钥做 SHA256-RSA 签名并 base64 编码"""
    signature = _load_private_key(private_key_pem).sign(
        message.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256()
    )
    return base64.b64encode(signature).decode("utf-8")


def build_authorization(
    method: str,
    url_path: str,
    body: str,
    *,
    mchid: str,
    serial_no: str,
    private_key_pem: str,
    nonce: Optional[str] = None,
    timestamp: Optional[str] = None,
) -> str:
    """构造 V3 接口的 Authorization 请求头"""
    nonce = nonce or uuid.uuid4().hex
    timestamp = timestamp or str(int(time.time()))
    message = f"{method}\n{url_path}\n{timestamp}\n{nonce}\n{body}\n"
    signature = sign_message(private_key_pem, message)
    return (
        'WECHATPAY2-SHA256-RSA2048 '
        f'mchid="{mchid}",nonce_str="{nonce}",signature="{signature}",'
        f'timestamp="{timestamp}",serial_no="{serial_no}"'
    )


async def create_jsapi_prepay(
    *,
    appid: str,
    mchid: str,
    serial_no: str,
    private_key_pem: str,
    notify_url: str,
    description: str,
    out_trade_no: str,
    amount_cents: int,
    openid: str,
) -> str:
    """调用 JSAPI 下单接口，返回 prepay_id"""
    payload = {
        "appid": appid,
        "mchid": mchid,
        "description": description,
        "out_trade_no": out_trade_no,
        "notify_url": notify_url,
        "amount": {"total": amount_cents, "currency": "CNY"},
        "payer": {"openid": openid},
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    headers = {
        "Authorization": build_authorization(
            "POST",
            JSAPI_PREPAY_PATH,
            body,
            mchid=mchid,
            serial_no=serial_no,
            private_key_pem=private_key_pem,
        ),
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "piaoxiaozhu-miniapp/1.0",
    }

    async with wechat_client(verify=settings.WX_TLS_VERIFY, timeout=10.0) as client:
        resp = await client.post(
            f"{WECHAT_PAY_HOST}{JSAPI_PREPAY_PATH}",
            content=body.encode("utf-8"),
            headers=headers,
        )

    if resp.status_code != 200:
        raise WeChatPayError(f"下单失败({resp.status_code}): {resp.text}")

    prepay_id = resp.json().get("prepay_id")
    if not prepay_id:
        raise WeChatPayError(f"下单响应缺少 prepay_id: {resp.text}")
    return prepay_id


def build_pay_params(
    *,
    appid: str,
    prepay_id: str,
    private_key_pem: str,
    nonce: Optional[str] = None,
    timestamp: Optional[str] = None,
) -> dict:
    """构造 Taro.requestPayment / wx.requestPayment 所需的参数字典。

    字段名必须与微信小程序端完全一致（timeStamp / nonceStr / package /
    signType / paySign），且均为字符串。
    """
    nonce = nonce or uuid.uuid4().hex
    timestamp = timestamp or str(int(time.time()))
    package = f"prepay_id={prepay_id}"
    message = f"{appid}\n{timestamp}\n{nonce}\n{package}\n"
    return {
        "timeStamp": timestamp,
        "nonceStr": nonce,
        "package": package,
        "signType": "RSA",
        "paySign": sign_message(private_key_pem, message),
    }


def verify_notify(headers: Mapping[str, str], body: bytes, platform_cert_pem: str) -> None:
    """校验回调签名，失败抛 WeChatPayError。不校验就无法防伪造。"""
    normalized = {k.lower(): v for k, v in headers.items()}
    timestamp = normalized.get("wechatpay-timestamp")
    nonce = normalized.get("wechatpay-nonce")
    signature = normalized.get("wechatpay-signature")
    if not (timestamp and nonce and signature):
        raise WeChatPayError("回调缺少 Wechatpay-* 验签头")

    try:
        skew = abs(int(time.time()) - int(timestamp))
    except ValueError as e:
        raise WeChatPayError(f"回调时间戳非法: {timestamp}") from e
    if skew > NOTIFY_MAX_SKEW_SECONDS:
        raise WeChatPayError(f"回调时间戳超出 {NOTIFY_MAX_SKEW_SECONDS}s 容差，疑似重放")

    message = f"{timestamp}\n{nonce}\n{body.decode('utf-8')}\n"
    try:
        _load_platform_public_key(platform_cert_pem).verify(
            base64.b64decode(signature),
            message.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
    except InvalidSignature as e:
        raise WeChatPayError("回调验签失败") from e


def decrypt_resource(resource: Mapping[str, Any], apiv3_key: str) -> dict:
    """用 APIv3 密钥解密回调中的 resource 字段"""
    algorithm = resource.get("algorithm")
    if algorithm != "AEAD_AES_256_GCM":
        raise WeChatPayError(f"不支持的加密算法: {algorithm}")

    key = apiv3_key.encode("utf-8")
    if len(key) != APIV3_KEY_LENGTH:
        raise WeChatPayError(f"APIv3 密钥必须为 {APIV3_KEY_LENGTH} 字节")

    try:
        plaintext = AESGCM(key).decrypt(
            resource["nonce"].encode("utf-8"),
            base64.b64decode(resource["ciphertext"]),
            (resource.get("associated_data") or "").encode("utf-8"),
        )
    except (KeyError, ValueError) as e:
        raise WeChatPayError(f"回调解密失败: {e}") from e

    return json.loads(plaintext.decode("utf-8"))
