/**
 * 视觉 LLM 识别的失败回归。
 *
 * 这里全部用桩替换 fetch：要验证的是「模型返回各种东西时我们怎么处理」，
 * 不是模型本身。真模型的准确率用样例小票人工验过（7 字段全对）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { recognizeViaLLM } from "./ocr-vision";

const ENV = {
  LLM_API_KEY: "key",
  LLM_BASE_URL: "https://llm.example.com/v1",
  LLM_MODEL_NAME: "test-vision",
};

const GOOD_JSON = JSON.stringify({
  merchant_name: "GOLDEN WOK CAFE",
  amount: 38.24,
  tax_amount: 3.04,
  invoice_date: "2026-10-28",
  category: { code: "food", l1: "餐饮", l2: "堂食", confidence: 0.9, reason: "菜单条目" },
  is_invoice: true,
  raw_text: "TOTAL 38.24",
});

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }))
  );
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("recognizeViaLLM", () => {
  it("未配 LLM_API_KEY 时直接返回 no_service", async () => {
    const r = await recognizeViaLLM("https://cos.example.com/img.jpg?sig=1", { ...ENV, LLM_API_KEY: undefined });
    expect(r.ok).toBe(false);
    expect(r.failure).toBe("no_service");
  });

  it("正常 JSON：字段映射齐全", async () => {
    mockFetch(200, { choices: [{ message: { content: GOOD_JSON } }] });
    const r = await recognizeViaLLM("https://cos.example.com/img.jpg?sig=1", ENV);

    expect(r.ok).toBe(true);
    expect(r.data!.merchantName).toBe("GOLDEN WOK CAFE");
    expect(r.data!.amount).toBe(38.24);
    expect(r.data!.taxAmount).toBe(3.04);
    expect(r.data!.invoiceDate).toBe("2026-10-28");
    expect(r.data!.category!.code).toBe("food");
    expect(r.data!.isInvoice).toBe(true);
  });

  it("模型包了 ```json 围栏也能解析", async () => {
    mockFetch(200, { choices: [{ message: { content: "```json\n" + GOOD_JSON + "\n```" } }] });
    const r = await recognizeViaLLM("https://cos.example.com/img.jpg?sig=1", ENV);
    expect(r.ok).toBe(true);
    expect(r.data!.merchantName).toBe("GOLDEN WOK CAFE");
  });

  it("输出不是 JSON 时返回 bad_response，不抛异常", async () => {
    mockFetch(200, { choices: [{ message: { content: "这是一张小票，我看不太清。" } }] });
    const r = await recognizeViaLLM("https://cos.example.com/img.jpg?sig=1", ENV);
    expect(r.ok).toBe(false);
    expect(r.failure).toBe("bad_response");
  });

  it("服务商 5xx 返回 bad_response（含两次退避重试，约 5 秒）", { timeout: 20_000 }, async () => {
    mockFetch(500, { error: "boom" });
    const r = await recognizeViaLLM("https://cos.example.com/img.jpg?sig=1", ENV);
    expect(r.ok).toBe(false);
    expect(r.failure).toBe("bad_response");
    // 重试逻辑真的跑了：三次请求而不是一次
    expect(vi.mocked(fetch).mock.calls.length).toBe(3);
  });

  it("网络超时返回 timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      })
    );
    const r = await recognizeViaLLM("https://cos.example.com/img.jpg?sig=1", ENV);
    expect(r.ok).toBe(false);
    expect(r.failure).toBe("timeout");
  });

  it("模型说不是票据时 is_invoice=false 并带警示", async () => {
    const notReceipt = JSON.stringify({
      merchant_name: null,
      amount: null,
      is_invoice: false,
      invoice_warning: "图片是二维码截图",
    });
    mockFetch(200, { choices: [{ message: { content: notReceipt } }] });
    const r = await recognizeViaLLM("https://cos.example.com/img.jpg?sig=1", ENV);
    expect(r.ok).toBe(true);
    expect(r.data!.isInvoice).toBe(false);
    expect(r.data!.invoiceWarning).toContain("二维码");
  });

  it("模型没给 category 时为 null 而不是编造", async () => {
    const noCat = JSON.stringify({ merchant_name: "X", amount: 1, is_invoice: true });
    mockFetch(200, { choices: [{ message: { content: noCat } }] });
    const r = await recognizeViaLLM("https://cos.example.com/img.jpg?sig=1", ENV);
    expect(r.data!.category).toBeNull();
  });
});
