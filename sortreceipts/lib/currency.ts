/**
 * 币种与价格展示。
 *
 * ## 为什么默认 USD
 *
 * H5 首发面向海外，所以默认显示美元。国内用户走小程序，那边用微信支付、
 * 显示人民币，两套价格各自定价，不做实时汇率换算。
 *
 * 需要切回人民币时，在 `.env` 里配 `NEXT_PUBLIC_CURRENCY=CNY` 即可，
 * 不用改代码。
 *
 * ## 为什么不在这里做换算
 *
 * 后端同时下发人民币和美元标价，前端只挑一个显示。若在这里按汇率算，
 * 页面显示的价格和支付网关实际扣款可能差几美分——用户会觉得被多收了。
 */

export type Currency = "CNY" | "USD";

/** 当前站点币种。非法值回落到 USD，避免配错了整站价格变成 NaN */
export const CURRENCY: Currency =
  process.env.NEXT_PUBLIC_CURRENCY === "CNY" ? "CNY" : "USD";

const SYMBOL: Record<Currency, string> = { CNY: "¥", USD: "$" };

/**
 * 格式化标价。
 *
 * 入参是两个币种的「元」价格，由后端给出。当前币种缺失时退回另一个，
 * 而不是显示 0——价格显示成 0 比显示另一种货币更容易引起误会。
 */
export function formatPrice(priceCny: number, priceUsd: number, currency: Currency = CURRENCY): string {
  const [value, cur] = currency === "USD"
    ? [priceUsd || priceCny, "USD" as Currency]
    : [priceCny || priceUsd, "CNY" as Currency];

  // 美元习惯 $3.99，人民币习惯 ¥29（整数不补小数）
  const text = cur === "USD" ? value.toFixed(2) : Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${SYMBOL[cur]}${text}`;
}

/**
 * 当前币种符号。
 *
 * 账目类金额只有「一个数字」，没有随单据存币种，所以不需要在两种货币间挑选，
 * 只要符号对得上当前站点即可。`formatPrice` 处理的是商品标价（后端同时给两个价），
 * 两者用途不同。
 */
export const CURRENCY_SYMBOL: string = SYMBOL[CURRENCY];

/**
 * 账目金额的显示。
 *
 * 负号放在货币符号前面（`-$120.00`），而不是 `$-120.00`：
 * 后者在英文语境里几乎看不到，读起来像格式出错。
 */
export function formatMoney(amount: number): string {
  const value = Number(amount) || 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}${CURRENCY_SYMBOL}${Math.abs(value).toFixed(2)}`;
}

/**
 * 数字格式化用的 locale。
 *
 * 固定住而不是用浏览器默认值：服务端渲染和客户端水合时如果 locale 不同，
 * 同一个数字会格式化成不同字符串（`1,234.56` 与 `1.234,56`），
 * React 会报水合不匹配（错误 #418）。
 */
export const NUMBER_LOCALE: string = CURRENCY === "USD" ? "en-US" : "zh-CN";
