/**
 * 邮箱密码认证（供 H5 使用）。
 *
 * ## 为什么需要它
 *
 * 小程序有 `wx.login` 换 code，网页端没有。H5 要接同一套后端，
 * 就必须有一种独立的登录凭证，否则「一套后端管所有端」不成立。
 *
 * ## 密码存储
 *
 * PBKDF2-SHA256（10 万次迭代）+ 每用户独立随机盐，格式：
 *
 *     pbkdf2$100000$<salt-b64url>$<hash-b64url>
 *
 * 明文密码从不落库、不进日志。迭代次数写在串里，将来调高也能老密码照常验。
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

/**
 * 校验密码。
 *
 * 用**恒定时间比较**（逐字节异或累加），避免通过响应时间差猜出哈希前缀。
 * 虽然 PBKDF2 本身已让时序攻击不现实，但这一步成本几乎为零，没有理由不做。
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromB64url(parts[2]!);
    expected = fromB64url(parts[3]!);
  } catch {
    return false;
  }

  const actual = await derive(password, salt, iterations);
  if (actual.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}

/** 邮箱规范化：去空白 + 转小写。不做这一步会导致 A@x.com 和 a@x.com 注册成两个账号 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}

/** 密码策略：8 位起，且不能全是同一字符（挡掉 88888888 这种） */
export function isValidPassword(password: string): { ok: boolean; reason?: string } {
  if (password.length < 8) return { ok: false, reason: "密码至少 8 位" };
  if (password.length > 128) return { ok: false, reason: "密码最长 128 位" };
  if (new Set(password).size === 1) return { ok: false, reason: "密码太简单" };
  return { ok: true };
}
