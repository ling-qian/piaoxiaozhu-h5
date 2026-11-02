/**
 * 业务常量。
 *
 * ## 为什么只剩分类表
 *
 * 原来这里还有 `MERCHANT_DICT`（美团、饿了么、抖音…）和 `KEYWORD_MAP`
 * （中文关键词 → 分类码），用来在**浏览器里**按商户名和关键词猜分类。
 *
 * 那套逻辑已经废弃：分类改由后端在 OCR 之后用模型完成，前端不再猜。
 * 两个表在 2026-10 审计时确认零引用，已删除——留着会让人以为分类逻辑还在前端，
 * 而且里面全是中文平台名，对海外版没有意义。
 *
 * ## 分类为什么不换一套
 *
 * 这 8 个分类是餐饮场景的通用结构：食材、房租、工资、水电燃气、平台佣金、
 * 广告推广、办公用品、其他。欧美餐厅同样适用——DoorDash、Uber Eats 一样抽佣，
 * 食材、房租、人力一样是主要成本项。
 *
 * 所以海外版不需要换分类，只需要换标签：`labelKey` 指向 i18n 条目，
 * 显示时用 `categoryLabel(code, t)` 取当前语言的名字。
 */

export const CATEGORIES = [
  { code: "food_material", name: "食材", labelKey: "cat.food_material", l1: "食材", l2: "食材", color: "#FF6B35" },
  { code: "rent", name: "房租", labelKey: "cat.rent", l1: "房租", l2: "房租", color: "#722ED1" },
  { code: "salary", name: "工资", labelKey: "cat.salary", l1: "工资", l2: "工资", color: "#1890FF" },
  { code: "utilities", name: "水电燃气", labelKey: "cat.utilities", l1: "水电燃气", l2: "水电燃气", color: "#13C2C2" },
  { code: "platform_fee", name: "平台佣金", labelKey: "cat.platform_fee", l1: "平台佣金", l2: "平台佣金", color: "#EB2F96" },
  { code: "advertising", name: "广告推广", labelKey: "cat.advertising", l1: "广告推广", l2: "广告推广", color: "#FAAD14" },
  { code: "office", name: "办公用品", labelKey: "cat.office", l1: "办公用品", l2: "办公用品", color: "#52C41A" },
  { code: "other", name: "其他", labelKey: "cat.other", l1: "其他", l2: "其他", color: "#999999" },
] as const;

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.code, c])
) as Record<string, (typeof CATEGORIES)[number]>;

/**
 * 中文分类名 → 内置分类码。
 *
 * 服务器端的分类器（`v1/apps/api-worker/src/lib/categorize.ts`）用的是另一套
 * 中文短名：水电、广告、办公。AI 记账还把中文名直接当 code 存进了记录表。
 * 这些记录拿到前端时，`category_code` 里就是中文，查不到 CATEGORY_MAP，
 * 于是英文界面又显示成中文。
 *
 * 这张表把后端真实出现过的名字映射回 code。它不猜：
 * 每一项都能在后端分类器或本文件 CATEGORIES 里找到同名的一级分类。
 */
const CODE_ALIASES: Record<string, string> = {
  食材: "food_material",
  房租: "rent",
  工资: "salary",
  水电: "utilities",
  水电燃气: "utilities",
  平台佣金: "platform_fee",
  广告: "advertising",
  广告推广: "advertising",
  办公: "office",
  办公用品: "office",
  其他: "other",
  未分类: "other",
  // 2026-11 之前海外版识别用的 11 类通用科目。模板换成餐饮八类后，
  // 旧记录仍带着这些 code；映射过来，历史账目不会在界面上显示成孤儿。
  meals: "food_material",
  travel: "other",
  transport: "other",
  software: "other",
  marketing: "advertising",
  professional: "other",
  equipment: "other",
};

/** 把 code 或中文分类名统一解析成内置分类码；都不认识时返回 undefined */
export function resolveCategoryCode(code: string): string | undefined {
  if (CATEGORY_MAP[code]) return code;
  return CODE_ALIASES[code];
}

/**
 * 取分类的显示名。
 *
 * `t` 由调用方传入，不在这里 import i18n：`constants.ts` 也被服务端代码引用，
 * 而 i18n 是带 `"use client"` 的模块，反向依赖会把服务端代码拖进客户端边界。
 *
 * 不传 `t` 时回落到中文名——只在确实没有语言上下文的场合用（例如数据导出）。
 * 分类码和中文名都不认识时，原样返回传入的值，避免把真实分类压成「其他」。
 */
export function categoryLabel(code: string, t?: (key: string) => string): string {
  const resolved = resolveCategoryCode(code);
  const cat = resolved ? CATEGORY_MAP[resolved] : undefined;
  if (!cat) return code || (t ? t("cat.other") : "其他");
  return t ? t(cat.labelKey) : cat.name;
}

export const DIRECTION_LABELS = {
  out: "支出",
  income: "收入",
} as const;

/** 列表分页大小 */
export const PAGE_SIZE = 20;
