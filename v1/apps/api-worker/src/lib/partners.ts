/**
 * 会计合作方的推荐码。
 *
 * 码是给人读、给人转发的：要大写、短、不含容易看错的字母。
 * 0/O、1/I 一律不要——口头念一遍就能错一位，归因就飞了。
 */

/** 去掉 0、O、1、I，剩 32 个字符。六位大约十亿种组合，够用且好念 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 对外转发的长码/短码都收，统一成大写；不合法返回 null，不抛错 */
export function normalizePartnerCode(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(value)) return null;
  // 全数字的码容易和订单号混在一起，不收
  if (/^\d+$/.test(value)) return null;
  return value;
}

/** 生成一个六位码。碰撞由调用方查库判断，这里只负责字符合法 */
export function generatePartnerCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  // 字母表里有数字，极小概率生成纯数字码；这种码会被 normalizePartnerCode 拒掉，换一个
  if (/^\d+$/.test(code)) return generatePartnerCode(length);
  return code;
}
