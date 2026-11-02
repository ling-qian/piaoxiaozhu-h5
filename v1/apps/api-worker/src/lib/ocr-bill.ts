/**
 * 供应商账单识别：一张月结单读出多行。
 *
 * 与 `ocr-vision.ts` 的区别只有一处：那边一次读一张小票、出一个金额，
 * 这边一次读一张对账单、出 N 行明细。两条通道共用同一个视觉模型，
 * 但提示词不同——把两种任务塞进一个提示词，模型会按更简单的那个输出。
 *
 * 失败语义与 `recognizeViaLLM` 保持一致（no_service / timeout / network /
 * bad_response），前端已经按这套分类写好了提示。
 */

import type { Locale } from "./locale";
import { CATEGORIES_EN, CATEGORIES_ZH } from "./ocr-vision";

/** 一张对账单最多接受的明细行数。超过就截断，避免一条记录吃掉整月额度 */
export const MAX_BILL_LINES = 60;

export interface BillLine {
  lineNo: number;
  description: string | null;
  amount: number;
  taxAmount: number | null;
  date: string | null;
  categoryCode: string | null;
  categoryL1: string | null;
  categoryL2: string | null;
  confidence: number | null;
}

export interface BillDraft {
  supplierName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string | null;
  totalAmount: number | null;
  taxAmount: number | null;
  lines: BillLine[];
  rawText: string | null;
  isBill: boolean;
  warning: string | null;
}

export type BillCallResult =
  | { ok: true; data: BillDraft }
  | { ok: false; failure: "no_service" | "timeout" | "network" | "bad_response"; message: string };

function buildBillPrompt(locale: Locale): string {
  const isEn = locale === "en";
  const cats = isEn ? CATEGORIES_EN : CATEGORIES_ZH;
  return `You are a strict OCR engine for supplier statements (monthly bills from vendors).
Read the attached image and reply with ONLY a JSON object (no markdown, no explanation):
{
  "supplier_name": string | null,
  "period_start": "YYYY-MM-DD" | null,
  "period_end": "YYYY-MM-DD" | null,
  "currency": string | null,
  "total_amount": number | null,
  "tax_amount": number | null,
  "is_bill": boolean,
  "warning": string | null,
  "lines": [
    {
      "description": string | null,
      "amount": number | null,
      "tax_amount": number | null,
      "date": "YYYY-MM-DD" | null,
      "category": {"code": string, "l1": string, "l2": string, "confidence": number} | null
    }
  ],
  "raw_text": string | null
}

Rules:
- Extract ONE entry per physical line item with its own amount. Do not merge rows.
- Skip summary rows such as subtotal, tax total, previous balance, or amount due.
- amount is a plain number in the currency printed on the document. Never invent a value; use null if unreadable.
- If the image is a single receipt rather than a statement, set is_bill=false and explain in warning, and still fill "lines" with the one receipt.
- category.code MUST be one of: ${cats.join(", ")}.
- category.l1 / l2 must be written in ${isEn ? "English" : "Simplified Chinese"}.
- Limit to the first ${MAX_BILL_LINES} line items. If there are more, set warning accordingly.
- raw_text: transcribe visible text, one line per row.`;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // 模型偶尔把金额写成 "42.50" 或 "$42.50"，只接受能干净转成数字的字符串
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeLine(raw: any, index: number): BillLine | null {
  const amount = toNumber(raw?.amount);
  if (amount === null) return null;

  const tax = toNumber(raw?.tax_amount);
  const conf = raw?.category?.confidence;
  const category = raw?.category ?? null;

  return {
    lineNo: index + 1,
    description: typeof raw?.description === "string" ? raw.description : null,
    amount,
    taxAmount: tax,
    date: typeof raw?.date === "string" ? raw.date : null,
    categoryCode: typeof category?.code === "string" ? category.code : null,
    categoryL1: typeof category?.l1 === "string" ? category.l1 : null,
    categoryL2: typeof category?.l2 === "string" ? category.l2 : null,
    confidence: Number.isFinite(conf) ? Math.min(Math.max(Number(conf), 0), 1) : null,
  };
}

export async function recognizeBillViaLLM(
  imageUrl: string,
  env: { LLM_BASE_URL: string; LLM_MODEL_NAME: string; LLM_API_KEY?: string },
  locale: Locale = "zh"
): Promise<BillCallResult> {
  const isEn = locale === "en";

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
  // 与 ocr-vision 相同的退避节奏：1s 覆盖瞬时抖动，4s 覆盖一分钟窗口
  const BACKOFFS = [0, 1000, 4000];
  let lastError: { failure: "bad_response"; message: string } | null = null;

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
          // 单张小票 1200 够用，对账单 60 行不够。这里放宽到 4000，
          // 代价只是未用到的输出不产生计费。
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: buildBillPrompt(locale) },
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
          ? isEn ? "Recognition timed out, please try again" : "识别超时，请重试"
          : isEn ? "Vision recognition service is unreachable" : "视觉识别服务连不通",
      };
    }

    if (resp.ok) {
      const body = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content ?? "";
      const jsonText = content.replace(/```(?:json)?\s*/g, "").trim();

      let parsed: any;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        console.error("[ocr-bill] 模型输出不是合法 JSON:", jsonText.slice(0, 300));
        return {
          ok: false,
          failure: "bad_response",
          message: isEn
            ? "Failed to parse the recognition result, please try again"
            : "识别结果解析失败，请重试",
        };
      }

      const rawLines: any[] = Array.isArray(parsed?.lines) ? parsed.lines : [];
      // 先按原始顺序解析，丢掉读不出金额的行，再重新连续编号：
      // 中间留空号会让「第 2 行缺失」看起来像丢了一笔钱。
      const lines: BillLine[] = rawLines
        .slice(0, MAX_BILL_LINES)
        .map((raw: any) => normalizeLine(raw, 0))
        .filter((l: BillLine | null): l is BillLine => l !== null)
        .map((l: BillLine, i: number) => ({ ...l, lineNo: i + 1 }));

      // 模型没给总额时用明细求和兜底。少一行就少一笔钱，
      // 所以这里只在总额缺失时使用，不用它覆盖模型读到的总额。
      const total =
        typeof parsed?.total_amount === "number" && Number.isFinite(parsed.total_amount)
          ? parsed.total_amount
          : lines.length > 0
            ? Math.round(lines.reduce((s: number, l: BillLine) => s + l.amount, 0) * 100) / 100
            : null;

      return {
        ok: true,
        data: {
          supplierName: typeof parsed?.supplier_name === "string" ? parsed.supplier_name : null,
          periodStart: typeof parsed?.period_start === "string" ? parsed.period_start : null,
          periodEnd: typeof parsed?.period_end === "string" ? parsed.period_end : null,
          currency: typeof parsed?.currency === "string" ? parsed.currency : null,
          totalAmount: total,
          taxAmount:
            parsed?.tax_amount === null || parsed?.tax_amount === undefined
              ? null
              : Number.isFinite(Number(parsed.tax_amount))
                ? Number(parsed.tax_amount)
                : null,
          lines,
          rawText: typeof parsed?.raw_text === "string" ? parsed.raw_text : null,
          isBill: parsed?.is_bill ?? true,
          warning: typeof parsed?.warning === "string" ? parsed.warning : null,
        },
      };
    }

    const text = (await resp.text()).slice(0, 200);
    console.error("[ocr-bill] 服务商返回", resp.status, text);
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

  return { ok: false, failure: lastError?.failure ?? "bad_response", message: lastError?.message ?? "识别失败" };
}
