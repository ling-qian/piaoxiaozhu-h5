/**
 * 账单识别的解析回归。
 *
 * 只测「模型输出各种畸形数据时我们怎么处理」。真模型的准确率要靠真实
 * 对账单抽样，不在这里假装。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_BILL_LINES, recognizeBillViaLLM } from "./ocr-bill";

const ENV = {
  LLM_API_KEY: "key",
  LLM_BASE_URL: "https://llm.example.com/v1",
  LLM_MODEL_NAME: "test-vision",
};

function mockContent(content: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
    )
  );
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("recognizeBillViaLLM", () => {
  it("未配 LLM_API_KEY 时返回 no_service", async () => {
    const r = await recognizeBillViaLLM("https://cos.example.com/a.jpg", { ...ENV, LLM_API_KEY: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toBe("no_service");
  });

  it("多行明细按顺序编号，金额非法的行被丢掉", async () => {
    mockContent(
      JSON.stringify({
        supplier_name: "Sysco",
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        currency: "USD",
        total_amount: 120.5,
        lines: [
          { description: "Flour 25kg", amount: 42.5, category: { code: "other", l1: "Pantry", l2: "Dry goods", confidence: 0.88 } },
          { description: "Unreadable row", amount: null },
          { description: "Milk 4gal", amount: 78, category: { code: "other", l1: "Pantry", l2: "Dairy", confidence: 1.6 } },
        ],
      })
    );

    const r = await recognizeBillViaLLM("https://cos.example.com/a.jpg", ENV);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.data.supplierName).toBe("Sysco");
    expect(r.data.lines).toHaveLength(2);
    expect(r.data.lines.map((l) => l.lineNo)).toEqual([1, 2]);
    expect(r.data.lines[0]!.amount).toBe(42.5);
    // 置信度超过 1 时截到 1，避免前端进度条画到框外
    expect(r.data.lines[1]!.confidence).toBe(1);
  });

  it("模型没给总额时用明细求和兜底", async () => {
    mockContent(JSON.stringify({ lines: [{ description: "A", amount: 10 }, { description: "B", amount: 2.5 }] }));
    const r = await recognizeBillViaLLM("https://cos.example.com/a.jpg", ENV);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.totalAmount).toBe(12.5);
  });

  it("行数超过上限时截断", async () => {
    const lines = Array.from({ length: MAX_BILL_LINES + 5 }, (_, i) => ({ description: `L${i}`, amount: 1 }));
    mockContent(JSON.stringify({ lines }));
    const r = await recognizeBillViaLLM("https://cos.example.com/a.jpg", ENV);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.lines).toHaveLength(MAX_BILL_LINES);
  });

  it("模型输出不是 JSON 时返回 bad_response", async () => {
    mockContent("Sorry, I cannot read this image.");
    const r = await recognizeBillViaLLM("https://cos.example.com/a.jpg", ENV);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toBe("bad_response");
  });
});
