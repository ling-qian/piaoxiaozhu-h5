/**
 * 票据字段提取——从 `packages/core/piaoxiaozhu_core/field_extractor.py` 逐条移植。
 *
 * ⚠️ 这些正则不是随手写的，每一条都对应一次线上识别事故（注释里保留了原因）。
 * 移植时**不要「优化」正则**，否则同样的票会抽出不同的商户名/金额，
 * 而且不会有任何报错——只会静默变成错误的账。
 */

export interface ExtractedFields {
  merchantName: string | null;
  /** 价税合计，单位「分」 */
  totalAmount: number | null;
  /** 税额，单位「分」 */
  taxAmount: number | null;
  invoiceDate: string | null;
  invoiceType: string | null;
  invoiceCode: string | null;
  invoiceNo: string | null;
  sellerTaxNo: string | null;
}

export const EMPTY_FIELDS: ExtractedFields = {
  merchantName: null,
  totalAmount: null,
  taxAmount: null,
  invoiceDate: null,
  invoiceType: null,
  invoiceCode: null,
  invoiceNo: null,
  sellerTaxNo: null,
};

// 带「销售方」语义的显式字段。刻意不含裸「名称」：
// 增值税发票版式是购买方在前、销售方在后，裸「名称」必然先命中购买方。
const SELLER_LABEL_PATTERNS: RegExp[] = [
  /销售方名称[：:]\s*(.+?)(?:\s|$)/,
  /销方名称[：:]\s*(.+?)(?:\s|$)/,
  /销售方[：:]\s*(.+?)(?:\s|$)/,
  /商户名称[：:]\s*(.+?)(?:\s|$)/,
  /商户[：:]\s*(.+?)(?:\s|$)/,
  /收款单位[：:]\s*(.+?)(?:\s|$)/,
  /开票方[：:]\s*(.+?)(?:\s|$)/,
  /销方[：:]\s*(.+?)(?:\s|$)/,
  /销售方信息[：:]\s*(.+?)(?:\s|$)/,
];

// 发票上的区块标题。OCR 常把「销售方信息」单独识别成一行（不带冒号）
const SELLER_SECTION = /销售方|销方|销售单位|销货单位/;
// 排除「项目名称/货物名称」等表头
const NAME_LINE = /(?<![目物])名称[：:]\s*([^\n]+)/g;

// 「销售方 名称：」常被 OCR 拆成多行（销售方 / 名 / 称：京东大药房…），
// 必须容忍换行。增值税发票商户名的主要来源，排在所有模式之前。
const SELLER_SPLIT_PATTERN = /销售方\s*名\s*称\s*[：:]\s*([^\n]+)/;

// 盖章碎片：发票末尾「销售方：（章」「发票专用章」是签章残留。
// 曾出过事故：`销售方[：:]` 命中盖章行，商户名被写成「（章」。
const SEAL_NOISE_PATTERN = /^[（(【[\s]*(?:发票专用章|专用章|章)[）)】\]\s]*$/;

// 紧跟商户名的其它标签。OCR 会把相邻表格单元并成一行，
// 必须在此截断，否则「纳税人识别号」会被并进商户名。
const FOLLOWING_LABELS = /统一社会信用代码|纳税人识别号|纳税识别号|税号|开户行|银行账号|地址|电话/;

// 明细行的「不含税金额 / 税率 / 税额」三列被并成一框时的粘连形态，如 "124.763%3.74"
const ITEM_ROW_TAX = /\d+\.\d{2}\s*(\d{1,2})\s*%\s*\d+\.\d{2}/;

const DATE_PATTERNS: RegExp[] = [
  /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
  /(\d{4})-(\d{1,2})-(\d{1,2})/,
  /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
  /(\d{4})\.(\d{1,2})\.(\d{1,2})/,
];

const DATE_PREFIX_PATTERNS: RegExp[] = [
  /开票日期[：:]\s*(.+)/,
  /日期[：:]\s*(.+)/,
  /开具日期[：:]\s*(.+)/,
  /时间[：:]\s*(.+)/,
];

const INVOICE_TYPE_MAP: Array<[RegExp, string]> = [
  [/增值税[\s\S]*?电子[\s\S]*?专用/, "vat_special_electronic"],
  [/增值税[\s\S]*?电子[\s\S]*?普通/, "vat_normal_electronic"],
  [/电子发票[\s\S]*?增值税专用/, "vat_special_electronic"],
  [/电子发票[\s\S]*?增值税普通/, "vat_normal_electronic"],
  [/增值税专用发票/, "vat_special"],
  [/增值税普通发票/, "vat_normal"],
  [/电子发票/, "electronic"],
  [/机打发票/, "machine_printed"],
  [/收据/, "receipt"],
  [/小票/, "receipt"],
];

const INVOICE_CODE_PATTERN = /发票代码[：:]*\s*(\d{10,12})(?!\d)/;

// 数电票号码固定 20 位且无代码，传统发票 8 位。都要求后面不再跟数字，
// 否则会把相邻的「机器编号」一起吞进来。
const INVOICE_NO_PATTERNS: RegExp[] = [
  /发票号码[：:]*\s*(\d{20})(?!\d)/,
  /发票号码[：:]*\s*(\d{8})(?!\d)/,
];

// 销方税号的无标签兜底：购买方在前、销售方在后，取最后一个
const TAX_NO_PATTERN =
  /(?:纳税人识别号|纳税人识别码|统一社会信用代码|税号)[：:]*\s*([0-9A-Z]{15,20})(?![0-9A-Z])/g;

/**
 * 四舍五入到整数分。
 *
 * 用「银行家舍入」而不是 Math.round：Python 的 round() 是四舍六入五取偶，
 * 例如 round(12.5)=12，而 Math.round(12.5)=13。金额上的一分钱差异会一路
 * 传到报表与对账，所以必须与旧实现完全一致。
 */
function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

function parseYuanToCents(v: string): number {
  const cleaned = v.replace(/[,，￥¥]/g, "").trim();
  const yuan = Number(cleaned);
  if (!Number.isFinite(yuan)) return 0;
  return roundHalfEven(yuan * 100);
}

function cleanMerchant(value: string): string | null {
  const cut = value.split(FOLLOWING_LABELS)[0] ?? "";
  const trimmed = cut.trim().replace(/^[：:，,。.、\s]+|[：:，,。.、\s]+$/g, "");
  return trimmed || null;
}

function isSealNoise(value: string): boolean {
  if (!value) return true;
  if (SEAL_NOISE_PATTERN.test(value.trim())) return true;
  const stripped = value.replace(/[（()）【】[\]{}\s]/g, "");
  return ["章", "发票专用章", "专用章", "发票章", "财务专用章"].includes(stripped);
}

function extractMerchant(text: string): string | null {
  // 0) 容忍换行的「销售方 名称：」优先。它天然不会命中盖章行——盖章行是
  //    「销售方：（章」，中间没有「名称」二字。
  const split = SELLER_SPLIT_PATTERN.exec(text);
  if (split?.[1]) {
    const v = cleanMerchant(split[1]);
    if (v && !isSealNoise(v)) return v;
  }

  // 1) 显式销售方字段最可靠。命中盖章碎片时继续往后找，不能直接返回
  for (const p of SELLER_LABEL_PATTERNS) {
    const m = p.exec(text);
    if (m?.[1]) {
      const v = cleanMerchant(m[1]);
      if (v && !isSealNoise(v)) return v;
    }
  }

  // 2) 定位「销售方」区块，取其后的第一个「名称」
  const names = [...text.matchAll(NAME_LINE)];
  if (names.length > 0) {
    const seller = SELLER_SECTION.exec(text);
    if (seller) {
      for (const nm of names) {
        if ((nm.index ?? 0) > seller.index + seller[0].length) {
          const v = cleanMerchant(nm[1] ?? "");
          if (v) return v;
        }
      }
    }
    // 没有销售方区块标记时，按「购买方在前、销售方在后」取最后一个
    if (names.length > 1) {
      const v = cleanMerchant(names[names.length - 1]![1] ?? "");
      if (v) return v;
    }
    const v = cleanMerchant(names[0]![1] ?? "");
    if (v) return v;
  }

  // 3) 兜底：逐行挑第一个像商户名的行
  for (const raw of text.trim().split("\n")) {
    let line = raw.trim();
    if (!line) continue;
    if (/\d{4}/.test(line)) continue;
    if (/^\d+[.,]?\d*$/.test(line)) continue;
    if (/^[\d.,¥￥\-\s]+$/.test(line)) continue;
    // 先剥掉行首标签，否则商户名会带上「销售方：」
    line = line.replace(/^(?:销售方|销方|收款单位|开票方|商户)\s*[：:]\s*/, "").trim();
    // 顺序重要：先剥标签再判盖章，否则「销售方：（发票专用章）」整行会漏判
    if (isSealNoise(line)) continue;
    // Python 的 \w 是 Unicode 感知的（中文算「字」），JS 的 \w 只认 ASCII。
    // 直接照抄 /^[\W\d]+$/ 会把「盒马鲜生」判成「无意义字符」而跳过，
    // 中文商户名全军覆没。这里用 [^\p{L}_] 精确复刻 Python 的 [\W\d] 语义。
    if (line.length >= 2 && !/^[^\p{L}_]+$/u.test(line)) return line;
  }

  return null;
}

function extractInvoiceCode(text: string): string | null {
  return INVOICE_CODE_PATTERN.exec(text)?.[1] ?? null;
}

function extractInvoiceNo(text: string): string | null {
  for (const p of INVOICE_NO_PATTERNS) {
    const m = p.exec(text);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractSellerTaxNo(text: string): string | null {
  const all = [...text.matchAll(TAX_NO_PATTERN)].map((m) => m[1]).filter(Boolean) as string[];
  return all.length ? all[all.length - 1]!.toUpperCase() : null;
}

function extractTotal(text: string): number | null {
  const patterns = [
    /(?:价税合计|合[计總]|总[计計]|应付金额|实付金额|总计金额|合计金额)[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
    /[¥￥]\s*([\d,，]+\.?\d*)/,
    /(?:金[额額])[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m?.[1]) {
      const cents = parseYuanToCents(m[1]);
      if (cents > 0) return cents;
    }
  }

  // 兜底：取全文最大的两位小数（票据上通常就是合计）
  let best = 0;
  for (const m of text.matchAll(/([\d,，]+\.\d{1,2})/g)) {
    const cents = parseYuanToCents(m[1] ?? "");
    if (cents > best) best = cents;
  }
  return best > 0 ? best : null;
}

function extractTaxRate(text: string): number | null {
  // 1) 明细三列粘连形态，如 "124.763%3.74"——比单看 "%" 可靠得多
  const glued = ITEM_ROW_TAX.exec(text);
  if (glued?.[1]) {
    const v = Number(glued[1]);
    if (v > 0 && v <= 20) return v / 100;
  }

  // 2) 「税率」标签之后的第一个独立百分比
  const anchor = /税率|征收率/.exec(text);
  if (anchor) {
    const rest = text.slice(anchor.index + anchor[0].length);
    const m = /(?<![\d.])(\d{1,2}(?:\.\d+)?)\s*%/.exec(rest);
    if (m?.[1]) {
      const v = Number(m[1]);
      if (v > 0 && v <= 20) return v / 100;
    }
  }

  // 3) 无标签时取全文第一个独立百分比；上限 20% 以避开折扣/涨幅
  for (const m of text.matchAll(/(?<![\d.])(\d{1,2}(?:\.\d+)?)\s*%/g)) {
    const v = Number(m[1]);
    if (v > 0 && v <= 20) return v / 100;
  }

  return null;
}

function extractTax(text: string): number | null {
  const patterns = [
    /(?:税[额額]|税款|增值税额|合计税额)[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
    /(?:税[额額])[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)/,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m?.[1]) {
      const cents = parseYuanToCents(m[1]);
      if (cents > 0) return cents;
    }
  }

  // 表格式发票里「税额」常只是列头。此时用「价税合计 ÷ (1+税率) × 税率」反推
  // ——价内税的固定算法（合计是含税价，不是「金额 × 税率」）
  const rate = extractTaxRate(text);
  if (rate) {
    const total = extractTotal(text);
    if (total && rate > 0 && rate < 1) {
      const taxCents = roundHalfEven((total * rate) / (1 + rate));
      if (taxCents > 0 && taxCents < total) return taxCents;
    }
  }
  return null;
}

function normalizeDate(y: string, m: string, d: string): string {
  return `${y}-${String(Number(m)).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
}

function extractDate(text: string): string | null {
  for (const p of DATE_PREFIX_PATTERNS) {
    const m = p.exec(text);
    if (m?.[1]) {
      const seg = m[1].trim();
      for (const dp of DATE_PATTERNS) {
        const dm = dp.exec(seg);
        if (dm) return normalizeDate(dm[1]!, dm[2]!, dm[3]!);
      }
    }
  }
  for (const dp of DATE_PATTERNS) {
    const m = dp.exec(text);
    if (m) return normalizeDate(m[1]!, m[2]!, m[3]!);
  }
  return null;
}

function extractType(text: string): string | null {
  for (const [p, code] of INVOICE_TYPE_MAP) {
    if (p.test(text)) return code;
  }
  return null;
}

export function extractFields(rawText: string): ExtractedFields {
  if (!rawText) return { ...EMPTY_FIELDS };
  return {
    merchantName: extractMerchant(rawText),
    totalAmount: extractTotal(rawText),
    taxAmount: extractTax(rawText),
    invoiceDate: extractDate(rawText),
    invoiceType: extractType(rawText),
    invoiceCode: extractInvoiceCode(rawText),
    invoiceNo: extractInvoiceNo(rawText),
    sellerTaxNo: extractSellerTaxNo(rawText),
  };
}
