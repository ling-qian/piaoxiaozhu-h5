/**
 * JWT（HS256）——用 Web Crypto 实现，不引第三方库。
 *
 * **必须与旧后端的 token 完全兼容**：线上已经签发的 token 不能因为换实现就失效，
 * 否则所有已登录用户会被踢下线。
 *
 * 旧实现（python-jose）：payload = {"sub": "<uuid>", "exp": <秒级时间戳>}
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** 与旧后端同样的 7 天有效期 */
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function signToken(
  userId: string,
  secret: string,
  ttlSeconds = TOKEN_TTL_SECONDS
): Promise<string> {
  const header = b64urlEncode(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = b64urlEncode(enc.encode(JSON.stringify({ sub: userId, exp })));
  const data = `${header}.${payload}`;

  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`;
}

export interface TokenPayload {
  sub: string;
  exp: number;
}

/** 校验签名与过期时间。失败返回 null，由调用方转成 401。 */
export async function verifyToken(
  token: string,
  secret: string
): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];

  try {
    const key = await importKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(s),
      enc.encode(`${h}.${p}`)
    );
    if (!ok) return null;

    const payload = JSON.parse(dec.decode(b64urlDecode(p))) as TokenPayload;
    if (!payload?.sub) return null;
    // 过期判断必须做：签名对但时间过了的 token 不能放行
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
