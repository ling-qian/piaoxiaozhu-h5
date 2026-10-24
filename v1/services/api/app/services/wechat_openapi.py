"""微信开放接口的调用地址选择（公网 / 云托管「开放接口服务」内网）。

## 背景

云托管容器访问 `api.weixin.qq.com` 走公网时，可能出现连接被拒（实测 0.26s 秒失败）。
微信官方给了替代通道：**「开放接口服务」**。它以旁加载形式驻留在容器里，
中转所有发往 `api.weixin.qq.com` 的请求，并自动处理 access_token。

开启方式（控制台）：
    云托管 → 云调用 → 开放接口服务 → 打开开关 → **重新创建服务版本**
（开关之前已存在的版本不含该服务，必须重新构建才生效）

## 使用约定

开启后，代码里把地址写成 **http://**（不是 https），且**不要带 access_token**：
- 走内网，没有 TLS，用 https 反而会因为自签证书失败
- token 由旁加载代管，带了会被原样透传（环境共享时才需要）

响应头出现 `x-openapi-seqid` 就说明请求确实走了云调用链路。

## 为什么用开关而不是直接写死

本地开发、以及未开启该服务的环境仍然要走公网 https，
所以两种形态必须能一键切换，而不是靠改代码。
"""

from __future__ import annotations

# 微信开放接口的公网域名。开启开放接口服务后，旁加载会接管这个地址
PUBLIC_HOST = "api.weixin.qq.com"


def base_url(use_sidecar: bool) -> str:
    """返回调用微信接口时应使用的 base url。

    use_sidecar=True  → http://api.weixin.qq.com （走云托管旁加载，免鉴权）
    use_sidecar=False → https://api.weixin.qq.com（公网直连，需要 access_token）
    """
    return f"http://{PUBLIC_HOST}" if use_sidecar else f"https://{PUBLIC_HOST}"


def url(path: str, use_sidecar: bool) -> str:
    """拼出完整地址。path 需以 / 开头。"""
    if not path.startswith("/"):
        path = "/" + path
    return base_url(use_sidecar) + path
