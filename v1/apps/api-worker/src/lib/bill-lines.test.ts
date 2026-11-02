/**
 * 批量行规整的回归。
 *
 * 这里验证的是「哪一行该收、哪一行该丢、字段怎么继承」，不连数据库。
 */

import { describe, expect, it } from "vitest";

import { MAX_BATCH_LINES, normalizeBatchLines } from "./bill-lines";

describe("normalizeBatchLines", () => {
  it("金额缺失的行计入 failed，不影响其余行", () => {
    const r = normalizeBatchLines(
      { merchantName: "Sysco", invoiceDate: "2026-10-31" },
      [
        { description: "Flour", amount: 42.5 },
        { description: "Blurry row", amount: null },
        { description: "Milk", amount: "78" },
      ]
    );

    expect(r.lines).toHaveLength(2);
    expect(r.failed).toBe(1);
    expect(r.lines.map((l) => l.amount)).toEqual([42.5, 78]);
  });

  it("行号按有效行连续编号，不保留空洞", () => {
    const r = normalizeBatchLines({}, [
      { amount: 1 },
      { amount: null },
      { amount: 3 },
    ]);
    expect(r.lines.map((l) => l.lineNo)).toEqual([1, 2]);
  });

  it("商户名与日期缺省时继承整张账单", () => {
    const r = normalizeBatchLines({ merchantName: "Sysco", invoiceDate: "2026-10-31" }, [{ amount: 5 }]);
    expect(r.lines[0]!.merchantName).toBe("Sysco");
    expect(r.lines[0]!.invoiceDate).toBe("2026-10-31");
  });

  it("行上的值优先于整张账单", () => {
    const r = normalizeBatchLines({ merchantName: "Sysco", invoiceDate: "2026-10-31" }, [
      { amount: 5, merchant_name: "Local farm", invoice_date: "2026-10-15" },
    ]);
    expect(r.lines[0]!.merchantName).toBe("Local farm");
    expect(r.lines[0]!.invoiceDate).toBe("2026-10-15");
  });

  it("超过上限的行被截断", () => {
    const rows = Array.from({ length: MAX_BATCH_LINES + 3 }, () => ({ amount: 1 }));
    const r = normalizeBatchLines({}, rows);
    expect(r.lines).toHaveLength(MAX_BATCH_LINES);
    expect(r.failed).toBe(0);
  });

  it("置信度被截到 0–1", () => {
    const r = normalizeBatchLines({}, [{ amount: 1, confidence: 1.8 }, { amount: 1, confidence: -0.2 }]);
    expect(r.lines[0]!.confidence).toBe(1);
    expect(r.lines[1]!.confidence).toBe(0);
  });
});
