/**
 * 记账币种。
 *
 * 币种存在项目上，金额本身只存数字。展示、导出、提示词都从这里取符号，
 * 免得一处写死人民币、另一处写死美元。
 *
 * 只收常见几种：多到能覆盖目标客户，少到能记住每个符号。
 * 认不出的代码一律退回 USD——写进库的值必须能显示出来。
 */

const SYMBOLS: Record<string, string> = {
  USD: "$",
  CNY: "¥",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CAD: "CA$",
  AUD: "A$",
  SGD: "S$",
  HKD: "HK$",
};

/** 新建项目时可选的币种，顺序即下拉顺序 */
export const SUPPORTED_CURRENCIES = Object.keys(SYMBOLS);

export function normalizeCurrency(value: unknown, fallback = "USD"): string {
  const code = String(value ?? "").trim().toUpperCase();
  return SYMBOLS[code] ? code : fallback;
}

export function currencySymbol(code: string | null | undefined): string {
  return SYMBOLS[normalizeCurrency(code)] ?? "$";
}
