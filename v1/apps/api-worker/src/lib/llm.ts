/**
 * LLM 客户端（OpenAI 兼容接口）。
 *
 * 与旧后端一致的三点，缺一都会让线上行为漂移：
 *   1. `temperature: 0`（意图解析必须可复现）
 *   2. 解析失败**不抛异常**，返回 null，由调用方决定重试或降级
 *   3. 超时区分「超时」与「连不通」，错误信息给用户看时要能区分
 */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCallOptions {
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  /** 毫秒；AI 分析可能 20s+，默认给足 */
  timeoutMs?: number;
}

export type LlmFailure = "no_key" | "timeout" | "network" | "bad_response";

export interface LlmResult {
  ok: boolean;
  text: string;
  failure?: LlmFailure;
}

export async function chat(opts: LlmCallOptions): Promise<LlmResult> {
  if (!opts.apiKey) return { ok: false, text: "", failure: "no_key" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

  try {
    const resp = await fetch(`${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      console.error("[llm] HTTP", resp.status, (await resp.text()).slice(0, 200));
      return { ok: false, text: "", failure: "bad_response" };
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) return { ok: false, text: "", failure: "bad_response" };
    return { ok: true, text };
  } catch (e) {
    const isAbort = e instanceof Error && /abort|timeout/i.test(e.message);
    console.error("[llm] 调用失败:", e);
    return { ok: false, text: "", failure: isAbort ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** 从模型输出里抠出 JSON 对象（容忍 ```json 包裹与前后废话） */
export function extractJson(content: string): Record<string, unknown> | null {
  let text = (content ?? "").trim();

  const block = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/.exec(text);
  if (block?.[1]) {
    text = block[1];
  } else {
    const obj = /\{[\s\S]*\}/.exec(text);
    if (obj) text = obj[0];
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 金额格式化：¥1,234.50（与 Python 的 `{:,.2f}` 一致） */
export function formatMoney(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  return `¥${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
