"""HTTP 客户端工厂：统一处理「出网 TLS 被中间人代理重签」的环境差异。

## 背景（2026-10-23 实测）

微信云托管容器的公网出口有**透明 TLS 中间人代理**，它用自签名证书重新签发所有
HTTPS 流量。Python 的 httpx/ssl 默认校验证书链，于是报：

    ConnectError: [SSL: CERTIFICATE_VERIFY_FAILED]
    certificate verify failed: self-signed certificate (_ssl.c:1010)

注意报错措辞是「self-signed certificate」而不是「unable to get local issuer
certificate」——后者是缺 CA 根证书，前者是**对端主动出示了自签证书**，
即流量被代理截获。这两种原因的修法完全不同，别混。

## 三种应对

1. **微信云托管「开放接口服务」旁路**（官方，最干净）：走 `http://` 内网，
   根本没有 TLS 这一步，也就没有证书问题。由 `WECHAT_OPENAPI_SIDECAR` 控制。
2. **关闭证书校验**（本模块的 `WX_TLS_VERIFY=false`）：用于旁路不可用的环境。
3. 普通公网服务器：默认值即可，不需要任何配置。

## 关闭校验的安全代价（要知道自己在让什么）

中间人能拿到请求里的 appid / secret / js_code。

在云托管场景下这个增量风险很小：中间人就是平台自己的出口代理，而平台本来就
托管着服务的环境变量（其中就包含 WX_SECRET）——该看到的人本来就能看到。
但这是**有意识的妥协**，不是默认行为，所以用环境变量显式打开，不留暗桩。
"""

from __future__ import annotations

import httpx


def wechat_transport(verify: bool = True) -> httpx.AsyncHTTPTransport:
    """构造发往微信域名的 transport。

    local_address="0.0.0.0"：强制走 IPv4。微信部分接口对 IPv6 支持不完整，
    而云托管容器往往同时有 IPv6 出口，优先解析 AAAA 时会连不上。
    """
    return httpx.AsyncHTTPTransport(local_address="0.0.0.0", retries=1, verify=verify)


def wechat_client(verify: bool = True, timeout: float = 20.0) -> httpx.AsyncClient:
    """发往微信域名的 AsyncClient。

    trust_env=False：忽略容器注入的 HTTP_PROXY/HTTPS_PROXY 环境变量——
    那些代理常常是不可用的，用了反而连不上。
    """
    return httpx.AsyncClient(
        timeout=timeout,
        trust_env=False,
        transport=wechat_transport(verify),
    )
