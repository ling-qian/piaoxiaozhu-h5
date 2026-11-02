/**
 * 营业额与毛利的回归。
 *
 * 这里锁两件事：毛利的口径（只做减法）和金额/日期的边界。
 * 口径一变，用户和会计算出来的数就对不上。
 */

import { describe, expect, it } from "vitest";

import {
  isDateKey,
  isMonthKey,
  normalizeSaleAmount,
  summarizeSales,
  type SaleDay,
} from "./sales";

describe("summarizeSales", () => {
  it("只统计本月的天，其余月份不计入", () => {
    const days: SaleDay[] = [
      { sale_date: "2026-10-01", amount: 100 },
      { sale_date: "2026-10-02", amount: 200 },
      { sale_date: "2026-09-30", amount: 300 },
    ];
    const s = summarizeSales(days, 0, "2026-10");
    expect(s.revenue).toBe(300);
    expect(s.days_count).toBe(2);
  });

  it("毛利等于营业额减票据支出，毛利率按营业额算", () => {
    const s = summarizeSales([{ sale_date: "2026-10-01", amount: 1000 }], 600, "2026-10");
    expect(s.revenue).toBe(1000);
    expect(s.expense).toBe(600);
    expect(s.gross_profit).toBe(400);
    expect(s.margin).toBe(40);
  });

  it("营业额为 0 时毛利率记 0，不出现 NaN 或负零", () => {
    const s = summarizeSales([], 200, "2026-10");
    expect(s.revenue).toBe(0);
    expect(s.gross_profit).toBe(-200);
    expect(s.margin).toBe(0);
    expect(s.days_count).toBe(0);
  });

  it("按分累加，避免 0.1 + 0.2 这类浮点误差", () => {
    const s = summarizeSales(
      [
        { sale_date: "2026-10-01", amount: 0.1 },
        { sale_date: "2026-10-02", amount: 0.2 },
      ],
      0,
      "2026-10"
    );
    expect(s.revenue).toBe(0.3);
  });
});

describe("normalizeSaleAmount", () => {
  it("接受数字与数字字符串，四舍五入到分", () => {
    expect(normalizeSaleAmount(123.456)).toBe(123.46);
    expect(normalizeSaleAmount("88.5")).toBe(88.5);
  });

  it("拒绝空值、非数字、负数与超上限", () => {
    expect(normalizeSaleAmount(null)).toBeNull();
    expect(normalizeSaleAmount("")).toBeNull();
    expect(normalizeSaleAmount("abc")).toBeNull();
    expect(normalizeSaleAmount(-1)).toBeNull();
    expect(normalizeSaleAmount(10_000_000_000)).toBeNull();
  });

  it("允许 0：关门歇业那天也该能记一笔", () => {
    expect(normalizeSaleAmount(0)).toBe(0);
  });
});

describe("date keys", () => {
  it("只接受真实存在的日期", () => {
    expect(isDateKey("2026-10-31")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("2026-1-1")).toBe(false);
  });

  it("月份只校验格式", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-10-01")).toBe(false);
  });
});
