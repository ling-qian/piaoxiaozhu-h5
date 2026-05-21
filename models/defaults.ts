import { prisma } from "@/lib/db"

export const DEFAULT_PROMPT_ANALYSE_NEW_FILE = `You are a receipt extraction assistant for restaurant bookkeeping.

你正在处理餐饮门店的成本票据。请从票据图片中提取结构化字段，并返回 JSON。

Extract only these fields:

{fields}

Available category codes:

{categories}

Rules:
- 这是餐饮经营成本票据整理任务
- categoryCode 只能从 {categories.code} 中选择
- issuedAt 使用 YYYY-MM-DD
- total 是票据总金额
- taxAmount 只有在票据明确显示税额时才填写
- merchant 保留票据原始商户名称
- text 尽量提取全部可见文字
- 不确定就留空，不要编造
- 只返回一个 JSON 对象，不要输出解释`

export const DEFAULT_SETTINGS = [
  {
    code: "default_currency",
    name: "Default Currency",
    description: "Default currency for the restaurant POC",
    value: "CNY",
  },
  {
    code: "default_category",
    name: "Default Category",
    description: "",
    value: "other",
  },
  {
    code: "default_project",
    name: "Default Project",
    description: "",
    value: "restaurant_poc",
  },
  {
    code: "default_type",
    name: "Default Type",
    description: "",
    value: "expense",
  },
  {
    code: "prompt_analyse_new_file",
    name: "Prompt for Analyze Transaction",
    description: "Allowed variables: {fields}, {categories}, {categories.code}, {projects}, {projects.code}",
    value: DEFAULT_PROMPT_ANALYSE_NEW_FILE,
  },
  {
    code: "is_welcome_message_hidden",
    name: "Do not show welcome message on dashboard",
    description: "",
    value: "false",
  },
]

export const DEFAULT_CATEGORIES = [
  {
    code: "food_material",
    name: "食材",
    color: "#2b8a3e",
    llm_prompt: "ingredients, vegetables, meat, seafood, frozen food, grain, oil, seasoning, disposable catering supplies",
  },
  {
    code: "rent",
    name: "房租",
    color: "#a61e4d",
    llm_prompt: "shop rent, lease, property rental, venue rent",
  },
  {
    code: "salary",
    name: "工资",
    color: "#5f3dc4",
    llm_prompt: "salary, wages, payroll, labor service payment",
  },
  {
    code: "utilities",
    name: "水电",
    color: "#1c7ed6",
    llm_prompt: "water bill, electricity bill, gas bill, utility cost",
  },
  {
    code: "platform_fee",
    name: "平台佣金",
    color: "#e67700",
    llm_prompt: "platform commission, delivery platform fee, meituan fee, eleme fee, service fee",
  },
  {
    code: "other",
    name: "其他",
    color: "#495057",
    llm_prompt: "other restaurant operating cost that does not fit other categories",
  },
]

export const DEFAULT_PROJECTS = [
  { code: "restaurant_poc", name: "餐饮 POC", llm_prompt: "restaurant business operating expenses", color: "#1e202b" },
]

export const DEFAULT_CURRENCIES = [
  { code: "USD", name: "$" },
  { code: "EUR", name: "€" },
  { code: "GBP", name: "£" },
  { code: "INR", name: "₹" },
  { code: "AUD", name: "$" },
  { code: "CAD", name: "$" },
  { code: "SGD", name: "$" },
  { code: "CHF", name: "Fr" },
  { code: "MYR", name: "RM" },
  { code: "JPY", name: "¥" },
  { code: "CNY", name: "¥" },
  { code: "NZD", name: "$" },
  { code: "THB", name: "฿" },
  { code: "HUF", name: "Ft" },
  { code: "AED", name: "د.إ" },
  { code: "HKD", name: "$" },
  { code: "MXN", name: "$" },
  { code: "ZAR", name: "R" },
  { code: "PHP", name: "₱" },
  { code: "SEK", name: "kr" },
  { code: "IDR", name: "Rp" },
  { code: "BRL", name: "R$" },
  { code: "SAR", name: "﷼" },
  { code: "TRY", name: "₺" },
  { code: "KES", name: "KSh" },
  { code: "KRW", name: "₩" },
  { code: "EGP", name: "£" },
  { code: "IQD", name: "ع.د" },
  { code: "NOK", name: "kr" },
  { code: "KWD", name: "د.ك" },
  { code: "RUB", name: "₽" },
  { code: "DKK", name: "kr" },
  { code: "PKR", name: "₨" },
  { code: "ILS", name: "₪" },
  { code: "PLN", name: "zł" },
  { code: "QAR", name: "﷼" },
  { code: "OMR", name: "﷼" },
  { code: "COP", name: "$" },
  { code: "CLP", name: "$" },
  { code: "TWD", name: "NT$" },
  { code: "ARS", name: "$" },
  { code: "CZK", name: "Kč" },
  { code: "VND", name: "₫" },
  { code: "MAD", name: "د.م." },
  { code: "JOD", name: "د.ا" },
  { code: "BHD", name: ".د.ب" },
  { code: "XOF", name: "CFA" },
  { code: "LKR", name: "₨" },
  { code: "UAH", name: "₴" },
  { code: "NGN", name: "₦" },
  { code: "TND", name: "د.ت" },
  { code: "UGX", name: "USh" },
  { code: "RON", name: "lei" },
  { code: "BDT", name: "৳" },
  { code: "PEN", name: "S/" },
  { code: "GEL", name: "₾" },
  { code: "XAF", name: "FCFA" },
  { code: "FJD", name: "$" },
  { code: "VEF", name: "Bs" },
  { code: "VES", name: "Bs.S" },
  { code: "BYN", name: "Br" },
  { code: "UZS", name: "лв" },
  { code: "BGN", name: "лв" },
  { code: "DZD", name: "د.ج" },
  { code: "IRR", name: "﷼" },
  { code: "DOP", name: "RD$" },
  { code: "ISK", name: "kr" },
  { code: "CRC", name: "₡" },
  { code: "SYP", name: "£" },
  { code: "JMD", name: "J$" },
  { code: "LYD", name: "ل.د" },
  { code: "GHS", name: "₵" },
  { code: "MUR", name: "₨" },
  { code: "AOA", name: "Kz" },
  { code: "UYU", name: "$U" },
  { code: "AFN", name: "؋" },
  { code: "LBP", name: "ل.ل" },
  { code: "XPF", name: "₣" },
  { code: "TTD", name: "TT$" },
  { code: "TZS", name: "TSh" },
  { code: "ALL", name: "Lek" },
  { code: "XCD", name: "$" },
  { code: "GTQ", name: "Q" },
  { code: "NPR", name: "₨" },
  { code: "BOB", name: "Bs." },
  { code: "ZWD", name: "Z$" },
  { code: "BBD", name: "$" },
  { code: "CUC", name: "$" },
  { code: "LAK", name: "₭" },
  { code: "BND", name: "$" },
  { code: "BWP", name: "P" },
  { code: "HNL", name: "L" },
  { code: "PYG", name: "₲" },
  { code: "ETB", name: "Br" },
  { code: "NAD", name: "$" },
  { code: "PGK", name: "K" },
  { code: "SDG", name: "ج.س." },
  { code: "MOP", name: "MOP$" },
  { code: "BMD", name: "$" },
  { code: "NIO", name: "C$" },
  { code: "BAM", name: "KM" },
  { code: "KZT", name: "₸" },
  { code: "PAB", name: "B/." },
  { code: "GYD", name: "$" },
  { code: "YER", name: "﷼" },
  { code: "MGA", name: "Ar" },
  { code: "KYD", name: "$" },
  { code: "MZN", name: "MT" },
  { code: "RSD", name: "дин." },
  { code: "SCR", name: "₨" },
  { code: "AMD", name: "֏" },
  { code: "AZN", name: "₼" },
  { code: "SBD", name: "$" },
  { code: "SLL", name: "Le" },
  { code: "TOP", name: "T$" },
  { code: "BZD", name: "BZ$" },
  { code: "GMD", name: "D" },
  { code: "MWK", name: "MK" },
  { code: "BIF", name: "FBu" },
  { code: "HTG", name: "G" },
  { code: "SOS", name: "S" },
  { code: "GNF", name: "FG" },
  { code: "MNT", name: "₮" },
  { code: "MVR", name: "Rf" },
  { code: "CDF", name: "FC" },
  { code: "STN", name: "Db" },
  { code: "TJS", name: "ЅМ" },
  { code: "KPW", name: "₩" },
  { code: "KGS", name: "лв" },
  { code: "LRD", name: "$" },
  { code: "LSL", name: "L" },
  { code: "MMK", name: "K" },
  { code: "GIP", name: "£" },
  { code: "MDL", name: "L" },
  { code: "CUP", name: "₱" },
  { code: "KHR", name: "៛" },
  { code: "MKD", name: "ден" },
  { code: "VUV", name: "VT" },
  { code: "ANG", name: "ƒ" },
  { code: "MRU", name: "UM" },
  { code: "SZL", name: "L" },
  { code: "CVE", name: "$" },
  { code: "SRD", name: "$" },
  { code: "SVC", name: "$" },
  { code: "BSD", name: "$" },
  { code: "RWF", name: "R₣" },
  { code: "AWG", name: "ƒ" },
  { code: "BTN", name: "Nu." },
  { code: "DJF", name: "Fdj" },
  { code: "KMF", name: "CF" },
  { code: "ERN", name: "Nfk" },
  { code: "FKP", name: "£" },
  { code: "SHP", name: "£" },
  { code: "WST", name: "WS$" },
  { code: "JEP", name: "£" },
  { code: "TMT", name: "m" },
  { code: "GGP", name: "£" },
  { code: "IMP", name: "£" },
  { code: "TVD", name: "$" },
  { code: "ZMW", name: "ZK" },
  { code: "ADA", name: "Crypto" },
  { code: "BCH", name: "Crypto" },
  { code: "BTC", name: "Crypto" },
  { code: "CLF", name: "UF" },
  { code: "CNH", name: "¥" },
  { code: "DOGE", name: "Crypto" },
  { code: "DOT", name: "Crypto" },
  { code: "ETH", name: "Crypto" },
  { code: "LINK", name: "Crypto" },
  { code: "LTC", name: "Crypto" },
  { code: "LUNA", name: "Crypto" },
  { code: "SLE", name: "Le" },
  { code: "UNI", name: "Crypto" },
  { code: "XBT", name: "Crypto" },
  { code: "XLM", name: "Crypto" },
  { code: "XRP", name: "Crypto" },
  { code: "ZWL", name: "$" },
]

export const DEFAULT_FIELDS = [
  {
    code: "merchant",
    name: "商户名称",
    type: "string",
    llm_prompt: "merchant or supplier name, keep original visible wording",
    isVisibleInList: true,
    isVisibleInAnalysis: true,
    isRequired: true,
    isExtra: false,
  },
  {
    code: "issuedAt",
    name: "日期",
    type: "string",
    llm_prompt: "invoice or receipt date in YYYY-MM-DD format",
    isVisibleInList: true,
    isVisibleInAnalysis: true,
    isRequired: true,
    isExtra: false,
  },
  {
    code: "total",
    name: "金额",
    type: "number",
    llm_prompt: "total amount paid on the receipt or invoice",
    isVisibleInList: true,
    isVisibleInAnalysis: true,
    isRequired: true,
    isExtra: false,
  },
  {
    code: "categoryCode",
    name: "分类",
    type: "string",
    llm_prompt: "restaurant expense category code, one of: {categories.code}",
    isVisibleInList: true,
    isVisibleInAnalysis: true,
    isRequired: true,
    isExtra: false,
  },
  {
    code: "taxAmount",
    name: "税额",
    type: "number",
    llm_prompt: "tax amount if clearly shown on the receipt, otherwise leave empty",
    isVisibleInList: false,
    isVisibleInAnalysis: true,
    isRequired: false,
    isExtra: true,
  },
  {
    code: "note",
    name: "备注",
    type: "string",
    llm_prompt: "",
    isVisibleInList: false,
    isVisibleInAnalysis: true,
    isRequired: false,
    isExtra: false,
  },
  {
    code: "text",
    name: "识别文本",
    type: "string",
    llm_prompt: "extract all visible text from the receipt or invoice",
    isVisibleInList: false,
    isVisibleInAnalysis: false,
    isRequired: false,
    isExtra: false,
  },
]

export async function createUserDefaults(userId: string) {
  // Default projects
  for (const project of DEFAULT_PROJECTS) {
    await prisma.project.upsert({
      where: { userId_code: { code: project.code, userId } },
      update: { name: project.name, color: project.color, llm_prompt: project.llm_prompt },
      create: { ...project, userId },
    })
  }

  // Default categories
  for (const category of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { userId_code: { code: category.code, userId } },
      update: { name: category.name, color: category.color, llm_prompt: category.llm_prompt },
      create: { ...category, userId },
    })
  }

  // Default currencies
  for (const currency of DEFAULT_CURRENCIES) {
    await prisma.currency.upsert({
      where: { userId_code: { code: currency.code, userId } },
      update: { name: currency.name },
      create: { ...currency, userId },
    })
  }

  // Default fields
  for (const field of DEFAULT_FIELDS) {
    await prisma.field.upsert({
      where: { userId_code: { code: field.code, userId } },
      update: {
        name: field.name,
        type: field.type,
        llm_prompt: field.llm_prompt,
        isVisibleInList: field.isVisibleInList,
        isVisibleInAnalysis: field.isVisibleInAnalysis,
        isRequired: field.isRequired,
        isExtra: field.isExtra,
      },
      create: { ...field, userId },
    })
  }

  // Default settings
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { userId_code: { code: setting.code, userId } },
      update: { name: setting.name, description: setting.description, value: setting.value },
      create: { ...setting, userId },
    })
  }
}

export async function isDatabaseEmpty(userId: string) {
  const fieldsCount = await prisma.field.count({ where: { userId } })
  return fieldsCount === 0
}
