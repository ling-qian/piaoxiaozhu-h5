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

import { recognizeViaLLM } from "./ocr-vision";
import type { Locale } from "./locale";
import { cosUploadForVision } from "./cos";

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

/** 服务商返回的 token 用量。只用于成本核算，不进接口响应 */
export interface OcrUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** 图片按分辨率计费时，这里能看到图片占了多少 token */
  prompt_tokens_details?: { cached_tokens?: number; image_tokens?: number };
}

export interface OcrCallResult {
  ok: boolean;
  data?: OcrResult;
  failure?: OcrFailure;
  message?: string;
  usage?: OcrUsage;
}

export interface OcrRaw {
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
  env: {
    LLM_API_KEY?: string;
    LLM_BASE_URL: string;
    LLM_MODEL_NAME: string;
    OCR_SERVICE_URL?: string;
    OCR_API_KEY?: string;
    COS_BUCKET_NAME?: string;
    COS_REGION?: string;
    COS_SECRET_ID?: string;
    COS_SECRET_KEY?: string;
  },
  timeoutMs = 60_000,
  locale: Locale = "zh"
): Promise<OcrCallResult> {
  const isEn = locale === "en";
  const serviceUrl = env.OCR_SERVICE_URL;
  // 优先走视觉 LLM：一次调用完成 OCR + 分类，无需独立容器。
  // 失败时回落到外部 OCR 服务——两家互为备份，谁在用谁的兜底。
  if (env.LLM_API_KEY) {
    // 图片优先经 COS 中转（服务商拉取），直嵌 base64 会被其网关按 429 拒掉
    const imageUrl = await imageUrlForVision(image, env);
    const vision = await recognizeViaLLM(imageUrl, env, locale);
    if (vision.ok) return vision;
    console.error("[ocr] 视觉识别失败，尝试外部 OCR 服务:", vision.message);
    // 视觉失败但外部服务也没配，就把视觉的失败原因带回去
    if (!serviceUrl) return vision;
  }

  if (!serviceUrl) {
    return {
      ok: false,
      failure: "no_service",
      message: isEn
        ? "OCR service is not configured (missing OCR_SERVICE_URL)"
        : "OCR 服务未配置（缺少 OCR_SERVICE_URL）",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(`${serviceUrl.replace(/\/+$/, "")}/ocr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        // 识别服务占 CPU，公网裸露会被滥用，共享密钥是最轻的防线
        ...(env.OCR_API_KEY ? { "X-OCR-Key": env.OCR_API_KEY } : {}),
      },
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
        message: isEn
          ? resp.status === 503
            ? "The OCR model is still loading, please try again shortly"
            : "Recognition service is temporarily unavailable"
          : resp.status === 503
            ? "OCR 模型正在加载，请稍后重试"
            : "识别服务暂时不可用",
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
      message: isEn
        ? isAbort
          ? "Recognition timed out, please retry or enter the details manually"
          : "Recognition service is unreachable"
        : isAbort
          ? "识别超时，请重试或手动填写"
          : "识别服务连不通",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** 图片转 data URL。COS 不可用时的兜底：服务商网关可能对大 POST 回 429 */
export function toDataUrl(image: ArrayBuffer): string {
  const bytes = new Uint8Array(image);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

/**
 * 给视觉模型的图片地址：先传 COS，传不上去再退回 base64。
 *
 * 小票与对账单两条通道都走这里，免得只修好一边。
 */
export async function imageUrlForVision(
  image: ArrayBuffer,
  env: {
    COS_BUCKET_NAME?: string;
    COS_REGION?: string;
    COS_SECRET_ID?: string;
    COS_SECRET_KEY?: string;
  }
): Promise<string> {
  return (await cosUploadForVision(image, env)) ?? toDataUrl(image);
}
