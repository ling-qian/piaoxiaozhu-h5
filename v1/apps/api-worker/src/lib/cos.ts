/**
 * 腾讯云 COS 预签名 URL（v5 签名，HMAC-SHA1）。
 *
 * ## 为什么要自己实现
 *
 * Worker 里没有 boto3 / cos-python-sdk。签名算法本身不长，但**错一个字节就是 403**，
 * 而且 COS 不会告诉你哪里错——只会回 `SignatureDoesNotMatch`。
 * 所以这里有对拍测试：用同一时间戳分别算 TS 与 Python 的签名，必须逐字符相同。
 *
 * ## 算法（COS 官方）
 *
 *   KeyTime     = "{start};{end}"（Unix 秒）
 *   SignKey     = HMAC-SHA1(SecretKey, KeyTime)
 *   HttpString  = "put\n" + 路径 + "\n" + url参数列表 + "\n" + 头部列表 + "\n"
 *   StringToSign= "sha1\n" + KeyTime + "\n" + SHA1(HttpString) + "\n"
 *   Signature   = hex(HMAC-SHA1(SignKey, StringToSign))
 *
 * 注意：预签名 PUT 的头部列表是 `host`（实测 cos-python-sdk 就是这么签的），
 * 不是空——空列表会被 COS 判为签名不匹配。
 */

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha1(keyBytes: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
}

async function sha1Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-1", enc.encode(data)));
}

/** 路径按段编码：保留 `/`，其余转义（与 SDK 的 encode_uri 行为一致） */
function encodePath(key: string): string {
  const clean = key.replace(/^\/+/, "");
  return "/" + clean.split("/").map(encodeURIComponent).join("/");
}

export interface CosPresignOptions {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  /** 对象键，如 uploads/{userId}/{projectId}/{fileId}.jpg */
  key: string;
  expires?: number;
  /** HTTP 方法：上传用 PUT（默认），展示用 GET */
  method?: "PUT" | "GET";
  /** 仅测试用：固定起始秒数，便于与 Python 版对拍 */
  nowSec?: number;
}

export async function cosPresign(opts: CosPresignOptions): Promise<string> {
  const host = `${opts.bucket}.cos.${opts.region}.myqcloud.com`;
  const path = encodePath(opts.key);
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  // 起始时间回拨 60 秒：客户端与 COS 之间可能有轻微时钟偏差，
  // 留出缓冲区可以避免「刚签的 URL 就被判为尚未生效」。SDK 也是这么做的。
  const start = now - 60;
  const keyTime = `${start};${now + (opts.expires ?? 900)}`;

  // 预签名场景头部列表固定为 host；url 参数列表为空
  const method = (opts.method ?? "PUT").toLowerCase();
  const httpString = `${method}\n${path}\n\nhost=${encodeURIComponent(host)}\n`;
  const stringToSign = `sha1\n${keyTime}\n${await sha1Hex(httpString)}\n`;

  // ⚠️ 关键细节：COS 的第二段 HMAC 用的密钥是**第一段结果的十六进制字符串**
  // （即 Python SDK 里的 `hmac.new(secret, sign_time, sha1).hexdigest()`），
  // 不是原始字节。用原始字节会得到另一个签名，COS 只回 SignatureDoesNotMatch。
  const signKeyHex = toHex(await hmacSha1(enc.encode(opts.secretKey), keyTime));
  const signature = toHex(await hmacSha1(enc.encode(signKeyHex), stringToSign));

  // 查询串里的 `;` 必须编码成 %3B（参与签名的仍是原始 keyTime）
  const keyTimeEnc = encodeURIComponent(keyTime);
  const query =
    `q-sign-algorithm=sha1` +
    `&q-ak=${opts.secretId}` +
    `&q-sign-time=${keyTimeEnc}` +
    `&q-key-time=${keyTimeEnc}` +
    `&q-header-list=host` +
    `&q-url-param-list=` +
    `&q-signature=${signature}`;

  return `https://${host}${path}?${query}`;
}

/** 对象访问地址（只读展示用，不带签名） */
export function cosPublicUrl(bucket: string, region: string, key: string): string {
  return `https://${bucket}.cos.${region}.myqcloud.com${encodePath(key)}`;
}

/** 上传用：预签名 PUT */
export function cosPresignPut(opts: CosPresignOptions): Promise<string> {
  return cosPresign({ ...opts, method: "PUT" });
}

/**
 * 展示用：预签名 GET。
 *
 * 我们的 COS 桶是**私有读**（实测公开地址回 403），所以图片展示必须用签名地址，
 * 且必须有时效——把永久公开地址写进数据库再渲染，用户会看到一片裂图。
 */
export function cosPresignGet(opts: CosPresignOptions): Promise<string> {
  return cosPresign({ ...opts, method: "GET" });
}
