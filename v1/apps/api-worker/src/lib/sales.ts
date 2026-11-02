/**
 * 营业额与毛利的纯计算。
 *
 * 口径只有一条：毛利 = 当月营业额 − 当月票据支出，不做税务调整。
 * 会计口径的每一层修正都会让「页面上的数」和「会计算的数」拉开，
 * 所以这里只做减法，把所有修正留在交付包里由人判断。
 */

export interface SaleDay {
  sale_date: string;
  amount: number;
  note?: string | null;
}

export interface SalesSummary {
  revenue: number;
  expense: number;
  gross_profit: number;
  /** 毛利率百分比，营业额为 0 时记 0 */
  margin: number;
  /** 本月记了几天，用来提示还差多少天 */
  days_count: number;
}

/** 金额上限与票据记录一致，避免两张表能接受的数不一样 */
const AMOUNT_LIMIT = 9_999_999_999.99;

const toCents = (value: number | null | undefined): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const yuan = (cents: number): number => Math.round(cents) / 100;

export function isMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

/**
 * 校验 `YYYY-MM-DD` 并且是真实日期。
 *
 * 只测正则会把 2 月 30 日放进来；用一次 UTC 回parse 比对，
 * 不依赖运行环境的时区。
 */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** 金额规整：非法返回 null，合法则四舍五入到分并限制范围 */
export function normalizeSaleAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > AMOUNT_LIMIT) return null;
  return yuan(toCents(n));
}

/**
 * 月度汇总。
 *
 * 天数也一起算：只有营业额没有天数的话，用户不知道这个月还差多少天没填。
 */
export function summarizeSales(days: SaleDay[], expense: number, month: string): SalesSummary {
  let revenueCents = 0;
  let daysCount = 0;

  for (const day of days) {
    if (!day.sale_date.startsWith(month)) continue;
    revenueCents += toCents(day.amount);
    daysCount += 1;
  }

  const expenseCents = toCents(expense);
  const grossCents = revenueCents - expenseCents;

  return {
    revenue: yuan(revenueCents),
    expense: yuan(expenseCents),
    gross_profit: yuan(grossCents),
    margin: revenueCents > 0 ? Math.round((grossCents / revenueCents) * 10000) / 100 : 0,
    days_count: daysCount,
  };
}
