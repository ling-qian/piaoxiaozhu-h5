/**
 * 套餐配置 - 统一管理所有套餐的限制和价格
 */

export interface PlanConfig {
  name: string;
  desc: string;
  price: number; // 月费（分）
  priceYuan: string; // 显示价格（元）
  unit: string;
  invoiceLimit: number; // 每月发票识别次数，-1 表示无限
  projectLimit: number; // 项目数量上限，-1 表示无限
  aiQuota: number; // AI 分析次数/月，-1 表示无限
  canExport: boolean; // 是否可以导出数据
  canCostOptimize: boolean; // 成本优化方案
  canMultiStore: boolean; // 多门店对比
  canAdvisior: boolean; // 专属财务顾问
  gradient: string;
  accentColor: string;
  badge?: string;
}

export const PLANS: Record<string, PlanConfig> = {
  free: {
    name: "免费版",
    desc: "适合个人体验记账",
    price: 0,
    priceYuan: "0",
    unit: "",
    invoiceLimit: 5,
    projectLimit: 1,
    aiQuota: 0,
    canExport: false,
    canCostOptimize: false,
    canMultiStore: false,
    canAdvisior: false,
    gradient: "from-[#E8E8E8] to-[#D4D4D4]",
    accentColor: "#999999",
  },
  pro: {
    name: "专业版",
    desc: "适合中小商户经营分析",
    price: 2900,
    priceYuan: "29",
    unit: "/月",
    invoiceLimit: 200,
    projectLimit: 10,
    aiQuota: 20,
    canExport: true,
    canCostOptimize: true,
    canMultiStore: false,
    canAdvisior: false,
    gradient: "from-[#FF6B35] to-[#FF8F65]",
    accentColor: "#FF6B35",
    badge: "推荐",
  },
  enterprise: {
    name: "企业版",
    desc: "适合连锁门店深度分析",
    price: 9900,
    priceYuan: "99",
    unit: "/月",
    invoiceLimit: -1,
    projectLimit: -1,
    aiQuota: -1,
    canExport: true,
    canCostOptimize: true,
    canMultiStore: true,
    canAdvisior: true,
    gradient: "from-[#722ED1] to-[#9254DE]",
    accentColor: "#722ED1",
  },
};

export function getPlanConfig(planCode: string): PlanConfig {
  return PLANS[planCode] || PLANS.free;
}

/** 检查发票识别是否超额 — 需要传入当月已用次数 */
export function checkInvoiceLimit(planCode: string, usedThisMonth: number): { allowed: boolean; limit: number; used: number } {
  const config = getPlanConfig(planCode);
  const limit = config.invoiceLimit;
  return {
    allowed: limit === -1 || usedThisMonth < limit,
    limit,
    used: usedThisMonth,
  };
}

/** 检查项目数量是否超额 — 需要传入当前项目数 */
export function checkProjectLimit(planCode: string, currentCount: number): { allowed: boolean; limit: number; current: number } {
  const config = getPlanConfig(planCode);
  const limit = config.projectLimit;
  return {
    allowed: limit === -1 || currentCount < limit,
    limit,
    current: currentCount,
  };
}

/** 检查 AI 分析配额 */
export function checkAiQuota(planCode: string, used: number): { allowed: boolean; limit: number; used: number } {
  const config = getPlanConfig(planCode);
  const limit = config.aiQuota;
  return {
    allowed: limit === -1 || used < limit,
    limit,
    used,
  };
}

/** 检查数据导出权限 */
export function checkExportPermission(planCode: string): boolean {
  return getPlanConfig(planCode).canExport;
}
