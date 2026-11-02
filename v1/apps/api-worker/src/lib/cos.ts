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
  /** HTTP 方法：上传用 PUT（默认），展示用 GET，核对大小用 HEAD，清理用 DELETE */
  method?: "PUT" | "GET" | "HEAD" | "DELETE";
  /**
   * 额外参与签名的请求头。
   *
   * 上传时把 content-length 签进去，客户端就只能传这个大小：
   * 多传一个字节，COS 直接回签名不匹配。这是预签名 PUT 唯一能在存储侧
   * 卡住大小限制的办法，光靠调用方自己报 size 不算数。
   */
  extraHeaders?: Record<string, string>;
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

  // 预签名头部列表至少包含 host；额外头部按名字排序后一并参与签名
  const method = (opts.method ?? "PUT").toLowerCase();
  const headerPairs = (
    [
      ["host", host],
      ...Object.entries(opts.extraHeaders ?? {}).map(([k, v]) => [k.toLowerCase(), v] as [string, string]),
    ] as Array<[string, string]>
  ).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const headersStr = headerPairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const headerList = headerPairs.map(([k]) => k).join(";");
  const httpString = `${method}\n${path}\n\n${headersStr}\n`;
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
    `&q-header-list=${encodeURIComponent(headerList)}` +
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

/**
 * 读对象的真实大小。
 *
 * 预签名 PUT 本身不知道客户端到底传了多少字节，所以登记时要以这里读到的值为准。
 *
 * 为什么不用 HEAD、也不用 Range：实测 COS 对这两种写法都回 403。
 * 带 URL 签名的 HEAD 请求直接被拒；把 `range` 签进 head 列表同样判签名不匹配。
 * 唯一稳定可用的是普通签名 GET——拿到响应头就取消响应体，不下载正文。
 */
export async function cosObjectSize(
  opts: CosPresignOptions
): Promise<{ exists: boolean; size: number | null }> {
  const url = await cosPresignGet(opts);
  const res = await fetch(url, { method: "GET" });
  // 只要响应头，正文一律不读。漏掉这一步，10MB 的票会整张下载一遍。
  if (res.body) await res.body.cancel().catch(() => {});

  if (!res.ok) {
    console.error("[cos] 读大小失败:", res.status, opts.key);
    return { exists: false, size: null };
  }

  const raw = res.headers.get("content-length");
  const size = raw === null ? Number.NaN : Number(raw);
  return { exists: true, size: Number.isFinite(size) ? size : null };
}

/** 删除对象。拒收超限文件时顺手清掉，别把垃圾留在桶里 */
export async function cosDeleteObject(opts: CosPresignOptions): Promise<void> {
  const url = await cosPresign({ ...opts, method: "DELETE" });
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    console.error("[cos] 删除对象失败:", res.status, opts.key);
  }
}

/**
 * 上传一张临时图片，返回给第三方模型拉取用的地址。
 *
 * ## 为什么经 COS 中转
 *
 * 视觉模型要求把图片作为 `image_url` 传入。直接内嵌 base64 的 data URL 时，
 * 请求体会有几十 KB，服务商的网关对「数据中心 IP + 大 POST」直接回 429
 * （实测：同一张图，本机 200，Worker 里 429；换成 691 字节的小图也一样）。
 *
 * 改成传 URL 后，我们发出的请求只有几百字节，跟文本调用一个量级；
 * 拉图这一步由服务商的服务器去做，不受这个限制。
 *
 * 返回预签名 GET 而不是公网地址：桶保持私有，签名一小时有效，
 * 足够模型拉取，也不会把用户的票据长期暴露在公网。
 */
export async function cosUploadForVision(
  bytes: ArrayBuffer,
  env: {
    COS_BUCKET_NAME?: string;
    COS_REGION?: string;
    COS_SECRET_ID?: string;
    COS_SECRET_KEY?: string;
  }
): Promise<string | null> {
  const { COS_BUCKET_NAME, COS_REGION, COS_SECRET_ID, COS_SECRET_KEY } = env;
  if (!COS_BUCKET_NAME || !COS_REGION || !COS_SECRET_ID || !COS_SECRET_KEY) return null;

  const key = `ocr-tmp/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`;
  const common = {
    bucket: COS_BUCKET_NAME,
    region: COS_REGION,
    secretId: COS_SECRET_ID,
    secretKey: COS_SECRET_KEY,
    key,
  };

  const putUrl = await cosPresignPut({ ...common, expires: 600 });
  const put = await fetch(putUrl, { method: "PUT", body: bytes });
  if (!put.ok) {
    console.error("[cos] 临时上传失败:", put.status, (await put.text()).slice(0, 120));
    return null;
  }

  return cosPresignGet({ ...common, expires: 3600 });
}
