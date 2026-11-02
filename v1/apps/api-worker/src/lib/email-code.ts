/**
 * 邮箱验证码的生成、哈希与限流参数。
 *
 * 为什么不存验证码明文：验证码本身只有六位，值空间很小，但它是
 * 「邮箱归属」的唯一凭证。库里存明文等于把所有人的收件箱钥匙摊在桌上。
 *
 * 哈希时混入服务端密钥（JWT_SECRET）：即便有人拿到数据库里的哈希，
 * 也还要再拿到密钥，才能离线穷举六位数字。
 */

export const CODE_TTL_SECONDS = 600;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_CODES_PER_EMAIL_PER_HOUR = 5;
export const MAX_CODES_PER_IP_PER_HOUR = 20;
export const MAX_ATTEMPTS = 5;

/** 六位数字，补零到固定长度，避免出现「12345」这种位数不一致 */
export function generateCode(): string {
  const buf = crypto.getRandomValues(new Uint32Array(1));
  return String(buf[0]! % 1_000_000).padStart(6, "0");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 验证码的哈希：邮箱 + 验证码 + 服务端密钥，三者缺一不可 */
export function hashCode(email: string, code: string, secret: string): Promise<string> {
  return sha256Hex(`${email}:${code}:${secret}`);
}

/**
 * IP 的哈希，只用于限流。
 *
 * 截断到 16 位：碰撞概率仍远低于「同 IP」的判定粒度，
 * 又不会留下能反查回原 IP 的完整指纹。
 */
export function hashIp(ip: string, secret: string): Promise<string> {
  return sha256Hex(`${ip}:${secret}`).then((h) => h.slice(0, 16));
}

/**
 * 恒定时间比较。
 *
 * 验证码校验失败时会返回「不正确」，若用普通字符串比较，响应时间会随
 * 相同前缀长度变化，理论上能一位一位试出来。这里逐字节异或累加，时间固定。
 */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
