import { describe, expect, it } from "vitest";

import { generateReport } from "../lib/report";

const records = [
  { direction: "income", amount: 1000, categoryCode: "food_material", invoiceDate: "2026-10-01" },
  { direction: "out", amount: 300.1, categoryCode: "food_material", invoiceDate: "2026-10-05" },
  { direction: "out", amount: 199.9, categoryCode: "rent", invoiceDate: "2026-10-20" },
];

describe("generateReport", () => {
  it("总额按分累加，避免浮点误差", () => {
    const r = generateReport(records, "2026-10");
    expect(r.totalIncome).toBe(1000);
    expect(r.totalExpense).toBe(500);
    expect(r.grossProfit).toBe(500);
  });

  it("毛利率按百分比保留两位", () => {
    const r = generateReport(records, "2026-10");
    expect(r.grossMargin).toBe(50);
  });

  it("分类占比以支出总额为分母，零支出分类不出现在结果里", () => {
    const r = generateReport(records, "2026-10");
    expect(r.categoryBreakdown.map((c) => c.code)).toEqual(["food_material", "rent"]);
    expect(r.categoryBreakdown[0].percentage).toBe(60.02);
    expect(r.categoryBreakdown[1].percentage).toBe(39.98);
  });

  it("按月份过滤，其他月份的记录不计入", () => {
    const withSeptember = [
      ...records,
      { direction: "out", amount: 88, categoryCode: "utilities", invoiceDate: "2026-09-30" },
    ];
    const r = generateReport(withSeptember, "2026-10");
    expect(r.totalExpense).toBe(500);
    expect(r.monthlyData).toHaveLength(1);
  });

  it("没有收入时毛利率为 0，而不是 NaN", () => {
    const r = generateReport(
      [{ direction: "out", amount: 50, categoryCode: "rent", invoiceDate: "2026-10-01" }],
      "2026-10",
    );
    expect(r.grossMargin).toBe(0);
    expect(r.grossProfit).toBe(-50);
  });

  it("中文分类名与旧版 code 归一到同一分类，占比合计为 100", () => {
    const r = generateReport(
      [
        { direction: "out", amount: 100, categoryCode: "food_material", invoiceDate: "2026-10-01" },
        { direction: "out", amount: 50, categoryCode: "食材", invoiceDate: "2026-10-02" },
        { direction: "out", amount: 50, categoryCode: "meals", invoiceDate: "2026-10-03" },
      ],
      "2026-10",
    );
    const food = r.categoryBreakdown.find((c) => c.code === "food_material");
    expect(food?.amount).toBe(200);
    expect(food?.percentage).toBe(100);
  });

  it("缺日期的记录计入总额，但不进月度趋势", () => {
    const r = generateReport(
      [{ direction: "out", amount: 10, categoryCode: "other", invoiceDate: null }],
      undefined,
    );
    expect(r.totalExpense).toBe(10);
    expect(r.monthlyData).toEqual([]);
  });
});
