"""对象存储接入层：本地磁盘 / 阿里云 OSS / 腾讯云 COS 三种后端统一入口。

选择规则（取第一个配置齐全的）：
1. 腾讯云 COS —— 配了 COS_* 就走它。与微信云托管同厂商同地域，可走内网、免流量费。
2. 阿里云 OSS —— 历史方案，配了 OSS_* 继续可用，业务代码零改动。
3. 本地磁盘   —— 都没配时的兜底，仅适用本地开发；云托管容器重启即丢。

调用方（routers/files.py、routers/users.py）只依赖本模块，不再直接碰 SDK。
所有 SDK 都在函数内部导入：api 镜像即使没装 oss2 / cos-python-sdk-v5 也能正常启动，
只有真正用到该后端时才会 import。
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(settings.UPLOAD_DIR)
if not UPLOAD_DIR.is_dir():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# OSS/COS 对象键统一带 uploads/ 前缀；本地静态目录直接挂在 uploads 上，
# 因此本地 URL 要去掉这一段，否则会 404。
LOCAL_KEY_PREFIX = "uploads/"


def active_backend() -> str:
    """当前生效的存储后端：cos / oss / local"""
    if settings.COS_SECRET_ID and settings.COS_SECRET_KEY and settings.COS_BUCKET_NAME:
        return "cos"
    if settings.OSS_ACCESS_KEY_ID and settings.OSS_BUCKET_NAME:
        return "oss"
    return "local"


def is_remote_configured() -> bool:
    """是否配了远端对象存储（未配置时文件落容器本地盘，云托管重启即丢）"""
    return active_backend() != "local"


def describe_backend() -> str:
    backend = active_backend()
    if backend == "cos":
        return f"腾讯云 COS（bucket={settings.COS_BUCKET_NAME}, region={settings.COS_REGION}）"
    if backend == "oss":
        return f"阿里云 OSS（bucket={settings.OSS_BUCKET_NAME}）"
    return "本地磁盘（仅适合本地开发，容器重启会丢文件）"


def local_path(file_key: str) -> Path:
    return UPLOAD_DIR / file_key.replace(LOCAL_KEY_PREFIX, "")


def local_public_url(file_key: str) -> str:
    """/files/static 由 main.py 挂到 uploads 目录，所以这里必须去掉 uploads/ 前缀"""
    return f"/files/static/{file_key.replace(LOCAL_KEY_PREFIX, '')}"


# --------------------------------------------------------------------------- 上传


def upload_object(file_key: str, content: bytes) -> str:
    """写入对象存储并返回可访问 URL；后端为本地时返回本地静态 URL。

    远端写入失败会抛异常，由调用方决定是否回退本地。
    """
    backend = active_backend()
    if backend == "cos":
        return _upload_cos(file_key, content)
    if backend == "oss":
        return _upload_oss(file_key, content)
    return local_public_url(file_key)


def _upload_oss(file_key: str, content: bytes) -> str:
    import oss2

    auth = oss2.Auth(settings.OSS_ACCESS_KEY_ID, settings.OSS_ACCESS_KEY_SECRET)
    bucket = oss2.Bucket(auth, settings.OSS_ENDPOINT, settings.OSS_BUCKET_NAME)
    bucket.put_object(file_key, content)
    return f"https://{settings.OSS_BUCKET_NAME}.{settings.OSS_ENDPOINT}/{file_key}"


def _upload_cos(file_key: str, content: bytes) -> str:
    client = _cos_client()
    client.put_object(Bucket=settings.COS_BUCKET_NAME, Key=file_key, Body=content)
    return f"https://{settings.COS_BUCKET_NAME}.cos.{settings.COS_REGION}.myqcloud.com/{file_key}"


# --------------------------------------------------------------------------- 读取


def download_object(file_key: str) -> bytes:
    """读取对象内容。优先本地缓存，其次远端。读不到抛 FileNotFoundError。"""
    path = local_path(file_key)
    if path.exists():
        return path.read_bytes()

    backend = active_backend()
    try:
        if backend == "cos":
            resp = _cos_client().get_object(Bucket=settings.COS_BUCKET_NAME, Key=file_key)
            return resp["Body"].get_raw_stream().read()
        if backend == "oss":
            import oss2

            auth = oss2.Auth(settings.OSS_ACCESS_KEY_ID, settings.OSS_ACCESS_KEY_SECRET)
            bucket = oss2.Bucket(auth, settings.OSS_ENDPOINT, settings.OSS_BUCKET_NAME)
            return bucket.get_object(file_key).read()
    except Exception as e:
        logger.error("从对象存储读取失败 backend=%s key=%s: %s", backend, file_key, e)

    raise FileNotFoundError(f"文件不存在: {file_key}")


# --------------------------------------------------------------------------- 签名 URL


def signed_url(file_key: str, expires: int = 3600) -> Optional[str]:
    """私有桶的临时可访问地址；不支持或失败时返回 None，由调用方回退公开 URL。"""
    backend = active_backend()
    try:
        if backend == "cos":
            return _cos_client().get_presigned_url(
                Method="GET", Bucket=settings.COS_BUCKET_NAME, Key=file_key, Expired=expires
            )
        if backend == "oss":
            import oss2

            auth = oss2.Auth(settings.OSS_ACCESS_KEY_ID, settings.OSS_ACCESS_KEY_SECRET)
            bucket = oss2.Bucket(auth, settings.OSS_ENDPOINT, settings.OSS_BUCKET_NAME)
            return bucket.sign_url("GET", file_key, expires)
    except Exception as e:
        logger.warning("生成签名 URL 失败 backend=%s key=%s: %s", backend, file_key, e)
    return None


# --------------------------------------------------------------------------- 删除


def presigned_put_url(
    file_key: str, expires: int = 900, content_type: Optional[str] = None
) -> Optional[str]:
    """签发「小程序直传」用的 PUT 地址。

    为什么是 PUT：`wx.uploadFile` 只能发 multipart POST，而 COS 的普通上传是 PUT。
    小程序端改用 `wx.request(method='PUT', data=ArrayBuffer)` 直传，避免把
    用户图片先经后端中转（省带宽、也不用在后端配 uploads 目录）。

    签名由服务端用 SecretKey 生成，前端只拿到有时效的 URL，拿不到密钥。
    """
    backend = active_backend()
    headers = {"Content-Type": content_type} if content_type else {}
    try:
        if backend == "cos":
            return _cos_client().get_presigned_url(
                Method="PUT",
                Bucket=settings.COS_BUCKET_NAME,
                Key=file_key,
                Expired=expires,
                Headers=headers,
            )
        if backend == "oss":
            import oss2

            auth = oss2.Auth(settings.OSS_ACCESS_KEY_ID, settings.OSS_ACCESS_KEY_SECRET)
            bucket = oss2.Bucket(auth, settings.OSS_ENDPOINT, settings.OSS_BUCKET_NAME)
            return bucket.sign_url("PUT", file_key, expires, headers=headers)
    except Exception as e:
        logger.warning("签发直传地址失败 backend=%s key=%s: %s", backend, file_key, e)
    return None


def public_url(file_key: str) -> str:
    """对象存储上的公开访问地址（私有桶读不了，展示时应优先用 signed_url）。"""
    backend = active_backend()
    if backend == "cos":
        return f"https://{settings.COS_BUCKET_NAME}.cos.{settings.COS_REGION}.myqcloud.com/{file_key}"
    if backend == "oss":
        return f"https://{settings.OSS_BUCKET_NAME}.{settings.OSS_ENDPOINT}/{file_key}"
    return local_public_url(file_key)


def delete_object(file_key: str) -> None:
    """删除单个对象；失败只记日志，不阻断调用方流程。"""
    backend = active_backend()
    try:
        if backend == "cos":
            _cos_client().delete_object(Bucket=settings.COS_BUCKET_NAME, Key=file_key)
        elif backend == "oss":
            import oss2

            auth = oss2.Auth(settings.OSS_ACCESS_KEY_ID, settings.OSS_ACCESS_KEY_SECRET)
            bucket = oss2.Bucket(auth, settings.OSS_ENDPOINT, settings.OSS_BUCKET_NAME)
            bucket.delete_object(file_key)
    except Exception as e:
        logger.warning("删除对象存储文件失败 backend=%s key=%s: %s", backend, file_key, e)


def _cos_client():
    from qcloud_cos import CosConfig, CosS3Client

    config = CosConfig(
        Region=settings.COS_REGION,
        SecretId=settings.COS_SECRET_ID,
        SecretKey=settings.COS_SECRET_KEY,
        Scheme="https",
    )
    return CosS3Client(config)
