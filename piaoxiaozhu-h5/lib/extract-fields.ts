import { cleanOcrText } from "./ocr";

export interface ExtractedFields {
  merchantName: string | null;
  totalAmount: number | null;
  taxAmount: number | null;
  invoiceDate: string | null;
  invoiceType: string | null;
}

const MERCHANT_PATTERNS: [RegExp, number][] = [
  [/销售方名称\s*[：:]\s*(.+?)(?:\s|$)/, 1],
  [/销售方\s*[：:]\s*(.+?)(?:\s|$)/, 1],
  [/商户名称\s*[：:]\s*(.+?)(?:\s|$)/, 1],
  [/商户\s*[：:]\s*(.+?)(?:\s|$)/, 1],
  [/收款单位\s*[：:]\s*(.+?)(?:\s|$)/, 1],
  [/收款方\s*[：:]\s*(.+?)(?:\s|$)/, 1],
  [/开票方\s*[：:]\s*(.+?)(?:\s|$)/, 1],
  [/销方\s*[：:]\s*(.+?)(?:\s|$)/, 1],
  [/销售方信息\s*[：:]\s*(.+?)(?:\s|$)/, 1],
  [/名称\s*[：:]\s*(.+?)(?:\s|$)/, 1],
];

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

function parseYuanToCents(valueStr: string): number {
  const cleaned = valueStr
    .replace(/[,，￥¥]/g, "")
    .trim();
  const yuan = parseFloat(cleaned);
  if (isNaN(yuan)) return 0;
  return Math.round(yuan * 100);
}

function centsToYuan(cents: number): number {
  return Math.round(cents) / 100;
}

function extractMerchant(text: string): string | null {
  for (const [pattern] of MERCHANT_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const value = m[1].trim();
      if (value) return value;
    }
  }

  const lines = text.trim().split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/\d{4}/.test(trimmed)) continue;
    if (/^\d+[\.,]?\d*$/.test(trimmed)) continue;
    if (/^[\d.,¥￥\-\s]+$/.test(trimmed)) continue;
    if (/^(金额|税额|价税|合计|总计|日期|发票|备注|税率)/.test(trimmed)) continue;
    if (trimmed.length >= 2 && !/^[\W\d]+$/.test(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

function extractTotal(text: string): number | null {
  const totalPatterns = [
    /(?:价税合计|合[计總]|总[计計]|应付金额|实付金额|总计金额|合计金额)\s*[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
    /[¥￥]\s*([\d,，]+\.?\d*)/,
    /(?:金[额額])\s*[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
  ];

  for (const pattern of totalPatterns) {
    const matches = [...text.matchAll(new RegExp(pattern.source, "g"))];
    if (matches.length > 0) {
      let bestCents = 0;
      let bestMatch = matches[0];
      for (const m of matches) {
        const cents = parseYuanToCents(m[1]);
        if (cents > bestCents) {
          bestCents = cents;
          bestMatch = m;
        }
      }
      if (bestCents > 0) return centsToYuan(bestCents);
    }
  }

  const allNumbers: [number, RegExpMatchArray][] = [];
  const globalPattern = /([\d,，]+\.\d{1,2})/g;
  let match;
  while ((match = globalPattern.exec(text)) !== null) {
    const cents = parseYuanToCents(match[1]);
    if (cents > 0) allNumbers.push([cents, match]);
  }

  if (allNumbers.length > 0) {
    allNumbers.sort((a, b) => b[0] - a[0]);
    return centsToYuan(allNumbers[0][0]);
  }

  return null;
}

function extractTax(text: string): number | null {
  const taxPatterns = [
    /(?:税[额額]|税款|增值税额|合计税额)\s*[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
    /(?:税[额額])\s*[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
  ];

  for (const pattern of taxPatterns) {
    const m = text.match(pattern);
    if (m) {
      const cents = parseYuanToCents(m[1]);
      if (cents > 0) return centsToYuan(cents);
    }
  }

  const rateMatch = text.match(/税[率率]\s*[：:]*\s*(\d+(?:\.\d+)?)\s*%/);
  if (rateMatch) {
    const rate = parseFloat(rateMatch[1]) / 100;
    const total = extractTotal(text);
    if (total && total > 0 && rate > 0) {
      const taxCents = Math.round(total * 100 * rate) / (1 + rate);
      if (taxCents > 0) return centsToYuan(Math.round(taxCents));
    }
  }

  return null;
}

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
        if (dm) {
          return normalizeDate(dm[1], dm[2], dm[3]);
        }
      }
    }
  }

  for (const datePattern of DATE_PATTERNS) {
    const m = text.match(datePattern);
    if (m) {
      return normalizeDate(m[1], m[2], m[3]);
    }
  }

  return null;
}

function extractType(text: string): string | null {
  for (const [pattern, typeCode] of INVOICE_TYPE_MAP) {
    if (pattern.test(text)) {
      return typeCode;
    }
  }
  return null;
}

export function extractFields(rawText: string): ExtractedFields {
  if (!rawText) {
    return {
      merchantName: null,
      totalAmount: null,
      taxAmount: null,
      invoiceDate: null,
      invoiceType: null,
    };
  }

  const text = cleanOcrText(rawText);

  return {
    merchantName: extractMerchant(text),
    totalAmount: extractTotal(text),
    taxAmount: extractTax(text),
    invoiceDate: extractDate(text),
    invoiceType: extractType(text),
  };
}
