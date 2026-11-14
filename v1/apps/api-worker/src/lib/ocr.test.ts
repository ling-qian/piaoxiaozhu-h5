/**
 * OCR 编排层的回归。
 *
 * 视觉模型本身的请求细节在 `ocr-vision.test.ts` 里测，这里只回答一个问题：
 * 视觉失败之后怎么办。这条链路上有三层兜底（COS 中转 → 内联 → 外部 OCR 服务），
 * 每一层的失败原因都要能传到用户面前，否则用户只看到一句莫名的 429。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { imageUrlForVision, recognize, toDataUrl } from "./ocr";

vi.mock("./ocr-vision", () => ({ recognizeViaLLM: vi.fn() }));
vi.mock("./cos", () => ({ cosUploadForVision: vi.fn() }));

import { cosUploadForVision } from "./cos";
import { recognizeViaLLM } from "./ocr-vision";

const ENV = {
  LLM_API_KEY: "key",
  LLM_BASE_URL: "https://llm.example.com/v1",
  LLM_MODEL_NAME: "test-vision",
};

const image = () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;

const GOOD = {
  ok: true as const,
  data: {
    rawText: "TOTAL 38.24",
    ocrConfidence: 0.92,
    merchantName: "GOLDEN WOK CAFE",
    amount: 38.24,
    taxAmount: 3.04,
    invoiceDate: "2026-10-28",
    invoiceCode: null,
    invoiceNo: null,
    taxNo: null,
    category: { code: "food", l1: "餐饮", l2: "堂食", confidence: 0.9, reason: "菜单条目" },
    isInvoice: true,
    invoiceWarning: null,
    lineCheck: null,
  },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.mocked(cosUploadForVision).mockReset();
  vi.mocked(recognizeViaLLM).mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ──────────────────────────────────────────── 视觉通道优先

describe("recognize — 视觉优先", () => {
  it("视觉成功就直接返回，不再调用外部 OCR 服务", async () => {
    vi.mocked(cosUploadForVision).mockResolvedValue({ url: "https://cos.example.com/a.jpg?sig=1" });
    vi.mocked(recognizeViaLLM).mockResolvedValue(GOOD);

    const r = await recognize(image(), { ...ENV, OCR_SERVICE_URL: "https://ocr.example.com" }, 60_000, "zh");

    expect(r.ok).toBe(true);
    expect(recognizeViaLLM).toHaveBeenCalledWith("https://cos.example.com/a.jpg?sig=1", expect.anything(), "zh");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("COS 没配时退回内联 data URL，且不把这种情况说成上传失败", async () => {
    vi.mocked(cosUploadForVision).mockResolvedValue({ reason: "not_configured" });
    vi.mocked(recognizeViaLLM).mockResolvedValue(GOOD);

    await recognize(image(), ENV, 60_000, "zh");

    expect(recognizeViaLLM).toHaveBeenCalledWith(
      expect.stringMatching(/^data:image\/jpeg;base64,/),
      expect.anything(),
      "zh"
    );
  });
});

// ──────────────────────────────────────────── 失败原因传递

describe("recognize — 视觉失败后的兜底", () => {
  it("中转失败要把「内联发送」这层说明带上", async () => {
    vi.mocked(cosUploadForVision).mockResolvedValue({ reason: "upload_failed" });
    vi.mocked(recognizeViaLLM).mockResolvedValue({
      ok: false,
      failure: "network",
      message: "识别服务连不通",
    });

    const r = await recognize(image(), ENV, 60_000, "zh");

    expect(r.ok).toBe(false);
    expect(r.failure).toBe("network");
    expect(r.message).toContain("识别服务连不通");
    expect(r.message).toContain("图片没能上传到存储中转");
  });

  it("只是没配 COS 时不要误导，别加内联提示", async () => {
    vi.mocked(cosUploadForVision).mockResolvedValue({ reason: "not_configured" });
    vi.mocked(recognizeViaLLM).mockResolvedValue({
      ok: false,
      failure: "timeout",
      message: "识别超时，请重试",
    });

    const r = await recognize(image(), ENV, 60_000, "zh");

    expect(r.message).toBe("识别超时，请重试");
  });

  it("视觉失败但配了外部服务时回落，503 映射为可重试的 timeout", async () => {
    vi.mocked(cosUploadForVision).mockResolvedValue({ reason: "not_configured" });
    vi.mocked(recognizeViaLLM).mockResolvedValue({ ok: false, failure: "rejected", message: "x" });
    vi.mocked(fetch).mockResolvedValue(new Response("model loading", { status: 503 }));

    const r = await recognize(
      image(),
      { ...ENV, OCR_SERVICE_URL: "https://ocr.example.com/", OCR_API_KEY: "ocr-key" },
      60_000,
      "en"
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    // 末尾斜杠要去掉，避免拼出 //ocr
    expect(url).toBe("https://ocr.example.com/ocr");
    expect((init as RequestInit).headers).toMatchObject({ "X-OCR-Key": "ocr-key" });
    expect(r.failure).toBe("timeout");
    expect(r.message).toContain("still loading");
  });
});

// ──────────────────────────────────────────── 只走外部 OCR 服务

describe("recognize — 外部 OCR 服务", () => {
  const serviceEnv = { LLM_BASE_URL: "https://llm.example.com/v1", LLM_MODEL_NAME: "m", OCR_SERVICE_URL: "https://ocr.example.com" };

  it("两边都没配时明确返回 no_service", async () => {
    const r = await recognize(image(), { LLM_BASE_URL: "https://x/v1", LLM_MODEL_NAME: "m" }, 60_000, "zh");
    expect(r.failure).toBe("no_service");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("服务回 400 视为 rejected，不是超时", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("bad image", { status: 400 }));
    const r = await recognize(image(), serviceEnv, 60_000, "zh");
    expect(r.failure).toBe("rejected");
    expect(r.message).toBe("识别服务暂时不可用");
  });

  it("成功时把 snake_case 转成 camelCase，并给出 is_invoice 默认值", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          raw_text: "TOTAL 38.24",
          merchant_name: "GOLDEN WOK CAFE",
          amount: 38.24,
          invoice_date: "2026-10-28",
          category: { code: "food", l1: "餐饮", l2: "堂食", confidence: 0.9, reason: "菜单条目" },
          // 故意不传 is_invoice：缺省应视为票据
        }),
        { status: 200 }
      )
    );

    const r = await recognize(image(), serviceEnv, 60_000, "zh");

    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({
      merchantName: "GOLDEN WOK CAFE",
      amount: 38.24,
      invoiceDate: "2026-10-28",
      isInvoice: true,
      taxAmount: null,
    });
    expect(r.data!.category).toMatchObject({ code: "food", l1: "餐饮" });
  });

  it("连不通与超时要分开报", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const net = await recognize(image(), serviceEnv, 60_000, "zh");
    expect(net.failure).toBe("network");

    vi.mocked(fetch).mockRejectedValueOnce(new Error("The operation was aborted"));
    const timeout = await recognize(image(), serviceEnv, 60_000, "zh");
    expect(timeout.failure).toBe("timeout");
    expect(timeout.message).toContain("识别超时");
  });
});

// ──────────────────────────────────────────── 内联兜底

describe("toDataUrl / imageUrlForVision", () => {
  it("内联地址是可解码的 jpeg base64", () => {
    const url = toDataUrl(new Uint8Array([104, 101, 108, 108, 111]).buffer);
    expect(url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(atob(url.split(",")[1]!)).toBe("hello");
  });

  it("上传失败时 cosFailed=true，未配置时 cosFailed=false", async () => {
    vi.mocked(cosUploadForVision).mockResolvedValueOnce({ reason: "upload_failed" });
    await expect(imageUrlForVision(image(), {})).resolves.toMatchObject({ cosFailed: true });

    vi.mocked(cosUploadForVision).mockResolvedValueOnce({ reason: "not_configured" });
    await expect(imageUrlForVision(image(), {})).resolves.toMatchObject({ cosFailed: false });
  });
});
