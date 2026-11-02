/**
 * 批量入账的输入规整。
 *
 * 抽成纯函数是为了能单独测：路由里那段要连 D1，写起测试来代价太高，
 * 而真正容易出错的是「哪些行该收、哪些行该丢、字段怎么继承」。
 */

/** 单张账单最多接受的明细行数，与识别端保持一致 */
export const MAX_BATCH_LINES = 60;

/** 金额上限与单条入账接口一致 */
const AMOUNT_LIMIT = 9_999_999_999.99;

export interface BatchShared {
  merchantName?: string | null;
  invoiceDate?: string | null;
  taxNo?: string | null;
}

export interface BatchLineInput {
  description?: string | null;
  merchant_name?: string | null;
  amount?: unknown;
  tax_amount?: unknown;
  invoice_date?: string | null;
  category_code?: string | null;
  category_l1?: string | null;
  category_l2?: string | null;
  confidence?: unknown;
  invoice_no?: string | null;
  invoice_code?: string | null;
}

export interface NormalizedLine {
  lineNo: number;
  description: string | null;
  merchantName: string | null;
  amount: number;
  taxAmount: number | null;
  invoiceDate: string | null;
  taxNo: string | null;
  invoiceNo: string | null;
  invoiceCode: string | null;
  categoryCode: string | null;
  categoryL1: string | null;
  categoryL2: string | null;
  confidence: number | null;
}

export interface NormalizedBatch {
  lines: NormalizedLine[];
  /** 金额缺失或越界、因此被丢掉的行数 */
  failed: number;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * 把前端传来的行规整成可入库的形状。
 *
 * 金额读不出来的行直接计入 failed，不中断整批：一张对账单里有一行模糊，
 * 不该让另外 19 行也存不进去。
 */
export function normalizeBatchLines(shared: BatchShared, rawLines: unknown): NormalizedBatch {
  const list = Array.isArray(rawLines) ? rawLines.slice(0, MAX_BATCH_LINES) : [];
  const lines: NormalizedLine[] = [];
  let failed = 0;

  for (const raw of list as BatchLineInput[]) {
    const amount = toNumber(raw?.amount);
    if (amount === null || amount < -AMOUNT_LIMIT || amount > AMOUNT_LIMIT) {
      failed += 1;
      continue;
    }

    const conf = toNumber(raw?.confidence);
    lines.push({
      lineNo: lines.length + 1,
      description: toText(raw?.description),
      // 商户名与日期优先用行上的值，缺了再继承整张账单的
      merchantName: toText(raw?.merchant_name) ?? toText(shared?.merchantName),
      amount,
      taxAmount: toNumber(raw?.tax_amount),
      invoiceDate: toText(raw?.invoice_date) ?? toText(shared?.invoiceDate),
      taxNo: toText(shared?.taxNo),
      invoiceNo: toText(raw?.invoice_no),
      invoiceCode: toText(raw?.invoice_code),
      categoryCode: toText(raw?.category_code),
      categoryL1: toText(raw?.category_l1),
      categoryL2: toText(raw?.category_l2),
      confidence: conf === null ? null : Math.min(Math.max(conf, 0), 1),
    });
  }

  return { lines, failed };
}
