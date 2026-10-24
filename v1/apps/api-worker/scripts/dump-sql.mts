/**
 * 导出问账的 SQL，供 SQLite 实跑验证。
 *
 * TypeScript 只能检查语法，检查不了「这段 SQL 在 SQLite 里是否合法、结果是否正确」。
 * 所以把生成的 SQL 打出来，交给 SQLite 真跑。
 */
import { buildQuery, render, sanitize, timeRangeLabel } from "../src/lib/nlq.ts";

const USER = "11111111-1111-1111-1111-111111111111";

const cases: Array<[string, Record<string, unknown>]> = [
  ["合计（不分组）", { metric: "sum_amount", direction: "out" }],
  ["按分类分组", { metric: "sum_amount", dimension: "category_l1", direction: "out", limit: 10 }],
  ["按月份分组（升序）", { metric: "sum_amount", dimension: "month", order: "asc", limit: 50 }],
  ["笔数统计", { metric: "count", dimension: "merchant_name", limit: 5 }],
  ["平均金额", { metric: "avg_amount", direction: "out" }],
  ["关键词 + 日期范围", { metric: "sum_amount", merchant: "盒马", start: "2026-10-01", end: "2026-10-31" }],
  ["分类 IN 过滤", { metric: "sum_amount", categories: ["食材", "房租"], direction: "out" }],
  ["收入方向", { metric: "sum_amount", direction: "income" }],
  ["通配符注入尝试", { metric: "sum_amount", merchant: "100%" }],
];

const out = cases.map(([name, raw]) => {
  const intent = sanitize(raw);
  const q = buildQuery(intent, USER);
  return { name, sql: q.sql, params: q.params, intent };
});

console.log(JSON.stringify(out));
