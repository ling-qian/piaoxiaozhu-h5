/**
 * 月度会计交付包——把一个月要交给会计的东西算出来。
 *
 * 三块内容：汇总与分类小计（会计用来对账）、异常清单（会计会追问的部分）、
 * 明细 CSV。全部是纯计算，不调模型：交付给会计的数字必须能被复核，
 * 模型参与计算就等于给了一个没法追责的答案。
 *
 * 异常只报三类问题：重复、缺票、金额离群。分类不一致、连号发票这类
 * 「像问题但不是问题」的规则留给账目体检页，混进交付包会让会计怀疑整份数据。
 */

export interface PackRecord {
  id: string;
  direction: string;
  amount: number | null;
  tax_amount: number | null;
  invoice_date: string | null;
  merchant_name: string | null;
  category_l1: string | null;
  category_l2: string | null;
  invoice_no: string | null;
  invoice_code: string | null;
  file_id: string | null;
  reason: string | null;
}

export interface PackEvidence {
  id: string;
  date: string;
  merchant: string | null;
  amount: number;
  invoice_no: string | null;
}

export type ExceptionCode =
  | "duplicate_invoice_no"
  | "missing_invoice"
  | "amount_outlier"
  | "missing_date";

export interface PackException {
  code: ExceptionCode;
  severity: "high" | "medium" | "low";
  /** 涉及记录数 */
  count: number;
  /** 涉及金额合计（元） */
  amount: number;
  /** 重复发票号，或离群记录所属分类；其余为 null */
  label: string | null;
  /** 离群金额是同类中位数的倍数；其余为 0 */
  ratio: number;
  records: PackEvidence[];
}

export interface PackCategory {
  /** 一级分类原始名，前端按语言映射 */
  name: string;
  amount: number;
  count: number;
  /** 占总支出的百分比，保留两位 */
  share: number;
}

export interface PackSummary {
  record_count: number;
  income: number;
  expense: number;
  net: number;
  tax_total: number;
}

export interface PackPayload {
  month: string;
  summary: PackSummary;
  categories: PackCategory[];
  exceptions: PackException[];
  generated_at: string;
}

/** 与账目体检同一组阈值，改一处就等于两份结论不一致 */
const MIN_SAMPLES_FOR_OUTLIER = 5;
const OUTLIER_RATIO = 3.0;
const OUTLIER_SIGMA = 2.5;

const UNCATEGORIZED = "未分类";

export function isMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

/** 上个月的 YYYY-MM，作为页面默认月份 */
export function previousMonth(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

const toCents = (value: number | null): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const yuan = (cents: number): number => Math.round(cents) / 100;

const dateOf = (r: PackRecord): string => (r.invoice_date ? String(r.invoice_date).slice(0, 10) : "");

function evidence(r: PackRecord): PackEvidence {
  return {
    id: r.id,
    date: dateOf(r),
    merchant: r.merchant_name,
    amount: yuan(toCents(r.amount)),
    invoice_no: r.invoice_no,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function pstdev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((acc, x) => acc + (x - mean) ** 2, 0) / values.length);
}

/** 月份内记录：只看票据日期，不看录入日期 */
export function monthRecords(records: PackRecord[], month: string): PackRecord[] {
  return records.filter((r) => dateOf(r).startsWith(month));
}

function buildSummary(records: PackRecord[]): PackSummary {
  let income = 0;
  let expense = 0;
  let tax = 0;
  for (const r of records) {
    const cents = toCents(r.amount);
    if (r.direction === "income") income += cents;
    else expense += cents;
    tax += toCents(r.tax_amount);
  }
  return {
    record_count: records.length,
    income: yuan(income),
    expense: yuan(expense),
    net: yuan(income - expense),
    tax_total: yuan(tax),
  };
}

function buildCategories(records: PackRecord[], expense: number): PackCategory[] {
  const byName = new Map<string, { cents: number; count: number }>();
  for (const r of records) {
    if (r.direction === "income") continue;
    const name = (r.category_l1 ?? "").trim() || UNCATEGORIZED;
    const cur = byName.get(name) ?? { cents: 0, count: 0 };
    cur.cents += toCents(r.amount);
    cur.count += 1;
    byName.set(name, cur);
  }
  const expenseCents = Math.round(expense * 100);
  return [...byName.entries()]
    .sort((a, b) => b[1].cents - a[1].cents)
    .map(([name, v]) => ({
      name,
      amount: yuan(v.cents),
      count: v.count,
      share: expenseCents > 0 ? Math.round((v.cents / expenseCents) * 10000) / 100 : 0,
    }));
}

/** 同一发票号出现多次：比文件哈希更接近会计要问的问题 */
function findDuplicateInvoiceNo(records: PackRecord[]): PackException[] {
  const byNo = new Map<string, PackRecord[]>();
  for (const r of records) {
    const no = (r.invoice_no ?? "").trim();
    if (no.length >= 8) {
      const arr = byNo.get(no) ?? [];
      arr.push(r);
      byNo.set(no, arr);
    }
  }

  const out: PackException[] = [];
  for (const [no, group] of byNo) {
    if (group.length < 2) continue;
    out.push({
      code: "duplicate_invoice_no",
      severity: "high",
      count: group.length,
      amount: yuan(group.reduce((a, r) => a + toCents(r.amount), 0)),
      label: no,
      ratio: 0,
      records: group.slice(0, 8).map(evidence),
    });
  }
  return out;
}

/** 缺票：支出既没有发票号，也没有任何上传文件 */
function findMissingInvoice(records: PackRecord[]): PackException[] {
  const missing = records.filter(
    (r) =>
      r.direction !== "income" &&
      !(r.invoice_no ?? "").trim() &&
      !(r.invoice_code ?? "").trim() &&
      !r.file_id
  );
  if (missing.length === 0) return [];
  return [
    {
      code: "missing_invoice",
      severity: "medium",
      count: missing.length,
      amount: yuan(missing.reduce((a, r) => a + toCents(r.amount), 0)),
      label: null,
      ratio: 0,
      records: missing.slice(0, 8).map(evidence),
    },
  ];
}

/** 同分类内金额显著偏高：中位数倍数与标准差两个条件都满足才报 */
function findAmountOutliers(records: PackRecord[]): PackException[] {
  const byCategory = new Map<string, PackRecord[]>();
  for (const r of records) {
    if (r.direction === "income") continue;
    const cents = toCents(r.amount);
    if (cents <= 0) continue;
    const name = (r.category_l1 ?? "").trim() || UNCATEGORIZED;
    const arr = byCategory.get(name) ?? [];
    arr.push(r);
    byCategory.set(name, arr);
  }

  const out: PackException[] = [];
  for (const [name, group] of byCategory) {
    if (group.length < MIN_SAMPLES_FOR_OUTLIER) continue;
    const cents = group.map((r) => toCents(r.amount));
    const med = median(cents);
    if (med <= 0) continue;
    const sd = pstdev(cents);
    const mean = cents.reduce((a, b) => a + b, 0) / cents.length;

    for (const r of group) {
      const value = toCents(r.amount);
      if (value <= med * OUTLIER_RATIO) continue;
      if (sd <= 0 || value < mean + OUTLIER_SIGMA * sd) continue;
      out.push({
        code: "amount_outlier",
        severity: "medium",
        count: 1,
        amount: yuan(value),
        label: name,
        ratio: Math.round((value / med) * 10) / 10,
        records: [evidence(r)],
      });
    }
  }
  return out;
}

/** 没有日期的记录进不了任何一个月。单独报出来，否则会计会以为数据丢了 */
function findMissingDate(all: PackRecord[]): PackException[] {
  const undated = all.filter((r) => !dateOf(r));
  if (undated.length === 0) return [];
  return [
    {
      code: "missing_date",
      severity: "low",
      count: undated.length,
      amount: yuan(undated.reduce((a, r) => a + toCents(r.amount), 0)),
      label: null,
      ratio: 0,
      records: undated.slice(0, 8).map(evidence),
    },
  ];
}

const SEVERITY_RANK: Record<PackException["severity"], number> = { high: 0, medium: 1, low: 2 };

export function buildPack(records: PackRecord[], month: string, generatedAt: string): PackPayload {
  const inMonth = monthRecords(records, month);
  const summary = buildSummary(inMonth);
  const exceptions = [
    ...findDuplicateInvoiceNo(inMonth),
    ...findMissingInvoice(inMonth),
    ...findAmountOutliers(inMonth),
    ...findMissingDate(records),
  ].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count);

  return {
    month,
    summary,
    categories: buildCategories(inMonth, summary.expense),
    exceptions,
    generated_at: generatedAt,
  };
}

/** CSV 单元格转义：逗号、引号、换行都要包起来，否则会计导入时列会错位 */
function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const CSV_HEADERS = [
  "Date",
  "Direction",
  "Merchant",
  "Category",
  "Subcategory",
  "Amount",
  "Tax",
  "Invoice No",
  "Invoice Code",
  "Note",
];

/**
 * 明细 CSV。
 *
 * 带 BOM：不带的话 Excel 打开中文商户名会是乱码，而会计大概率用 Excel 打开。
 * 金额写两位小数、不带货币符号，便于直接求和。
 */
export function renderPackCsv(records: PackRecord[], month: string): string {
  const rows = monthRecords(records, month).sort(
    (a, b) => dateOf(a).localeCompare(dateOf(b)) || a.id.localeCompare(b.id)
  );

  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(dateOf(r)),
        csvCell(r.direction === "income" ? "income" : "expense"),
        csvCell((r.merchant_name ?? "").trim()),
        csvCell((r.category_l1 ?? "").trim()),
        csvCell((r.category_l2 ?? "").trim()),
        csvCell(yuan(toCents(r.amount)).toFixed(2)),
        csvCell(r.tax_amount === null ? "" : yuan(toCents(r.tax_amount)).toFixed(2)),
        csvCell((r.invoice_no ?? "").trim()),
        csvCell((r.invoice_code ?? "").trim()),
        csvCell((r.reason ?? "").trim()),
      ].join(",")
    );
  }

  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
