/**
 * 票面结构自检——从 `packages/core/piaoxiaozhu_core/invoice_check.py` 移植。
 *
 * 保持两条核心规则不动，否则行为会分叉：
 *   1. **小票识别**：没有发票号码、没有发票代码，且**至少识别到金额或日期**时，
 *      把「发票结构」类检查降级为 ok。缺「有证据」这个条件会把空白识别结果
 *      也判成通过，等于把一次失败包装成检查通过。
 *   2. 小票天然没有发票代码/税号/税额，不能因此让每张小票都挂黄标。
 */

export type CheckLevel = "ok" | "warn" | "fail";

export interface Check {
  key: string;
  label: string;
  level: CheckLevel;
  detail: string;
}

export type Verdict = "pass" | "attention" | "suspect" | "insufficient";

export interface InvoiceCheckInput {
  invoiceType?: string | null;
  invoiceCode?: string | null;
  invoiceNo?: string | null;
  sellerTaxNo?: string | null;
  invoiceDate?: string | null;
  totalAmountCents?: number | null;
  taxAmountCents?: number | null;
  today?: Date;
}

import { isEinvoiceNo, normalizeIdentity } from "./invoice-identity";

export { isEinvoiceNo };

function checkInvoiceNo(no?: string | null, einvoice = false): Check {
  const v = normalizeIdentity(no);
  if (!v) {
    // 本函数不知道这张单是不是小票，所以保持 warn；
    // 真正的小票由 checkInvoice 统一降级（见 asReceipt）。
    return {
      key: "invoice_no",
      label: "发票号码",
      level: "warn",
      detail: "未识别到发票号码，无法查重与查验",
    };
  }
  if (einvoice) {
    return { key: "invoice_no", label: "发票号码", level: "ok", detail: "数电票 20 位号码，格式正常" };
  }
  if (!/^\d{8,12}$/.test(v)) {
    return {
      key: "invoice_no",
      label: "发票号码",
      level: "warn",
      detail: `号码长度异常（${v.length} 位），请核对`,
    };
  }
  return { key: "invoice_no", label: "发票号码", level: "ok", detail: "格式正常" };
}

function checkInvoiceCode(code?: string | null, einvoice = false): Check {
  const v = normalizeIdentity(code);
  if (einvoice) {
    // 数电票没有发票代码，出现代码通常说明号码或代码识别串位了
    return v
      ? { key: "invoice_code", label: "发票代码", level: "warn", detail: "数电票没有发票代码，出现代码说明号码或代码识别有误" }
      : { key: "invoice_code", label: "发票代码", level: "ok", detail: "数电票无代码，正常" };
  }
  if (!v) {
    return { key: "invoice_code", label: "发票代码", level: "warn", detail: "未识别到发票代码" };
  }
  return { key: "invoice_code", label: "发票代码", level: "ok", detail: "格式正常" };
}

function checkTaxNo(taxNo?: string | null): Check {
  const v = normalizeIdentity(taxNo);
  if (!v) {
    return { key: "tax_no", label: "销售方纳税人识别号", level: "warn", detail: "未识别到销售方纳税人识别号" };
  }
  if (!/^[0-9A-Z]{15,20}$/i.test(v)) {
    return { key: "tax_no", label: "销售方纳税人识别号", level: "warn", detail: "长度或字符异常，请核对" };
  }
  return { key: "tax_no", label: "销售方纳税人识别号", level: "ok", detail: "格式正常" };
}

const COMMON_RATES = [0, 0.01, 0.03, 0.05, 0.06, 0.09, 0.13];

function checkAmounts(total?: number | null, tax?: number | null): Check {
  if (total === null || total === undefined) {
    return { key: "amount", label: "金额", level: "warn", detail: "未识别到金额" };
  }
  if (tax === null || tax === undefined) {
    // 小票通常只有合计，没有税额——这条会被 asReceipt 降级
    return { key: "amount", label: "金额", level: "warn", detail: "未识别到税额，无法校验税率关系" };
  }
  const net = total - tax;
  if (net <= 0) {
    return { key: "amount", label: "金额", level: "fail", detail: "税额不小于合计，金额或税额可能有误" };
  }
  const rate = tax / net;
  const hit = COMMON_RATES.some((r) => Math.abs(r - rate) < 0.005);
  return hit
    ? { key: "amount", label: "金额", level: "ok", detail: `税率约 ${(rate * 100).toFixed(1)}%，正常` }
    : {
        key: "amount",
        label: "金额",
        level: "fail",
        detail: `由金额与税额推算的税率 ${(rate * 100).toFixed(2)}% 不在常见档位，可能识别有误`,
      };
}

function checkDate(date?: string | null, today = new Date()): Check {
  if (!date) {
    return { key: "date", label: "开票日期", level: "warn", detail: "未识别到开票日期" };
  }
  const t = Date.parse(date.replace(/\//g, "-"));
  if (Number.isNaN(t)) {
    return { key: "date", label: "开票日期", level: "warn", detail: "日期格式无法解析" };
  }
  const diffDays = (t - today.getTime()) / 86_400_000;
  if (diffDays > 1) {
    return { key: "date", label: "开票日期", level: "fail", detail: "开票日期在未来，请核对" };
  }
  if (diffDays < -365 * 5) {
    return { key: "date", label: "开票日期", level: "warn", detail: "开票日期超过 5 年前，请核对" };
  }
  return { key: "date", label: "开票日期", level: "ok", detail: date };
}

/** 小票上不适用（或天然缺失）的检查项 → 中性说明 */
const RECEIPT_NOTES: Record<string, string> = {
  发票号码: "小票/收据通常无发票号，按金额与商户查重",
  发票代码: "小票/收据通常无发票代码",
  销售方纳税人识别号: "小票/收据通常不打印税号",
  金额: "小票通常只有合计金额，无税额可校验",
};

function asReceipt(c: Check): Check {
  const note = RECEIPT_NOTES[c.label];
  if (note && c.level === "warn") {
    return { ...c, level: "ok", detail: note };
  }
  return c;
}

export function checkInvoice(input: InvoiceCheckInput): Check[] {
  const einvoice = isEinvoiceNo(input.invoiceNo);
  let checks: Check[] = [
    checkInvoiceNo(input.invoiceNo, einvoice),
    checkInvoiceCode(input.invoiceCode, einvoice),
    checkTaxNo(input.sellerTaxNo),
    checkAmounts(input.totalAmountCents ?? null, input.taxAmountCents ?? null),
    checkDate(input.invoiceDate, input.today ?? new Date()),
  ];

  // 小票判定：无号码 + 无代码 + **至少识别到一个真实字段**
  const hasEvidence =
    input.totalAmountCents !== null && input.totalAmountCents !== undefined
      ? true
      : Boolean(input.invoiceDate);

  if (!normalizeIdentity(input.invoiceNo) && !normalizeIdentity(input.invoiceCode) && hasEvidence) {
    checks = checks.map(asReceipt);
  }
  return checks;
}

export function deriveVerdict(checks: Check[]): Verdict {
  if (checks.some((c) => c.level === "fail")) return "suspect";
  const warns = checks.filter((c) => c.level === "warn").length;
  if (warns === 0) return "pass";
  // 全 warn 说明几乎什么都没识别到，是提取失败而不是「需关注」
  if (warns === checks.length) return "insufficient";
  return "attention";
}
