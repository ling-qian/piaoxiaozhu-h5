/**
 * OCR 服务客户端。
 *
 * Worker 跑不了 PaddleOCR（C++ 原生扩展），所以把图片转给独立的 OCR 容器。
 *
 * 三条纪律：
 *   1. 超时给足（16s 实测 + 冷启动可能 30s），但**必须有上限**，
 *      否则请求会一直挂着，前端只能看到转圈。
 *   2. 区分「超时」「连不通」「服务未配置」——三种情况的处置完全不同。
 *   3. 识别失败不影响用户把票存下来：金额可以手填，丢数据才是事故。
 */

export interface OcrCategory {
  code: string;
  l1: string;
  l2: string;
  confidence: number;
  reason: string;
}

export interface OcrResult {
  rawText: string | null;
  ocrConfidence: number | null;
  merchantName: string | null;
  /** 元（不是分） */
  amount: number | null;
  taxAmount: number | null;
  invoiceDate: string | null;
  invoiceCode: string | null;
  invoiceNo: string | null;
  taxNo: string | null;
  category: OcrCategory | null;
  isInvoice: boolean;
  invoiceWarning: string | null;
  lineCheck: Record<string, unknown> | null;
}

export type OcrFailure = "no_service" | "timeout" | "network" | "bad_response" | "rejected";

export interface OcrCallResult {
  ok: boolean;
  data?: OcrResult;
  failure?: OcrFailure;
  message?: string;
}

interface OcrRaw {
  raw_text?: string | null;
  ocr_confidence?: number | null;
  merchant_name?: string | null;
  amount?: number | null;
  tax_amount?: number | null;
  invoice_date?: string | null;
  invoice_code?: string | null;
  invoice_no?: string | null;
  tax_no?: string | null;
  category?: OcrCategory | null;
  is_invoice?: boolean;
  invoice_warning?: string | null;
  line_check?: Record<string, unknown> | null;
}

/** 识别一张票据。图片字节直接透传，不落盘。 */
export async function recognize(
  image: ArrayBuffer,
  serviceUrl: string | undefined,
  timeoutMs = 60_000
): Promise<OcrCallResult> {
  if (!serviceUrl) {
    return { ok: false, failure: "no_service", message: "OCR 服务未配置（缺少 OCR_SERVICE_URL）" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(`${serviceUrl.replace(/\/+$/, "")}/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: image,
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = (await resp.text()).slice(0, 200);
      console.error("[ocr] 服务返回", resp.status, text);
      // 503 = 模型还在加载；这类错误重试有意义，与参数错误区别开
      return {
        ok: false,
        failure: resp.status === 503 ? "timeout" : "rejected",
        message: resp.status === 503 ? "OCR 模型正在加载，请稍后重试" : "识别服务暂时不可用",
      };
    }

    const raw = (await resp.json()) as OcrRaw;
    return {
      ok: true,
      data: {
        rawText: raw.raw_text ?? null,
        ocrConfidence: raw.ocr_confidence ?? null,
        merchantName: raw.merchant_name ?? null,
        amount: raw.amount ?? null,
        taxAmount: raw.tax_amount ?? null,
        invoiceDate: raw.invoice_date ?? null,
        invoiceCode: raw.invoice_code ?? null,
        invoiceNo: raw.invoice_no ?? null,
        taxNo: raw.tax_no ?? null,
        category: raw.category ?? null,
        isInvoice: raw.is_invoice ?? true,
        invoiceWarning: raw.invoice_warning ?? null,
        lineCheck: raw.line_check ?? null,
      },
    };
  } catch (e) {
    const isAbort = e instanceof Error && /abort|timeout/i.test(e.message);
    console.error("[ocr] 调用失败:", e);
    return {
      ok: false,
      failure: isAbort ? "timeout" : "network",
      message: isAbort ? "识别超时，请重试或手动填写" : "识别服务连不通",
    };
  } finally {
    clearTimeout(timer);
  }
}
