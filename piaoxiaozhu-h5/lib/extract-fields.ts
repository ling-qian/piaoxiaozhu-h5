import { cleanOcrText } from "./ocr";

export interface ExtractedFields {
  merchantName: string | null;
  totalAmount: number | null;
  taxAmount: number | null;
  invoiceDate: string | null;
  invoiceType: string | null;
  invoiceNo: string | null;
}

/* ───────── helpers ───────── */

function parseYuanToCents(valueStr: string): number {
  const cleaned = valueStr.replace(/[,，￥¥]/g, "").trim();
  const yuan = parseFloat(cleaned);
  if (isNaN(yuan)) return 0;
  return Math.round(yuan * 100);
}

function centsToYuan(cents: number): number {
  return Math.round(cents) / 100;
}

/** 判断一个数字字符串是否像金额（排除电话号码、订单号等） */
function looksLikeAmount(numStr: string): boolean {
  const cleaned = numStr.replace(/[,，]/g, "");
  // 纯整数且长度 >= 8 → 大概率是订单号/电话号/身份证片段
  if (/^\d{8,}$/.test(cleaned)) return false;
  // 包含小数点 → 更像金额
  if (cleaned.includes(".")) return true;
  // 7 位以下纯整数可能是金额（如 1200）
  if (/^\d{1,7}$/.test(cleaned)) return true;
  return false;
}

/* ───────── 发票号码 ───────── */

const INVOICE_NO_PATTERNS = [
  /发票号码\s*[：:]\s*(\d{8,20})/,
  /No\.?\s*[：:]\s*(\d{8,20})/,
  /号码\s*[：:]\s*(\d{8,20})/,
  /票号\s*[：:]\s*(\d{8,20})/,
];

function extractInvoiceNo(text: string): string | null {
  for (const pattern of INVOICE_NO_PATTERNS) {
    const m = text.match(pattern);
    if (m) return m[1];
  }
  return null;
}

/* ───────── 商户名称 ───────── */

const MERCHANT_PATTERNS: RegExp[] = [
  /销售方名称\s*[：:]\s*(.+?)(?:\s|$)/,
  /销售方\s*[：:]\s*(.+?)(?:\s|$)/,
  /商户名称\s*[：:]\s*(.+?)(?:\s|$)/,
  /商户\s*[：:]\s*(.+?)(?:\s|$)/,
  /收款单位\s*[：:]\s*(.+?)(?:\s|$)/,
  /收款方\s*[：:]\s*(.+?)(?:\s|$)/,
  /开票方\s*[：:]\s*(.+?)(?:\s|$)/,
  /销方\s*[：:]\s*(.+?)(?:\s|$)/,
  /销售方信息\s*[：:]\s*(.+?)(?:\s|$)/,
];

/** 公司名称后缀——出现则大概率是商户名 */
const COMPANY_SUFFIXES =
  /(?:有限公司|有限责任公司|股份有限公司|合伙企业|个体工商户|餐饮|饭店|餐厅|商行|商店|超市|小吃|快餐|面馆|火锅|烧烤|奶茶|咖啡|烘焙|食品|商贸|贸易|科技|信息|服务|工作室)/;

/** 应排除的行首关键词 */
const SKIP_LINE_PREFIXES =
  /^(金额|税额|价税|合计|总计|日期|发票|备注|税率|购买方|销售方|收款|开票|发票代码|发票号码|校验码|机器|编号|账号|地址|电话|纳税人|识别号|统一社会信用|规格|单位|数量|单价|税率|税额|价税合计|合\s*计|大写|小写|¥|￥|RMB|\d{4}[-/年])/;

function extractMerchant(text: string): string | null {
  // 1) 精确匹配带标签的商户名
  for (const pattern of MERCHANT_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const value = m[1].trim();
      if (value) return value;
    }
  }

  // 2) "名称" 标签（优先匹配含公司后缀的行）
  const nameMatch = text.match(/名称\s*[：:]\s*(.+?)(?:\s|$)/);
  if (nameMatch) {
    const value = nameMatch[1].trim();
    if (value && COMPANY_SUFFIXES.test(value)) return value;
  }

  const lines = text.trim().split("\n");

  // 3) 优先找含公司后缀的行
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 2) continue;
    if (SKIP_LINE_PREFIXES.test(trimmed)) continue;
    if (/^[\d.,¥￥\-\s]+$/.test(trimmed)) continue;
    if (COMPANY_SUFFIXES.test(trimmed)) return trimmed;
  }

  // 4) Fallback: 取第一个像名称的行
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 2) continue;
    if (SKIP_LINE_PREFIXES.test(trimmed)) continue;
    if (/^\d+[\.,]?\d*$/.test(trimmed)) continue;
    if (/^[\d.,¥￥\-\s]+$/.test(trimmed)) continue;
    // 排除纯数字+少量符号的行（如地址片段 "123号"）
    if (/^\d+号/.test(trimmed)) continue;
    // 排除过长行（可能是 OCR 乱码合并行）
    if (trimmed.length > 40) continue;
    if (!/^[\W\d]+$/.test(trimmed)) return trimmed;
  }

  return null;
}

/* ───────── 金额提取（区分价税合计 vs 金额） ───────── */

interface AmountResult {
  /** 价税合计（含税总额） */
  totalWithTax: number | null;
  /** 金额（不含税） */
  netAmount: number | null;
  /** 税额 */
  taxAmount: number | null;
}

function extractAmounts(text: string): AmountResult {
  let totalWithTax: number | null = null;
  let netAmount: number | null = null;
  let taxAmount: number | null = null;

  // ── 价税合计（含税总额） ──
  const totalPatterns = [
    /价税合计(?:\s*大写)?\s*[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
    /价税合计\s*[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
    /(?:合[计總]|总[计計]|应付金额|实付金额|总计金额|合计金额)\s*[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
  ];
  for (const pattern of totalPatterns) {
    const m = text.match(pattern);
    if (m) {
      const cents = parseYuanToCents(m[1]);
      if (cents > 0) {
        totalWithTax = centsToYuan(cents);
        break;
      }
    }
  }

  // ── 金额（不含税） ──
  const netPatterns = [
    /金[额額]\s*[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
    /不含税金额\s*[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
  ];
  for (const pattern of netPatterns) {
    const m = text.match(pattern);
    if (m) {
      const cents = parseYuanToCents(m[1]);
      if (cents > 0) {
        netAmount = centsToYuan(cents);
        break;
      }
    }
  }

  // ── 税额 ──
  const taxPatterns = [
    /(?:税[额額]|税款|增值税额|合计税额)\s*[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
  ];
  for (const pattern of taxPatterns) {
    const m = text.match(pattern);
    if (m) {
      const cents = parseYuanToCents(m[1]);
      if (cents > 0) {
        taxAmount = centsToYuan(cents);
        break;
      }
    }
  }

  // ── 税率推算税额 ──
  if (!taxAmount) {
    const rateMatch = text.match(/税[率率]\s*[：:]*\s*(\d+(?:\.\d+)?)\s*%/);
    if (rateMatch) {
      const rate = parseFloat(rateMatch[1]) / 100;
      const base = totalWithTax || netAmount;
      if (base && base > 0 && rate > 0) {
        if (totalWithTax) {
          // 价税合计已知 → 税额 = 价税合计 × 税率 / (1 + 税率)
          const taxCents = Math.round((totalWithTax * 100 * rate) / (1 + rate));
          taxAmount = centsToYuan(taxCents);
        } else if (netAmount) {
          // 金额已知 → 税额 = 金额 × 税率
          const taxCents = Math.round(netAmount * 100 * rate);
          taxAmount = centsToYuan(taxCents);
        }
      }
    }
  }

  // ── 交叉验证与补全 ──
  const tolerance = 0.02; // 允许 2 分钱误差

  if (totalWithTax && netAmount && taxAmount) {
    // 三者都有：验证 价税合计 ≈ 金额 + 税额
    const expected = netAmount + taxAmount;
    if (Math.abs(totalWithTax - expected) > tolerance) {
      // 不一致：优先信任价税合计，重新推算金额
      netAmount = centsToYuan(Math.round((totalWithTax - taxAmount) * 100));
    }
  } else if (totalWithTax && taxAmount && !netAmount) {
    // 有价税合计和税额 → 推算金额
    netAmount = centsToYuan(Math.round((totalWithTax - taxAmount) * 100));
  } else if (totalWithTax && netAmount && !taxAmount) {
    // 有价税合计和金额 → 推算税额
    taxAmount = centsToYuan(Math.round((totalWithTax - netAmount) * 100));
  } else if (netAmount && taxAmount && !totalWithTax) {
    // 有金额和税额 → 推算价税合计
    totalWithTax = centsToYuan(Math.round((netAmount + taxAmount) * 100));
  }

  // ── Fallback: 如果都没有，尝试 ¥ 符号和金额上下文 ──
  if (!totalWithTax && !netAmount) {
    // 优先找 ¥ 后面的数字
    const yenMatches = [...text.matchAll(/[¥￥]\s*([\d,，]+\.?\d*)/g)];
    const validYen = yenMatches
      .map((m) => ({ cents: parseYuanToCents(m[1]), str: m[1] }))
      .filter((v) => v.cents > 0 && looksLikeAmount(v.str));

    if (validYen.length > 0) {
      // 取最大的 ¥ 金额作为价税合计
      validYen.sort((a, b) => b.cents - a.cents);
      totalWithTax = centsToYuan(validYen[0].cents);
    }
  }

  // ── 最终 Fallback: 找所有小数数字 ──
  if (!totalWithTax && !netAmount) {
    const allNumbers: { cents: number; str: string }[] = [];
    const globalPattern = /([\d,，]+\.\d{1,2})/g;
    let match;
    while ((match = globalPattern.exec(text)) !== null) {
      const cents = parseYuanToCents(match[1]);
      if (cents > 0 && looksLikeAmount(match[1])) {
        allNumbers.push({ cents, str: match[1] });
      }
    }
    if (allNumbers.length > 0) {
      allNumbers.sort((a, b) => b.cents - a.cents);
      totalWithTax = centsToYuan(allNumbers[0].cents);
    }
  }

  return { totalWithTax, netAmount, taxAmount };
}

/* ───────── 日期 ───────── */

const DATE_PATTERNS = [
  /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
  /(\d{4})-(\d{1,2})-(\d{1,2})/,
  /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
  /(\d{4})\.(\d{1,2})\.(\d{1,2})/,
];

const DATE_PREFIX_PATTERNS = [
  /开票日期\s*[：:]\s*(.+)/,
  /日期\s*[：:]\s*(.+)/,
  /开具日期\s*[：:]\s*(.+)/,
  /时间\s*[：:]\s*(.+)/,
];

function normalizeDate(year: string, month: string, day: string): string {
  return `${year}-${String(parseInt(month)).padStart(2, "0")}-${String(parseInt(day)).padStart(2, "0")}`;
}

function extractDate(text: string): string | null {
  for (const prefixPattern of DATE_PREFIX_PATTERNS) {
    const m = text.match(prefixPattern);
    if (m) {
      const dateStr = m[1].trim();
      for (const datePattern of DATE_PATTERNS) {
        const dm = dateStr.match(datePattern);
        if (dm) return normalizeDate(dm[1], dm[2], dm[3]);
      }
    }
  }

  for (const datePattern of DATE_PATTERNS) {
    const m = text.match(datePattern);
    if (m) return normalizeDate(m[1], m[2], m[3]);
  }

  return null;
}

/* ───────── 发票类型 ───────── */

const INVOICE_TYPE_MAP: [RegExp, string][] = [
  [/增值税.*?电子.*?专用/, "vat_special_electronic"],
  [/增值税.*?电子.*?普通/, "vat_normal_electronic"],
  [/电子发票[\s\S]*?增值税专用/, "vat_special_electronic"],
  [/电子发票[\s\S]*?增值税普通/, "vat_normal_electronic"],
  [/增值税专用发票/, "vat_special"],
  [/增值税普通发票/, "vat_normal"],
  [/电子发票/, "electronic"],
  [/机打发票/, "machine_printed"],
  [/收据/, "receipt"],
  [/小票/, "receipt"],
];

function extractType(text: string): string | null {
  for (const [pattern, typeCode] of INVOICE_TYPE_MAP) {
    if (pattern.test(text)) return typeCode;
  }
  return null;
}

/* ───────── 主入口 ───────── */

export function extractFields(rawText: string): ExtractedFields {
  if (!rawText) {
    return {
      merchantName: null,
      totalAmount: null,
      taxAmount: null,
      invoiceDate: null,
      invoiceType: null,
      invoiceNo: null,
    };
  }

  const text = cleanOcrText(rawText);
  const amounts = extractAmounts(text);

  return {
    merchantName: extractMerchant(text),
    totalAmount: amounts.totalWithTax,
    taxAmount: amounts.taxAmount,
    invoiceDate: extractDate(text),
    invoiceType: extractType(text),
    invoiceNo: extractInvoiceNo(text),
  };
}
