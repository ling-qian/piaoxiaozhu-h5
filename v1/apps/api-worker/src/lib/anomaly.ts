/**
 * 账目体检——从 `services/api/app/services/anomaly.py` 移植。
 *
 * 设计原则（原样保留，别为了「多发现问题」放宽阈值）：
 *   · 阈值保守：宁可漏报，不可误报。误报一次，用户就再也不信这个功能。
 *   · 给证据：每条发现带支撑记录，让用户能自己判断。
 *   · 纯计算：不调大模型，规则能说清的事不需要花钱。
 */

export interface Finding {
  code: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  evidence: Array<{
    id: string;
    invoice_no: string | null;
    merchant: string | null;
    amount: number;
    date: string;
  }>;
}

/** 体检只需要这些字段，用最小结构接收，避免依赖完整的 DB 行 */
export interface ScanRecord {
  id: string;
  amount: number | null;
  invoice_no: string | null;
  invoice_code: string | null;
  invoice_date: string | null;
  merchant_name: string | null;
  category_l1: string | null;
}

const MIN_SAMPLES_FOR_OUTLIER = 5;
const MIN_MONTHS_FOR_TREND = 3;
const OUTLIER_RATIO = 3.0;
const OUTLIER_SIGMA = 2.5;
const CONSECUTIVE_RUN = 3;
const MIN_SAMPLES_FOR_CATEGORY = 3;

const amt = (r: ScanRecord): number => Number(r.amount ?? 0) || 0;
const dstr = (r: ScanRecord): string => (r.invoice_date ? String(r.invoice_date).slice(0, 10) : "");

function evidence(r: ScanRecord) {
  return {
    id: r.id,
    invoice_no: r.invoice_no,
    merchant: r.merchant_name,
    amount: Math.round(amt(r) * 100) / 100,
    date: dstr(r),
  };
}

/** 中位数：偶数个取中间两个的平均（与 Python statistics.median 一致） */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid]!;
  return (s[mid - 1]! + s[mid]!) / 2;
}

/** 总体标准差（除以 N），不是样本标准差 */
function pstdev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

const money = (v: number): string => `¥${v.toFixed(2)}`;

export function scan(records: ScanRecord[]): Finding[] {
  const recs = records.filter(Boolean);
  if (recs.length === 0) return [];

  const findings: Finding[] = [
    ...checkDuplicateInvoiceNo(recs),
    ...checkAmountOutlier(recs),
    ...checkConsecutiveInvoiceNo(recs),
    ...checkMerchantSpike(recs),
    ...checkCategoryMismatch(recs),
  ];

  // 高危在前，同级按证据数降序：用户最该先看到最贵的那个问题
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  findings.sort(
    (a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || b.evidence.length - a.evidence.length
  );
  return findings;
}

/** 同一发票号码出现多次 = 可能重复报销（比文件哈希更接近业务问题） */
function checkDuplicateInvoiceNo(records: ScanRecord[]): Finding[] {
  const byNo = new Map<string, ScanRecord[]>();
  for (const r of records) {
    const no = (r.invoice_no ?? "").trim();
    if (no.length >= 8) {
      const arr = byNo.get(no) ?? [];
      arr.push(r);
      byNo.set(no, arr);
    }
  }

  const out: Finding[] = [];
  for (const [no, group] of byNo) {
    if (group.length < 2) continue;
    const total = group.reduce((a, r) => a + amt(r), 0);
    out.push({
      code: "duplicate_invoice_no",
      severity: "high",
      title: `同一张发票录了 ${group.length} 次`,
      detail: `发票号码 ${no} 出现 ${group.length} 次，合计 ${money(total)}。若是同一笔业务，存在重复记账。`,
      evidence: group.slice(0, 8).map(evidence),
    });
  }
  return out;
}

/** 同分类内金额显著偏离：中位数倍数 + 标准差 双重条件，收紧误报 */
function checkAmountOutlier(records: ScanRecord[]): Finding[] {
  const byCat = new Map<string, ScanRecord[]>();
  for (const r of records) {
    const cat = r.category_l1 || "未分类";
    if (amt(r) > 0) {
      const arr = byCat.get(cat) ?? [];
      arr.push(r);
      byCat.set(cat, arr);
    }
  }

  const out: Finding[] = [];
  for (const [cat, group] of byCat) {
    if (group.length < MIN_SAMPLES_FOR_OUTLIER) continue;
    const amounts = group.map(amt);
    const med = median(amounts);
    if (med <= 0) continue;
    const sd = pstdev(amounts);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;

    for (const r of group) {
      const a = amt(r);
      if (a <= med * OUTLIER_RATIO) continue;
      if (sd <= 0 || a < mean + OUTLIER_SIGMA * sd) continue;
      out.push({
        code: "amount_outlier",
        severity: "medium",
        title: `「${cat}」里有笔金额明显偏高`,
        detail:
          `该笔 ${money(a)}，而同类 ${group.length} 笔的中位数只有 ${money(med)}` +
          `（约 ${(a / med).toFixed(1)} 倍）。请确认金额是否录错、或是否属于其他分类。`,
        evidence: [evidence(r)],
      });
    }
  }
  return out;
}

/** 连号发票成组出现。连号本身不违规，定级 low，措辞用「集中开票」 */
function checkConsecutiveInvoiceNo(records: ScanRecord[]): Finding[] {
  const groups = new Map<string, Array<[number, ScanRecord]>>();
  for (const r of records) {
    const no = (r.invoice_no ?? "").trim();
    const code = (r.invoice_code ?? "").trim();
    if (/^\d+$/.test(no) && no.length >= 8) {
      const key = `${code}|${no.slice(0, -4)}`;
      const arr = groups.get(key) ?? [];
      arr.push([Number(no), r]);
      groups.set(key, arr);
    }
  }

  const out: Finding[] = [];
  for (const items of groups.values()) {
    if (items.length < CONSECUTIVE_RUN) continue;
    items.sort((a, b) => a[0] - b[0]);

    let run: Array<[number, ScanRecord]> = [items[0]!];
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1]!;
      const cur = items[i]!;
      run = cur[0] === prev[0] + 1 ? [...run, cur] : [cur];

      if (run.length >= CONSECUTIVE_RUN) {
        const total = run.reduce((a, [, r]) => a + amt(r), 0);
        out.push({
          code: "consecutive_invoice_no",
          severity: "low",
          title: `${run.length} 张发票号码连续`,
          detail:
            `号码 ${run[0]![1].invoice_no} ~ ${run[run.length - 1]![1].invoice_no} 连续，` +
            `合计 ${money(total)}，像是同一批次集中开具。` +
            "若是同一供应商同一次采购，属正常；否则建议核对。",
          evidence: run.slice(0, 8).map(([, r]) => evidence(r)),
        });
        break; // 每组只报最长的一段，避免刷屏
      }
    }
  }
  return out;
}

/** 某商户最近一个月支出显著高于它自己的历史水平 */
function checkMerchantSpike(records: ScanRecord[]): Finding[] {
  const byMerchant = new Map<string, Array<[string, number]>>();
  for (const r of records) {
    const name = (r.merchant_name ?? "").trim();
    const d = dstr(r);
    if (name && d.length === 10 && amt(r) > 0) {
      const arr = byMerchant.get(name) ?? [];
      arr.push([d.slice(0, 7), amt(r)]);
      byMerchant.set(name, arr);
    }
  }

  const out: Finding[] = [];
  for (const [name, rows] of byMerchant) {
    const months = new Map<string, number>();
    for (const [m, a] of rows) months.set(m, (months.get(m) ?? 0) + a);
    if (months.size < MIN_MONTHS_FOR_TREND) continue;

    const keys = [...months.keys()].sort();
    const latest = keys[keys.length - 1]!;
    const history = keys.filter((m) => m !== latest).map((m) => months.get(m)!);
    if (history.length < MIN_MONTHS_FOR_TREND - 1) continue;

    const histMedian = median(history);
    if (histMedian <= 0) continue;

    const current = months.get(latest)!;
    if (current < histMedian * OUTLIER_RATIO) continue;

    out.push({
      code: "merchant_spike",
      severity: "medium",
      title: `「${name}」本月支出是往常的 ${(current / histMedian).toFixed(1)} 倍`,
      detail:
        `${latest} 累计 ${money(current)}，此前月度中位数为 ${money(histMedian)}。` +
        "若确有大批量采购可忽略，否则建议确认是否有票据重复录入。",
      evidence: records
        .filter((r) => (r.merchant_name ?? "").trim() === name && dstr(r).slice(0, 7) === latest)
        .slice(0, 8)
        .map(evidence),
    });
  }
  return out;
}

/** 同一商户的分类前后不一致（典型是 OCR 把商品名当成了商户） */
function checkCategoryMismatch(records: ScanRecord[]): Finding[] {
  const byMerchant = new Map<string, ScanRecord[]>();
  for (const r of records) {
    const name = (r.merchant_name ?? "").trim();
    const cat = (r.category_l1 ?? "").trim();
    if (name && cat && amt(r) > 0) {
      const arr = byMerchant.get(name) ?? [];
      arr.push(r);
      byMerchant.set(name, arr);
    }
  }

  const out: Finding[] = [];
  for (const [name, group] of byMerchant) {
    if (group.length < MIN_SAMPLES_FOR_CATEGORY) continue;

    const counter = new Map<string, number>();
    for (const r of group) {
      const c = (r.category_l1 ?? "").trim();
      counter.set(c, (counter.get(c) ?? 0) + 1);
    }

    let dominant = "";
    let domCount = -1;
    for (const [c, n] of counter) {
      if (n > domCount) {
        dominant = c;
        domCount = n;
      }
    }

    // 主流分类要占绝对多数（≥2/3），否则说明这商户本来就跨类目，不该提示
    if (domCount / group.length < 0.67) continue;

    const odd = group.filter((r) => (r.category_l1 ?? "").trim() !== dominant);
    if (odd.length === 0) continue;

    const oddCats = [...new Set(odd.map((r) => (r.category_l1 ?? "").trim()))].sort();
    out.push({
      code: "category_mismatch",
      severity: "low",
      title: `「${name}」的分类前后不一致`,
      detail:
        `这个商户的 ${domCount} 笔记为「${dominant}」，但另有 ${odd.length} 笔是` +
        `「${oddCats.join("、")}」。如果金额对得上，可能只是分类点错了。`,
      evidence: odd.slice(0, 6).map(evidence),
    });
  }
  return out;
}
