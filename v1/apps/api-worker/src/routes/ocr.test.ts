/**
 * OCR 路由的失败回归。
 *
 * ## 为什么测这一层
 *
 * `lib/ocr.ts` 的测试只管「识别失败的原因是什么」，但用户看到的是接口返回的
 * 状态码与文案。这两者之间还隔着一层映射：超时/未配置 → 503（前端提示稍后重试），
 * 其他 → 502。映射写反了不会抛异常，只会让用户被告知「服务异常」而不是
 * 「服务暂时不可用」，白白丢掉重试的信心。
 *
 * 另一条容易回归的是账单通道的 `cosFailed` 提示拼接：图片没能上传到 COS 时
 * 只能用内联方式发送，服务商常因此直接 429。少了这句解释，用户只会看到
 * 一句莫名其妙的限流。
 *
 * ## 怎么测
 *
 * 限流、识别编排层都打桩——它们各自有单测，这里只验证路由自己的逻辑：
 * 参数校验、状态码映射、响应字段。`getLocale` 保留真实实现，所以断言中文
 * 文案时必须显式带 `Accept-Language`（没有该头时默认英文）。
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../env";
import { ApiError, errorHandler } from "../lib/http";
import { recognize } from "../lib/ocr";
import { recognizeBillViaLLM } from "../lib/ocr-bill";
import { assertHourlyLimit } from "../lib/rate-limit";
import ocrRouter from "./ocr";

vi.mock("../lib/rate-limit", () => ({ assertHourlyLimit: vi.fn() }));
vi.mock("../lib/ocr", () => ({ recognize: vi.fn(), imageUrlForVision: vi.fn() }));
vi.mock("../lib/ocr-bill", () => ({ recognizeBillViaLLM: vi.fn() }));

import { imageUrlForVision } from "../lib/ocr";

// ──────────────────────────────────────────── 测试用的应用与 env

const USER = { id: "user-1", nickname: "Test", plan_code: "free" } as never;

function makeApp() {
  const app = new Hono<{ Bindings: Env; Variables: { user: never } }>();
  app.use("*", async (c, next) => {
    c.set("user", USER);
    await next();
  });
  app.route("/", ocrRouter);
  app.onError(errorHandler);
  return app;
}

const ENV = {
  DB: {} as D1Database,
  JWT_SECRET: "test",
  JWT_ALGORITHM: "HS256",
  APP_ENV: "test",
  APP_BASE_URL: "https://example.com",
  LLM_BASE_URL: "https://example.com/v1",
  LLM_MODEL_NAME: "agnes-3.0-flash",
} as Env;

async function post(path: string, body: BodyInit, headers: Record<string, string> = {}) {
  return makeApp().request(
    path,
    { method: "POST", body, headers: { "Accept-Language": "zh-CN", ...headers } },
    ENV
  );
}

/** 一张最小的合法图片字节（内容无关，路由不做格式校验） */
const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

/** 识别成功的完整响应数据，用例按需覆盖 */
function okData(overrides: Record<string, unknown> = {}) {
  return {
    rawText: "小票文字",
    ocrConfidence: 0.92,
    merchantName: "早餐店",
    amount: 12.5,
    taxAmount: 0,
    invoiceDate: "2026-11-01",
    invoiceCode: "110001",
    invoiceNo: "00012345",
    taxNo: "91310000XXXX",
    category: { code: "food", l1: "餐饮", l2: "早餐", confidence: 0.9, reason: "金额与品类匹配" },
    isInvoice: true,
    invoiceWarning: null,
    lineCheck: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(assertHourlyLimit).mockReset().mockResolvedValue(undefined);
  vi.mocked(recognize).mockReset();
  vi.mocked(recognizeBillViaLLM).mockReset();
  vi.mocked(imageUrlForVision).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────── 小票识别

describe("POST /ocr/recognize", () => {
  it("按 ocr_recognize / 60 次的上限限流，且在识别之前就检查", async () => {
    vi.mocked(recognize).mockResolvedValue({ ok: true, data: okData() } as never);

    await post("/ocr/recognize", IMAGE);

    expect(assertHourlyLimit).toHaveBeenCalledTimes(1);
    const [, userId, action, limit] = vi.mocked(assertHourlyLimit).mock.calls[0]!;
    expect(userId).toBe("user-1");
    expect(action).toBe("ocr_recognize");
    expect(limit).toBe(60);
  });

  it("空图片返回 400，且不调用识别服务", async () => {
    const res = await post("/ocr/recognize", new Uint8Array());

    expect(res.status).toBe(400);
    expect(((await res.json()) as any).detail).toContain("图片内容为空");
    expect(recognize).not.toHaveBeenCalled();
  });

  it("超过 15MB 返回 400，且不调用识别服务", async () => {
    const tooBig = new Uint8Array(15 * 1024 * 1024 + 1);
    const res = await post("/ocr/recognize", tooBig);

    expect(res.status).toBe(400);
    expect(((await res.json()) as any).detail).toContain("15MB");
    expect(recognize).not.toHaveBeenCalled();
  });

  it("超时映射成 503——前端应提示稍后重试，而不是服务故障", async () => {
    vi.mocked(recognize).mockResolvedValue({
      ok: false,
      failure: "timeout",
      message: "识别超时，请重试",
    } as never);

    const res = await post("/ocr/recognize", IMAGE);

    expect(res.status).toBe(503);
    expect(((await res.json()) as any).detail).toBe("识别超时，请重试");
  });

  it("未配置服务映射成 503", async () => {
    vi.mocked(recognize).mockResolvedValue({
      ok: false,
      failure: "no_service",
      message: "未配置 OCR_SERVICE_URL，无法识别",
    } as never);

    expect((await post("/ocr/recognize", IMAGE)).status).toBe(503);
  });

  it("服务商拒单映射成 502", async () => {
    vi.mocked(recognize).mockResolvedValue({
      ok: false,
      failure: "rejected",
      message: "识别服务暂时不可用，请稍后再试",
    } as never);

    const res = await post("/ocr/recognize", IMAGE);

    expect(res.status).toBe(502);
    expect(((await res.json()) as any).detail).toContain("识别服务暂时不可用");
  });

  it("成功时把驼峰字段展开成前端约定的下划线字段", async () => {
    vi.mocked(recognize).mockResolvedValue({ ok: true, data: okData() } as never);

    const res = await post("/ocr/recognize", IMAGE);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      merchant_name: "早餐店",
      amount: 12.5,
      tax_amount: 0,
      invoice_date: "2026-11-01",
      invoice_code: "110001",
      invoice_no: "00012345",
      tax_no: "91310000XXXX",
      category_code: "food",
      category_l1: "餐饮",
      category_l2: "早餐",
      confidence: 0.92,
      raw_text: "小票文字",
      reason: "金额与品类匹配",
      is_invoice: true,
      invoice_warning: null,
      line_check: null,
    });
  });

  it("warning 优先于分类理由，非票据时前端据此显示警示条", async () => {
    vi.mocked(recognize).mockResolvedValue({
      ok: true,
      data: okData({ isInvoice: false, invoiceWarning: "这张图看起来不是小票" }),
    } as never);

    const body = (await (await post("/ocr/recognize", IMAGE)).json()) as any;

    expect(body.is_invoice).toBe(false);
    expect(body.reason).toBe("这张图看起来不是小票");
  });

  it("超限的 429 直接透出，不会走到识别", async () => {
    vi.mocked(assertHourlyLimit).mockRejectedValueOnce(
      new ApiError(429, "识别太频繁了，请稍后再试")
    );

    const res = await post("/ocr/recognize", IMAGE);

    expect(res.status).toBe(429);
    expect(recognize).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────── 账单识别

describe("POST /ocr/recognize-bill", () => {
  const UPLOAD = { url: "https://cos.example.com/ocr-tmp/a.jpg?q-signature=x", cosFailed: false };

  function okBill(overrides: Record<string, unknown> = {}) {
    return {
      ok: true,
      data: {
        supplierName: "蔬菜批发",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-07",
        currency: "CNY",
        totalAmount: 1200,
        taxAmount: 0,
        isBill: true,
        warning: null,
        rawText: "账单文字",
        lines: [
          {
            lineNo: 1,
            description: "青菜",
            amount: 300,
            taxAmount: 0,
            date: "2026-11-01",
            categoryCode: "food_material",
            categoryL1: "食材",
            categoryL2: "蔬菜",
            confidence: 0.88,
          },
        ],
        ...overrides,
      },
    };
  }

  beforeEach(() => {
    vi.mocked(imageUrlForVision).mockResolvedValue(UPLOAD as never);
  });

  it("按 ocr_bill / 20 次的上限限流——单次调用更贵", async () => {
    vi.mocked(recognizeBillViaLLM).mockResolvedValue(okBill() as never);

    await post("/ocr/recognize-bill", IMAGE);

    const [, userId, action, limit] = vi.mocked(assertHourlyLimit).mock.calls[0]!;
    expect(userId).toBe("user-1");
    expect(action).toBe("ocr_bill");
    expect(limit).toBe(20);
  });

  it("成功时展开 lines 的字段", async () => {
    vi.mocked(recognizeBillViaLLM).mockResolvedValue(okBill() as never);

    const res = await post("/ocr/recognize-bill", IMAGE);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      supplier_name: "蔬菜批发",
      period_start: "2026-11-01",
      period_end: "2026-11-07",
      currency: "CNY",
      total_amount: 1200,
      tax_amount: 0,
      is_bill: true,
      warning: null,
      raw_text: "账单文字",
      lines: [
        {
          line_no: 1,
          description: "青菜",
          amount: 300,
          tax_amount: 0,
          date: "2026-11-01",
          category_code: "food_material",
          category_l1: "食材",
          category_l2: "蔬菜",
          confidence: 0.88,
        },
      ],
    });
  });

  it("超时映射成 503", async () => {
    vi.mocked(recognizeBillViaLLM).mockResolvedValue({
      ok: false,
      failure: "timeout",
      message: "识别超时，请重试",
    } as never);

    expect((await post("/ocr/recognize-bill", IMAGE)).status).toBe(503);
  });

  it("图片没能上传到 COS 时，在错误文案里说明内联发送的原因", async () => {
    vi.mocked(imageUrlForVision).mockResolvedValue({ ...UPLOAD, cosFailed: true } as never);
    vi.mocked(recognizeBillViaLLM).mockResolvedValue({
      ok: false,
      failure: "rejected",
      message: "识别服务商返回 429：rate limit",
    } as never);

    const res = await post("/ocr/recognize-bill", IMAGE);

    expect(res.status).toBe(502);
    const detail = ((await res.json()) as any).detail as string;
    expect(detail).toContain("429");
    expect(detail).toContain("图片没能上传到存储中转");
  });

  it("上传成功时错误文案不追加提示", async () => {
    vi.mocked(recognizeBillViaLLM).mockResolvedValue({
      ok: false,
      failure: "rejected",
      message: "识别服务暂时不可用",
    } as never);

    const detail = ((await (await post("/ocr/recognize-bill", IMAGE)).json()) as any).detail as string;

    expect(detail).toBe("识别服务暂时不可用");
  });
});
