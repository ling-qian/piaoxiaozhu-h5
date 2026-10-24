/**
 * 算法模块对拍：体检 / 小票对账 / 分类。
 *
 * 这三个模块的输出会直接影响用户看到的结论与金额，
 * 换语言后必须逐条一致——不然后台数据「看起来正常」，但结论已经变了。
 */
import { readFileSync } from "node:fs";

import { scan, type ScanRecord } from "../src/lib/anomaly.ts";
import { categorizeExpense } from "../src/lib/categorize.ts";
import { crossCheckLines } from "../src/lib/receipt-lines.ts";

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

// ---------- 体检 ----------
const records = readJson("scripts/anomaly-fixture.json") as ScanRecord[];
const findings = scan(records).map((f) => ({
  code: f.code,
  severity: f.severity,
  title: f.title,
  detail: f.detail,
  evidence: f.evidence.length,
}));

// ---------- 小票对账 ----------
const receipts = readJson("scripts/receipt-fixture.json") as Array<{
  name: string;
  text: string;
  total: number;
}>;
const lines = receipts.map((r) => {
  const res = crossCheckLines(r.text, r.total);
  return {
    name: r.name,
    ok: res.ok,
    checked: res.checked,
    item_count: res.itemCount,
    items_sum: res.itemsSum,
    diff: res.diff,
  };
});

// ---------- 分类 ----------
const cats = readJson("scripts/cat-fixture.json") as Array<{
  merchant: string | null;
  text: string | null;
  name: string | null;
}>;
const categorized = [];
for (const c of cats) {
  const r = await categorizeExpense({
    merchant: c.merchant,
    text: c.text,
    name: c.name,
  });
  categorized.push({
    merchant: c.merchant,
    text: c.text,
    code: r.categoryCode,
    l1: r.categoryL1,
    confidence: r.confidence,
  });
}

console.log(JSON.stringify({ findings, lines, categorized }));
