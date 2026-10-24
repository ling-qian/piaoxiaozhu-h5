/**
 * 票据身份与查重——从 `packages/core/piaoxiaozhu_core/invoice_identity.py` 移植。
 *
 * 指纹算法必须逐字节一致：线上已有记录的 invoice_fingerprint 是旧算法算的，
 * 换了算法会让历史记录与新记录对不上，查重直接失效（同一张票能重复入账）。
 */

const FINGERPRINT_VERSION = "v1";
export const STRENGTH_STRONG = "strong";
export const STRENGTH_WEAK = "weak";

/** 去空白、去分隔符、统一大写。发票号码/代码/税号都是纯字母数字。 */
export function normalizeIdentity(value?: string | null): string {
  if (!value) return "";
  return String(value).replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function isEinvoiceNo(no?: string | null): boolean {
  const v = normalizeIdentity(no);
  return v.length === 20 && /^\d+$/.test(v);
}

/** SHA-256 前 40 位十六进制——与 Python 的 hashlib.sha256(...).hexdigest()[:40] 一致 */
async function digest(payload: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${FINGERPRINT_VERSION}:${hex.slice(0, 40)}`;
}

export interface FingerprintInput {
  invoiceType?: string | null;
  invoiceCode?: string | null;
  invoiceNo?: string | null;
  sellerTaxNo?: string | null;
  invoiceDate?: string | null;
  totalAmountCents?: number | null;
}

/** 返回 [指纹, 强度]，拿不到可用身份字段时返回 null */
export async function invoiceFingerprint(
  input: FingerprintInput
): Promise<[string, string] | null> {
  const no = normalizeIdentity(input.invoiceNo);
  const code = normalizeIdentity(input.invoiceCode);
  const typeKey = normalizeIdentity(input.invoiceType) || "unknown";

  if (no) {
    // 数电票没有代码，号码单独即可定位；传统发票把代码一并纳入，
    // 避免不同年份/版式的号码空间重叠。
    return [await digest(`${typeKey}|${code}|${no}`), STRENGTH_STRONG];
  }

  const seller = normalizeIdentity(input.sellerTaxNo);
  const date = normalizeIdentity(input.invoiceDate);
  const amount = input.totalAmountCents;
  if (seller && date && amount !== null && amount !== undefined && amount > 0) {
    return [await digest(`${typeKey}|${seller}|${date}|${amount}`), STRENGTH_WEAK];
  }

  return null;
}
