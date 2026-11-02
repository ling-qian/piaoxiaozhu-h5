/**
 * 月度交付包的回归。
 *
 * 这些断言就是会计会看的几个数字：汇总只算本月、分类占比、三类异常、
 * 明细 CSV 的转义。改动阈值或字段时先跑这里。
 */

import { describe, expect, it } from "vitest";

import { buildPack, isMonthKey, previousMonth, renderPackCsv, type PackRecord } from "./pack";

function rec(overrides: Partial<PackRecord>): PackRecord {
  return {
    id: "r1",
    direction: "out",
    amount: 10,
    tax_amount: null,
    invoice_date: "2026-10-05",
    merchant_name: "Sysco",
    category_l1: "食材",
    category_l2: null,
    invoice_no: null,
    invoice_code: null,
    file_id: "f1",
    reason: null,
    ...overrides,
  };
}

describe("buildPack", () => {
  it("汇总只统计本月，未跨月混入", () => {
    const records = [
      rec({ id: "a", direction: "income", amount: 1000, file_id: null }),
      rec({ id: "b", amount: 200 }),
      rec({ id: "c", amount: 50, invoice_date: "2026-09-30" }),
    ];
    const pack = buildPack(records, "2026-10", "2026-11-01T00:00:00Z");

    expect(pack.summary.record_count).toBe(2);
    expect(pack.summary.income).toBe(1000);
    expect(pack.summary.expense).toBe(200);
    expect(pack.summary.net).toBe(800);
  });

  it("分类小计按金额降序，占比合计接近 100", () => {
    const records = [
      rec({ id: "a", amount: 100, category_l1: "食材" }),
      rec({ id: "b", amount: 40, category_l1: "房租" }),
      rec({ id: "c", amount: 60, category_l1: "工资" }),
    ];
    const pack = buildPack(records, "2026-10", "2026-11-01T00:00:00Z");

    expect(pack.categories.map((c) => c.name)).toEqual(["食材", "工资", "房租"]);
    expect(pack.categories[0]!.amount).toBe(100);
    expect(pack.categories.reduce((sum, c) => sum + c.share, 0)).toBeCloseTo(100, 1);
  });

  it("同一发票号出现两次报重复，定级 high", () => {
    const records = [
      rec({ id: "a", amount: 30, invoice_no: "12345678" }),
      rec({ id: "b", amount: 30, invoice_no: "12345678" }),
    ];
    const pack = buildPack(records, "2026-10", "2026-11-01T00:00:00Z");

    const dup = pack.exceptions.find((e) => e.code === "duplicate_invoice_no");
    expect(dup).toBeDefined();
    expect(dup!.severity).toBe("high");
    expect(dup!.count).toBe(2);
    expect(dup!.amount).toBe(60);
    expect(dup!.label).toBe("12345678");
  });

  it("没有发票号也没有文件的支出算缺票，有文件的不算", () => {
    const records = [
      rec({ id: "a", amount: 20, invoice_no: null, invoice_code: null, file_id: null }),
      rec({ id: "b", amount: 20, invoice_no: null, invoice_code: null, file_id: "f9" }),
    ];
    const pack = buildPack(records, "2026-10", "2026-11-01T00:00:00Z");

    const missing = pack.exceptions.find((e) => e.code === "missing_invoice");
    expect(missing).toBeDefined();
    expect(missing!.count).toBe(1);
    expect(missing!.records[0]!.id).toBe("a");
  });

  it("样本不足 5 笔时不报金额离群", () => {
    const records = [
      rec({ id: "a", amount: 10 }),
      rec({ id: "b", amount: 12 }),
      rec({ id: "c", amount: 11 }),
      rec({ id: "d", amount: 900 }),
    ];
    const pack = buildPack(records, "2026-10", "2026-11-01T00:00:00Z");
    expect(pack.exceptions.some((e) => e.code === "amount_outlier")).toBe(false);
  });

  it("样本足够时，远超中位数的金额报离群并带倍数", () => {
    // 样本太少时标准差会被离群值自己抬高，触发不了 2.5σ 条件——
    // 这是刻意保守的设计，所以这里用 20 笔正常记录衬托 1 笔离群。
    const records = [
      ...Array.from({ length: 20 }, (_, i) =>
        rec({ id: `n${i}`, amount: 10 + (i % 4) })
      ),
      rec({ id: "f", amount: 900 }),
    ];
    const pack = buildPack(records, "2026-10", "2026-11-01T00:00:00Z");

    const outlier = pack.exceptions.find((e) => e.code === "amount_outlier");
    expect(outlier).toBeDefined();
    expect(outlier!.amount).toBe(900);
    expect(outlier!.label).toBe("食材");
    expect(outlier!.ratio).toBeGreaterThan(3);
  });

  it("没有日期的记录单独报出来，不进本月汇总", () => {
    const records = [
      rec({ id: "a", amount: 10 }),
      rec({ id: "b", amount: 30, invoice_date: null }),
    ];
    const pack = buildPack(records, "2026-10", "2026-11-01T00:00:00Z");

    expect(pack.summary.record_count).toBe(1);
    const undated = pack.exceptions.find((e) => e.code === "missing_date");
    expect(undated).toBeDefined();
    expect(undated!.count).toBe(1);
  });
});

describe("renderPackCsv", () => {
  it("带 BOM，金额两位小数，不含货币符号", () => {
    const csv = renderPackCsv([rec({ amount: 12.5 })], "2026-10");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("12.50");
    expect(csv).not.toContain("¥");
  });

  it("含逗号、引号、换行的字段被正确转义", () => {
    const csv = renderPackCsv(
      [rec({ merchant_name: 'A, B "quoted"', reason: "line1\nline2" })],
      "2026-10"
    );
    expect(csv).toContain('"A, B ""quoted"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it("只导出本月记录", () => {
    const csv = renderPackCsv(
      [rec({ id: "a" }), rec({ id: "b", invoice_date: "2026-09-01", merchant_name: "Old" })],
      "2026-10"
    );
    expect(csv).not.toContain("Old");
  });
});

describe("month helpers", () => {
  it("只接受 YYYY-MM", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-1")).toBe(false);
    expect(isMonthKey("2026-13")).toBe(true); // 格式对即可，月份范围由输入控件约束
  });

  it("默认月份是上个月", () => {
    expect(previousMonth(new Date("2026-01-15T00:00:00Z"))).toBe("2025-12");
    expect(previousMonth(new Date("2026-11-01T00:00:00Z"))).toBe("2026-10");
  });
});
