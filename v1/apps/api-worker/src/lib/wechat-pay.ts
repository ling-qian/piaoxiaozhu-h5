/**
 * 微信支付 V3（JSAPI）——签名、下单、回调验签与解密。
 *
 * 从 `services/api/app/services/wechat_pay.py` 移植。三处最容易出错的地方：
 *   1. 签名串的换行格式（多一个空行就验不过）
 *   2. 回调验签**必须做**，不做任何人都能伪造「支付成功」
 *   3. 解密用 AEAD_AES_256_GCM，密钥必须是 32 字节
 *
 * Workers 里没有 cryptography 库，全部用 Web Crypto 实现；
 * PEM 需要先剥掉头尾、base64 解码成 DER 才能 importKey。
 */

const enc = new TextEncoder();

export const WECHAT_PAY_HOST = "https://api.mch.weixin.qq.com";
export const JSAPI_PREPAY_PATH = "/v3/pay/transactions/jsapi";
export const APIV3_KEY_LENGTH = 32;
/** 回调时间戳容差，超出即视为重放 */
export const NOTIFY_MAX_SKEW_SECONDS = 300;

export class WeChatPayError extends Error {}

// --------------------------------------------------------------------------- PEM → CryptoKey

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!body) throw new WeChatPayError("PEM 内容为空");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 商户私钥（PKCS#8）→ 签名用 CryptoKey */
export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  if (!/BEGIN (?:RSA )?PRIVATE KEY/.test(pem)) {
    throw new WeChatPayError("商户私钥格式不对，应为 PEM 的 PRIVATE KEY");
  }
  return crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/**
 * 从 X.509 证书里取出 SubjectPublicKeyInfo（SPKI）。
 *
 * Web Crypto 不解析证书，只吃 SPKI/PKCS8。做法是搜索 rsaEncryption 的
 * AlgorithmIdentifier 字节序列（30 0D 06 09 2A 86 48 86 F7 0D 01 01 01 05 00），
 * 它前面紧邻的就是 SPKI 的 SEQUENCE 头，按 DER 长度字段切出整段即可。
 */
function extractSpkiFromCert(der: Uint8Array): Uint8Array {
  const RSA_ALG_ID = [
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ];

  for (let i = 15; i < der.length - RSA_ALG_ID.length; i++) {
    let matched = true;
    for (let k = 0; k < RSA_ALG_ID.length; k++) {
      if (der[i + k] !== RSA_ALG_ID[k]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    // SPKI = SEQUENCE(长度) + AlgorithmIdentifier + BIT STRING
    // 算法标识前面若干字节内一定有一个 0x30 起始的 SEQUENCE
    for (let back = 1; back <= 6 && i - back >= 0; back++) {
      const tag = der[i - back];
      if (tag !== 0x30) continue;
      const lenByte = der[i - back + 1];
      if (lenByte === undefined) continue;

      let headerLen = 2;
      let contentLen = lenByte;
      if (lenByte & 0x80) {
        const n = lenByte & 0x7f;
        if (n > 2 || i - back + 1 + n >= der.length) continue;
        contentLen = 0;
        for (let j = 0; j < n; j++) contentLen = (contentLen << 8) | der[i - back + 2 + j]!;
        headerLen = 2 + n;
      }

      const start = i - back;
      const end = start + headerLen + contentLen;
      if (end <= der.length) return der.slice(start, end);
    }
  }
  throw new WeChatPayError("无法从证书中提取公钥，建议改用「微信支付公钥」模式（PUBLIC KEY 格式）");
}

/** 平台公钥或平台证书 → 验签用 CryptoKey */
export async function importPlatformPublicKey(pem: string): Promise<CryptoKey> {
  let der: Uint8Array;
  if (/BEGIN (?:RSA )?PUBLIC KEY/.test(pem)) {
    der = pemToDer(pem);
  } else if (/BEGIN CERTIFICATE/.test(pem)) {
    der = extractSpkiFromCert(pemToDer(pem));
  } else {
    throw new WeChatPayError("平台公钥格式不对，应为 PUBLIC KEY 或 CERTIFICATE 的 PEM");
  }

  return crypto.subtle.importKey(
    "spki",
    der as BufferSource,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

// --------------------------------------------------------------------------- 签名

function toBase64(buf: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function signMessage(privateKeyPem: string, message: string): Promise<string> {
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(message));
  return toBase64(sig);
}

export interface AuthorizationOptions {
  method: string;
  urlPath: string;
  body: string;
  mchid: string;
  serialNo: string;
  privateKeyPem: string;
  nonce?: string;
  timestamp?: string;
}

/** 构造 V3 接口的 Authorization 头 */
export async function buildAuthorization(opts: AuthorizationOptions): Promise<string> {
  const nonce = opts.nonce ?? crypto.randomUUID().replace(/-/g, "");
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  // 注意末尾的换行：少了它签名必然不匹配
  const message = `${opts.method}\n${opts.urlPath}\n${timestamp}\n${nonce}\n${opts.body}\n`;
  const signature = await signMessage(opts.privateKeyPem, message);
  return (
    `WECHATPAY2-SHA256-RSA2048 ` +
    `mchid="${opts.mchid}",nonce_str="${nonce}",signature="${signature}",` +
    `timestamp="${timestamp}",serial_no="${opts.serialNo}"`
  );
}

// --------------------------------------------------------------------------- 下单

export interface PrepayOptions {
  appid: string;
  mchid: string;
  serialNo: string;
  privateKeyPem: string;
  notifyUrl: string;
  description: string;
  outTradeNo: string;
  amountCents: number;
  openid: string;
}

export async function createJsapiPrepay(opts: PrepayOptions): Promise<string> {
  const payload = {
    appid: opts.appid,
    mchid: opts.mchid,
    description: opts.description,
    out_trade_no: opts.outTradeNo,
    notify_url: opts.notifyUrl,
    amount: { total: opts.amountCents, currency: "CNY" },
    payer: { openid: opts.openid },
  };
  // 紧凑 JSON（无空格）：签名串里的 body 必须与实际发送的字节完全一致
  const body = JSON.stringify(payload);

  const authorization = await buildAuthorization({
    method: "POST",
    urlPath: JSAPI_PREPAY_PATH,
    body,
    mchid: opts.mchid,
    serialNo: opts.serialNo,
    privateKeyPem: opts.privateKeyPem,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let resp: Response;
  try {
    resp = await fetch(`${WECHAT_PAY_HOST}${JSAPI_PREPAY_PATH}`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "piaoxiaozhu-worker/1.0",
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await resp.text();
  if (resp.status !== 200) {
    throw new WeChatPayError(`下单失败(${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text) as { prepay_id?: string };
  if (!data.prepay_id) throw new WeChatPayError(`下单响应缺少 prepay_id: ${text.slice(0, 200)}`);
  return data.prepay_id;
}

/** 构造 wx.requestPayment 所需参数。字段名必须与小程序端完全一致，且都是字符串 */
export async function buildPayParams(opts: {
  appid: string;
  prepayId: string;
  privateKeyPem: string;
  nonce?: string;
  timestamp?: string;
}): Promise<Record<string, string>> {
  const nonce = opts.nonce ?? crypto.randomUUID().replace(/-/g, "");
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const packageStr = `prepay_id=${opts.prepayId}`;
  const message = `${opts.appid}\n${timestamp}\n${nonce}\n${packageStr}\n`;
  return {
    timeStamp: timestamp,
    nonceStr: nonce,
    package: packageStr,
    signType: "RSA",
    paySign: await signMessage(opts.privateKeyPem, message),
  };
}

// --------------------------------------------------------------------------- 回调

/** 校验回调签名。不校验就无法防伪造——任何人都能 POST 一个「支付成功」。 */
export async function verifyNotify(
  headers: Headers,
  body: string,
  platformPublicKeyPem: string
): Promise<void> {
  const timestamp = headers.get("Wechatpay-Timestamp") ?? headers.get("wechatpay-timestamp");
  const nonce = headers.get("Wechatpay-Nonce") ?? headers.get("wechatpay-nonce");
  const signature = headers.get("Wechatpay-Signature") ?? headers.get("wechatpay-signature");

  if (!timestamp || !nonce || !signature) {
    throw new WeChatPayError("回调缺少 Wechatpay-* 验签头");
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) throw new WeChatPayError(`回调时间戳非法: ${timestamp}`);
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > NOTIFY_MAX_SKEW_SECONDS) {
    throw new WeChatPayError(`回调时间戳超出 ${NOTIFY_MAX_SKEW_SECONDS}s 容差，疑似重放`);
  }

  const message = `${timestamp}\n${nonce}\n${body}\n`;
  const key = await importPlatformPublicKey(platformPublicKeyPem);

  let ok = false;
  try {
    const sig = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, enc.encode(message));
  } catch {
    ok = false;
  }
  if (!ok) throw new WeChatPayError("回调验签失败");
}

export interface EncryptedResource {
  algorithm: string;
  nonce: string;
  ciphertext: string;
  associated_data?: string;
}

/** 用 APIv3 密钥解密回调中的 resource 字段 */
export async function decryptResource(
  resource: EncryptedResource,
  apiv3Key: string
): Promise<Record<string, unknown>> {
  if (resource.algorithm !== "AEAD_AES_256_GCM") {
    throw new WeChatPayError(`不支持的加密算法: ${resource.algorithm}`);
  }
  const keyBytes = enc.encode(apiv3Key);
  if (keyBytes.length !== APIV3_KEY_LENGTH) {
    throw new WeChatPayError(`APIv3 密钥必须为 ${APIV3_KEY_LENGTH} 字节，当前 ${keyBytes.length}`);
  }

  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);

  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: enc.encode(resource.nonce),
        // associated_data 为空时不能传空数组，要传空字节串
        additionalData: enc.encode(resource.associated_data ?? ""),
        tagLength: 128,
      },
      key,
      Uint8Array.from(atob(resource.ciphertext), (c) => c.charCodeAt(0))
    );
  } catch (e) {
    throw new WeChatPayError(`回调解密失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
}
