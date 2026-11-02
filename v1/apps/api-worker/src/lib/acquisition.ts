/**
 * 注册来源的规整。
 *
 * 推广链接会带 `utm_source`、`utm_medium`、`utm_campaign`。这些值是外部传进来的，
 * 不校验就会把任意字符串写进统计表。这里只保留小写字母、数字和 `. _ -`，
 * 最长 40 个字符；清洗后为空就当没有。
 */

export interface SignupSource {
  source: string;
  medium: string | null;
  campaign: string | null;
}

const MAX_LENGTH = 40;

export function normalizeSource(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;
  const cleaned = value.replace(/[^a-z0-9._-]/g, "");
  return cleaned ? cleaned.slice(0, MAX_LENGTH) : null;
}

/**
 * 把请求体里的 `src` 变成入库形状。
 *
 * 没有来源时记为 `direct`，这样渠道表里每一笔注册都有归属，
 * 不会出现「总数对不上渠道合计」。
 */
export function parseSignupSource(raw: unknown): SignupSource {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    source: normalizeSource(obj.source) ?? "direct",
    medium: normalizeSource(obj.medium),
    campaign: normalizeSource(obj.campaign),
  };
}
