export const CATEGORIES = [
  { code: "food_material", name: "食材", l1: "食材", l2: "食材", color: "#FF6B35" },
  { code: "rent", name: "房租", l1: "房租", l2: "房租", color: "#722ED1" },
  { code: "salary", name: "工资", l1: "工资", l2: "工资", color: "#1890FF" },
  { code: "utilities", name: "水电燃气", l1: "水电燃气", l2: "水电燃气", color: "#13C2C2" },
  { code: "platform_fee", name: "平台佣金", l1: "平台佣金", l2: "平台佣金", color: "#EB2F96" },
  { code: "advertising", name: "广告推广", l1: "广告推广", l2: "广告推广", color: "#FAAD14" },
  { code: "office", name: "办公用品", l1: "办公用品", l2: "办公用品", color: "#52C41A" },
  { code: "other", name: "其他", l1: "其他", l2: "其他", color: "#999999" },
] as const;

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.code, c])
) as Record<string, (typeof CATEGORIES)[number]>;

export const MERCHANT_DICT: Record<string, string> = {
  美团: "platform_fee",
  三快: "platform_fee",
  饿了么: "platform_fee",
  拉扎斯: "platform_fee",
  大众点评: "platform_fee",
  抖音: "advertising",
  字节跳动: "advertising",
  微信支付: "platform_fee",
  支付宝: "platform_fee",
};

/** 商户别名表：别名 → 主键（对应 MERCHANT_DICT 的 key） */
export const MERCHANT_ALIASES: Record<string, string> = {
  美团外卖: "美团",
  美团买菜: "美团",
  美团优选: "美团",
  美团到店: "美团",
  美团配送: "美团",
  饿了么星选: "饿了么",
  点评: "大众点评",
  大众点评网: "大众点评",
  抖音生活服务: "抖音",
  抖音电商: "抖音",
  抖音外卖: "抖音",
  头条: "字节跳动",
  今日头条: "字节跳动",
  飞书: "字节跳动",
  微信: "微信支付",
  财付通: "微信支付",
  蚂蚁金服: "支付宝",
  网商银行: "支付宝",
};

export const KEYWORD_MAP: Record<string, string> = {
  食材: "food_material",
  蔬菜: "food_material",
  肉类: "food_material",
  海鲜: "food_material",
  水果: "food_material",
  调料: "food_material",
  面粉: "food_material",
  食用油: "food_material",
  房租: "rent",
  租金: "rent",
  物业: "rent",
  工资: "salary",
  薪资: "salary",
  社保: "salary",
  公积金: "salary",
  水费: "utilities",
  电费: "utilities",
  燃气: "utilities",
  电力: "utilities",
  供水: "utilities",
  水电: "utilities",
  佣金: "platform_fee",
  服务费: "platform_fee",
  抽成: "platform_fee",
  推广: "advertising",
  广告: "advertising",
  宣传: "advertising",
  办公: "office",
  耗材: "office",
  纸张: "office",
};

export const DIRECTION_LABELS = {
  out: "支出",
  income: "收入",
} as const;

export const PAGE_SIZE = 20;
