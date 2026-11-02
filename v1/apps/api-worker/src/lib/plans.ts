/**
 * 套餐配置——与旧后端 `services/api/app/services/plan_config.py` 逐字段对齐。
 *
 * 放代码里而不是读 plans 表：旧实现就是代码常量，DB 里的 plans 表只作展示/历史。
 * 若这里改成读表，两端行为会出现分叉（例如免费版是否能导出）。
 *
 * ## 币种
 *
 * 国内走微信支付，单位是人民币分；海外走 Stripe / PayPal，单位是美分。
 * 两套价格**各自独立定价**，不做实时汇率换算——汇率波动会让用户看到价格
 * 上下跳，而且支付网关的金额必须在创建订单时就固定。
 */

export type Currency = "CNY" | "USD";

export interface PlanConfig {
  code: string;
  name: string;
  desc: string;
  /** 人民币单价（分）。0 表示免费，不参与微信支付 */
  priceCents: number;
  /** 美元单价（美分）。缺失表示该套餐不向海外售卖 */
  priceCentsUsd?: number;
  /** 每月发票识别上限，-1 表示无限 */
  invoiceLimit: number;
  projectLimit: number;
  canExport: boolean;
  features: string[];
  /** 每月发放积分；免费版为 0（靠注册赠送与签到） */
  pointsGrant: number;
}

export const UNLIMITED = -1;
export const DEFAULT_PLAN_CODE = "free";

export const PLANS: Record<string, PlanConfig> = {
  free: {
    code: "free",
    name: "免费版",
    desc: "适合个人体验记账",
    priceCents: 0,
    // 5 张是转化设计，不是成本约束。2026-11-02 实测 50 张真实票据，
    // 单张模型成本约 0.015 美分，5 张不到 0.001 美元。
    invoiceLimit: 5,
    projectLimit: 1,
    canExport: false,
    features: ["注册送 30 积分", "每日签到 +2 积分", "1个项目", "基础报表"],
    pointsGrant: 0,
  },
  pro: {
    code: "pro",
    name: "专业版",
    desc: "适合中小商户经营分析",
    priceCents: 2900,
    // ¥29 按约 7.27 汇率折算，取整到 .99 让价格看起来是零售价而不是换算价
    priceCentsUsd: 399,
    // 200 张的依据来自同一批实测：按刊例价满额使用约 0.031 美元/月，
    // 占 $3.99 售价的 0.8%。额度不必下调，真正的约束是免费档 10 次/分钟的出口限流。
    invoiceLimit: 200,
    projectLimit: 10,
    canExport: true,
    features: ["每月300积分", "10个项目", "数据导出"],
    pointsGrant: 300,
  },
  enterprise: {
    code: "enterprise",
    name: "企业版",
    desc: "适合连锁门店深度分析",
    priceCents: 9900,
    priceCentsUsd: 1399,
    invoiceLimit: UNLIMITED,
    projectLimit: UNLIMITED,
    canExport: true,
    features: ["每月1200积分", "无限项目", "数据导出"],
    pointsGrant: 1200,
  },
};

/** 该套餐在某币种下的标价（最小单位）。不支持该币种时返回 0 */
export function planPrice(plan: PlanConfig, currency: Currency): number {
  if (currency === "USD") return plan.priceCentsUsd ?? 0;
  return plan.priceCents;
}

export function getPlan(code?: string | null): PlanConfig {
  return PLANS[code ?? DEFAULT_PLAN_CODE] ?? PLANS[DEFAULT_PLAN_CODE]!;
}

/**
 * 按到期时间惰性判定有效套餐——与旧实现一致。
 *
 * 为什么不靠定时任务降级：调度挂掉时用户会白嫖，或者反过来被提前降级。
 * 读取时判定的成本可以忽略，且永远不会错。
 */
export function effectivePlanCode(
  planCode: string | null | undefined,
  expiresAt: string | null | undefined
): string {
  const code = planCode || DEFAULT_PLAN_CODE;
  if (!expiresAt) return code;
  const exp = Date.parse(expiresAt);
  if (Number.isNaN(exp)) return code;
  return exp < Date.now() ? DEFAULT_PLAN_CODE : code;
}

/** 距到期天数（向上取整，已过期为负）；无到期时间返回 null */
export function daysUntil(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const exp = Date.parse(expiresAt);
  if (Number.isNaN(exp)) return null;
  return Math.ceil((exp - Date.now()) / 86_400_000);
}

// --------------------------------------------------------------------------- 周期与积分包

export interface PeriodOption {
  months: number;
  label: string;
  /** 1.0 = 原价，0.9 = 9 折 */
  discount: number;
}

export const PERIOD_OPTIONS: PeriodOption[] = [
  { months: 1, label: "1 个月", discount: 1.0 },
  { months: 3, label: "3 个月", discount: 0.9 },
  { months: 12, label: "12 个月", discount: 0.8 },
];

export function getPeriod(months: number): PeriodOption | undefined {
  return PERIOD_OPTIONS.find((p) => p.months === months);
}

/** 该周期应付金额（最小单位）。未支持的周期回退到按月原价，避免算错钱 */
export function periodPriceCents(plan: PlanConfig, months: number, currency: Currency = "CNY"): number {
  const unit = planPrice(plan, currency);
  const option = getPeriod(months);
  if (!option) return unit * months;
  // 与 Python 的 round() 一致：这里金额都是整数分，四舍五入方向不影响结果，
  // 但仍显式取整，避免浮点误差带进支付金额。
  return Math.round(unit * months * option.discount);
}

/** 该周期发放积分。折扣不克扣额度，按整月倍数给 */
export function periodPoints(plan: PlanConfig, months: number): number {
  return plan.pointsGrant * months;
}

export interface PointPackage {
  code: string;
  name: string;
  points: number;
  /** 人民币单价（分） */
  priceCents: number;
  /** 美元单价（美分） */
  priceCentsUsd: number;
}

/**
 * 积分包：与套餐共用下单流程，但不改变 plan_code。
 *
 * 定价刻意高于套餐内单价（pro 是 $3.99/300 分 ≈ $0.0133/分），否则
 * 「买套餐」永远不如「买积分」，套餐就卖不动了。套餐的溢价换的是
 * 项目数与导出能力。
 *
 * 美元价按约 7.27 汇率折算后取整到 .99。$1.99 那档被 Stripe 抽走
 * 2.9%+$0.30 之后只剩约 $1.63，是能接受的下限——再低就不值得单独卖。
 */
export const POINT_PACKAGES: Record<string, PointPackage> = {
  points_100: {
    code: "points_100",
    name: "100 积分",
    points: 100,
    priceCents: 1200,
    priceCentsUsd: 199,
  },
  points_500: {
    code: "points_500",
    name: "500 积分",
    points: 500,
    priceCents: 5500,
    priceCentsUsd: 799,
  },
  points_1200: {
    code: "points_1200",
    name: "1200 积分",
    points: 1200,
    priceCents: 12600,
    priceCentsUsd: 1799,
  },
};

export function isPointPackage(code: string): boolean {
  return code in POINT_PACKAGES;
}

/** 积分包在某币种下的标价（最小单位） */
export function packagePrice(pkg: PointPackage, currency: Currency): number {
  return currency === "USD" ? pkg.priceCentsUsd : pkg.priceCents;
}

/** 续费后的到期时间：未过期则在原到期日上顺延，过期则从现在算 */
export function renewalExpiry(current: string | null | undefined, months: number): string {
  const now = Date.now();
  const base =
    current && !Number.isNaN(Date.parse(current)) && Date.parse(current) > now
      ? Date.parse(current)
      : now;
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}
