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
  /** 上游 HTTP 状态码；超时和连不通没有这个值 */
  status?: number;
  /** 上游返回的原文（截断到 120 字）。失败原因要能说清楚，否则用户只看到一句「不可用」 */
  detail?: string;
}

/**
 * 调一次模型。失败时把状态码和原文一起带回去，重试判断与报错文案都靠它。
 */
export async function chat(opts: LlmCallOptions): Promise<LlmResult> {
  if (!opts.apiKey) return { ok: false, text: "", failure: "no_key" };

  // 429（含服务商网关的 1015 限流页）和 5xx 多是一次性的，隔几秒再打一次常能过。
  // 其余 4xx 是请求本身有问题（密钥、模型名、参数），重试没有意义。
  let last: LlmResult = { ok: false, text: "", failure: "network" };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
    last = await chatOnce(opts);
    if (last.ok) return last;
    if (!last.status || (last.status !== 429 && last.status < 500)) return last;
  }
  return last;
}

async function chatOnce(opts: LlmCallOptions): Promise<LlmResult> {
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
      // 只读前 300 字：网关的限流页和鉴权错误都很短，读全了反而拖慢失败路径
      const body = (await resp.text()).slice(0, 300);
      console.error("[llm] HTTP", resp.status, body.slice(0, 200));
      return {
        ok: false,
        text: "",
        failure: "bad_response",
        status: resp.status,
        detail: body.slice(0, 120),
      };
    }

    let data: {
      choices?: Array<{ message?: { content?: string } }>;
    };
    try {
      data = (await resp.json()) as typeof data;
    } catch {
      // 200 但正文不是 JSON，通常是网关插了一页 HTML
      return { ok: false, text: "", failure: "bad_response", status: resp.status, detail: "response is not JSON" };
    }
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) {
      return { ok: false, text: "", failure: "bad_response", status: resp.status, detail: "empty content" };
    }
    return { ok: true, text };
  } catch (e) {
    const isAbort = e instanceof Error && /abort|timeout/i.test(e.message);
    console.error("[llm] 调用失败:", e);
    return {
      ok: false,
      text: "",
      failure: isAbort ? "timeout" : "network",
      detail: e instanceof Error ? e.message.slice(0, 120) : undefined,
    };
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

/** 金额格式化：¥1,234.50（与 Python 的 `{:,.2f}` 一致）。symbol 由项目币种决定。 */
export function formatMoney(v: number, symbol = "¥"): string {
  const n = Number.isFinite(v) ? v : 0;
  return `${symbol}${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
