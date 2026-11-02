/**
 * 视觉 LLM 识别：把图片直接交给多模态模型，一次调用出全部字段。
 *
 * ## 为什么走这条路
 *
 * 原方案是「PaddleOCR 容器出文字 → 再调 LLM 分类」，两次网络往返。
 * 实测这条链的热请求要 21–43 秒，瓶颈在分类那次 LLM 调用。
 *
 * 改成视觉 LLM 后：OCR、分类、字段提取合并成一次调用。实测
 * agnes-3.0-flash 读样例小票 7 个关键字段全对（15.5 秒，含本机代理开销）。
 *
 * ## 教训（写给未来改这里的自己）
 *
 * 「这个模型支不支持视觉」不能靠模型名单推断——它的名字里没有 vision，
 * 但接受 image_url 消息。判断依据只能是实测。
 *
 * ## 与 OCR_SERVICE_URL 的关系
 *
 * 这是优先路径；外部 OCR 服务保留为兜底（见 recognize()）。两家互为备份：
 * 视觉模型挂了走容器，容器没部署走视觉模型。
 */

import { OcrCallResult, OcrRaw } from "./ocr";
import type { Locale } from "./locale";

/**
 * 内置分类表。
 *
 * 中文版沿用既有 5 类；英文版按小餐饮店的成本结构排，code 与前端
 * `lib/constants.ts` 的八类一致。模型会照着这里的措辞生成 `l1/l2`，
 * 所以英文版必须用英文写，并带括号说明每一类收什么票。
 */
export const CATEGORIES_ZH = [
  "food (餐饮/餐费)",
  "transport (交通/差旅出行)",
  "lodging (住宿/酒店)",
  "office (办公用品/耗材)",
  "other (其他)",
] as const;

export const CATEGORIES_EN = [
  "food_material (supplier invoices for produce, meat, dairy, dry goods, drinks)",
  "rent (rent, lease, property, storage)",
  "salary (payroll, wages, contractor and agency staff)",
  "utilities (electricity, water, gas, internet, phone)",
  "platform_fee (delivery app commission, card processing fees, marketplace fees)",
  "advertising (ads, flyers, promotions, social media boosts)",
  "office (office supplies, packaging, printing, cleaning consumables)",
  "other (anything else)",
] as const;

function buildPrompt(locale: Locale): string {
  const isEn = locale === "en";
  const cats = isEn ? CATEGORIES_EN : CATEGORIES_ZH;
  return `You are a strict OCR engine for receipts and invoices.
Read the attached image and reply with ONLY a JSON object (no markdown, no explanation):
{
  "merchant_name": string | null,
  "amount": number | null,
  "tax_amount": number | null,
  "invoice_date": "YYYY-MM-DD" | null,
  "invoice_code": string | null,
  "invoice_no": string | null,
  "tax_no": string | null,
  "category": {"code": string, "l1": string, "l2": string, "confidence": number, "reason": string} | null,
  "is_invoice": boolean,
  "invoice_warning": string | null,
  "raw_text": string | null
}

Rules:
- amount / tax_amount are in the currency printed on the receipt, as plain numbers.
- category.code MUST be one of: ${cats.join(", ")}.
- category.l1 / l2 / reason must be written in ${isEn ? "English" : "Simplified Chinese"}.
- If the image is not a receipt/invoice, set is_invoice=false and explain in invoice_warning.
- Never invent values. Use null for anything you cannot read.
- raw_text: transcribe the text you can see, one line per row.`;
}

export async function recognizeViaLLM(imageUrl: string, env: {
  LLM_BASE_URL: string;
  LLM_MODEL_NAME: string;
  LLM_API_KEY?: string;
}, locale: Locale = "zh"): Promise<OcrCallResult> {
  const isEn = locale === "en";
  /** 分类缺失时的兜底文案，要跟当前语言一致 */
  const UNCATEGORIZED = isEn ? "Uncategorized" : "其他";

  if (!env.LLM_API_KEY) {
    return {
      ok: false,
      failure: "no_service",
      message: isEn
        ? "LLM_API_KEY is not configured; vision recognition is unavailable"
        : "未配置 LLM_API_KEY，无法使用视觉识别",
    };
  }

  const url = `${env.LLM_BASE_URL.replace(/\/+$/, "")}/chat/completions`;

  // 共享出口 IP 的限流按时间窗口放行，退避重试常能过。间隔故意不等比：1s/4s
  // 覆盖「瞬时抖动」和「一分钟窗口」两种典型窗口，三次都 429 就是真的被限了。
  const BACKOFFS = [0, 1000, 4000];
  let lastError: { failure: OcrCallResult["failure"]; message: string } | null = null;

  for (const delay of BACKOFFS) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.LLM_MODEL_NAME,
          temperature: 0,
          max_tokens: 1200,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: buildPrompt(locale) },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      const isTimeout = e instanceof Error && /timeout|abort/i.test(e.message);
      return {
        ok: false,
        failure: isTimeout ? "timeout" : "network",
        message: isTimeout
          ? (isEn ? "Recognition timed out, please try again" : "识别超时，请重试")
          : (isEn ? "Vision recognition service is unreachable" : "视觉识别服务连不通"),
      };
    }

    if (resp.ok) {
      lastError = null;
      const body = (await resp.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const content = body.choices?.[0]?.message?.content ?? "";
      const jsonText = content.replace(/```(?:json)?\s*/g, "").trim();
      let parsed: Partial<OcrRaw> & {
        category?: { code?: string; l1?: string; l2?: string; confidence?: number; reason?: string };
      };
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        console.error("[ocr-vision] 模型输出不是合法 JSON:", jsonText.slice(0, 300));
        return {
          ok: false,
          failure: "bad_response",
          message: isEn
            ? "Failed to parse the recognition result, please try again"
            : "识别结果解析失败，请重试",
        };
      }

      const category = parsed.category
        ? {
            code: parsed.category.code ?? "other",
            l1: parsed.category.l1 ?? UNCATEGORIZED,
            l2: parsed.category.l2 ?? UNCATEGORIZED,
            confidence: parsed.category.confidence ?? 0.6,
            reason: parsed.category.reason ?? "",
          }
        : null;

      return {
        ok: true,
        usage: body.usage,
        data: {
          rawText: parsed.raw_text ?? null,
          ocrConfidence: parsed.ocr_confidence ?? null,
          merchantName: parsed.merchant_name ?? null,
          amount: parsed.amount ?? null,
          taxAmount: parsed.tax_amount ?? null,
          invoiceDate: parsed.invoice_date ?? null,
          invoiceCode: parsed.invoice_code ?? null,
          invoiceNo: parsed.invoice_no ?? null,
          taxNo: parsed.tax_no ?? null,
          category,
          // 模型明确说不是票据时才判 false；判断依据缺失时宁可当票据处理，
          // 让后续的字段校验去拦，也不要误伤真实票据。
          isInvoice: parsed.is_invoice ?? true,
          invoiceWarning: parsed.invoice_warning ?? null,
          lineCheck: null,
        },
      };
    }

    // 429/5xx 值得重试；4xx（参数/鉴权错误）重试没有意义
    const text = (await resp.text()).slice(0, 200);
    console.error("[ocr-vision] 服务商返回", resp.status, text);
    if (resp.status !== 429 && resp.status < 500) {
      return {
        ok: false,
        failure: "bad_response",
        message: isEn
          ? `Recognition provider returned ${resp.status}: ${text.slice(0, 80)}`
          : `识别服务商返回 ${resp.status}：${text.slice(0, 80)}`,
      };
    }
    lastError = {
      failure: "bad_response",
      message: isEn
        ? `Recognition provider returned ${resp.status}`
        : `识别服务商返回 ${resp.status}`,
    };
  }

  return { ok: false, ...lastError! };
}
