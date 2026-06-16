// ─── LLM 分类模块：缓存 + 熔断 + 退避 ───
import { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } from "@/lib/env";

const LLM_TIMEOUT_MS = 15_000;

const VALID_CATEGORY_CODES = new Set([
  "food_material", "rent", "salary", "utilities",
  "platform_fee", "advertising", "office", "other",
]);

interface LlmCategorizeResult {
  categoryCode: string;
  categoryL1: string;
  reason: string;
}

// ─── LRU 缓存 ───
const LLM_CACHE_MAX = 500;
const llmCache = new Map<string, LlmCategorizeResult>();

function getCachedResult(merchantName: string | null): LlmCategorizeResult | null {
  if (!merchantName) return null;
  return llmCache.get(merchantName) ?? null;
}

function setCachedResult(merchantName: string | null, result: LlmCategorizeResult): void {
  if (!merchantName) return;
  if (llmCache.size >= LLM_CACHE_MAX) {
    const firstKey = llmCache.keys().next().value;
    if (firstKey !== undefined) llmCache.delete(firstKey);
  }
  llmCache.set(merchantName, result);
}

// ─── 熔断器（Circuit Breaker） ───
// 连续失败 5 次 → 打开 → 冷却 30 秒 → 半开 → 允许一次试探
interface CircuitState {
  failures: number;
  state: "closed" | "open" | "half-open";
  openedAt: number | null;
}

const circuit: CircuitState = { failures: 0, state: "closed", openedAt: null };
const CIRCUIT_THRESHOLD = 5;       // 连续失败多少次打开熔断
const CIRCUIT_COOLDOWN_MS = 30_000; // 冷却 30 秒

function isCircuitOpen(): boolean {
  if (circuit.state === "closed") return false;
  if (circuit.state === "half-open") return false;
  // open
  if (circuit.openedAt && Date.now() - circuit.openedAt >= CIRCUIT_COOLDOWN_MS) {
    circuit.state = "half-open";
    return false;
  }
  return true;
}

function recordSuccess(): void {
  circuit.failures = 0;
  circuit.state = "closed";
  circuit.openedAt = null;
}

function recordFailure(): void {
  circuit.failures++;
  if (circuit.failures >= CIRCUIT_THRESHOLD && circuit.state !== "open") {
    circuit.state = "open";
    circuit.openedAt = Date.now();
    console.warn(`[llmCategorize] 熔断器打开，连续失败 ${circuit.failures} 次，${CIRCUIT_COOLDOWN_MS / 1000}s 后恢复`);
  }
}

// ─── 指数退避重试 ───
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.warn(`[llmCategorize] 第 ${attempt + 1} 次重试，等待 ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

export async function llmCategorize(
  merchantName: string | null,
  rawText: string
): Promise<LlmCategorizeResult | null> {
  if (!LLM_API_KEY) {
    console.warn("[llmCategorize] LLM_API_KEY 未配置，跳过 LLM 分类");
    return null;
  }

  // 缓存命中
  const cached = getCachedResult(merchantName);
  if (cached) {
    return { ...cached, reason: `缓存命中: ${cached.reason}` };
  }

  // 熔断检查
  if (isCircuitOpen()) {
    console.warn("[llmCategorize] 熔断器打开，跳过 LLM 调用，使用兜底分类");
    return fallbackCategory(merchantName);
  }

  try {
    const result = await withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
      try {
        const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LLM_API_KEY}`,
          },
          body: JSON.stringify({
            model: LLM_MODEL,
            messages: [
              {
                role: "system",
                content: `你是一个餐饮票据分类助手。根据商户名称和票据文本，将支出分类为以下之一：
- food_material: 食材
- rent: 房租
- salary: 工资
- utilities: 水电燃气
- platform_fee: 平台佣金
- advertising: 广告推广
- office: 办公用品
- other: 其他

请严格以JSON格式回复：{"categoryCode":"xxx","categoryL1":"xxx","reason":"xxx"}`,
              },
              {
                role: "user",
                content: `商户名称: ${merchantName || "未知"}\n票据文本: ${rawText.substring(0, 500)}`,
              },
            ],
            temperature: 0.1,
            max_tokens: 200,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          console.error(`[llmCategorize] API 返回错误: ${response.status} ${response.statusText}`);
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("empty response");

        const jsonMatch = content.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) throw new Error("no JSON in response");

        const parsed = JSON.parse(jsonMatch[0]);
        const categoryCode = parsed.categoryCode || "other";

        if (!VALID_CATEGORY_CODES.has(categoryCode)) {
          console.warn(`[llmCategorize] LLM 返回了无效分类: ${categoryCode}，降级为 other`);
          const fallbackResult: LlmCategorizeResult = {
            categoryCode: "other",
            categoryL1: "其他",
            reason: `LLM返回无效分类(${categoryCode})，已降级`,
          };
          setCachedResult(merchantName, fallbackResult);
          return fallbackResult;
        }

        return {
          categoryCode,
          categoryL1: parsed.categoryL1 || "其他",
          reason: parsed.reason || "LLM分类",
        } satisfies LlmCategorizeResult;
      } finally {
        clearTimeout(timeoutId);
      }
    });

    recordSuccess();
    return result;
  } catch (err) {
    recordFailure();
    console.error("[llmCategorize] 调用失败:", err);
    return fallbackCategory(merchantName);
  }
}

// ─── 兜底分类（基于关键词） ───
function fallbackCategory(merchantName: string | null): LlmCategorizeResult {
  if (!merchantName) {
    return { categoryCode: "other", categoryL1: "其他", reason: "商户名为空，兜底分类" };
  }
  const name = merchantName.toLowerCase();
  if (/美团|饿了么|口碑/.test(name)) {
    return { categoryCode: "platform_fee", categoryL1: "平台佣金", reason: "关键词匹配兜底" };
  }
  if (/租金|房东|物业/.test(name)) {
    return { categoryCode: "rent", categoryL1: "房租", reason: "关键词匹配兜底" };
  }
  if (/工资|薪资|薪酬/.test(name)) {
    return { categoryCode: "salary", categoryL1: "工资", reason: "关键词匹配兜底" };
  }
  if (/水|电|气|燃气/.test(name)) {
    return { categoryCode: "utilities", categoryL1: "水电燃气", reason: "关键词匹配兜底" };
  }
  if (/广告|推广|抖音|快手/.test(name)) {
    return { categoryCode: "advertising", categoryL1: "广告推广", reason: "关键词匹配兜底" };
  }
  if (/食材|蔬菜|肉类|粮油|海鲜|调料/.test(name)) {
    return { categoryCode: "food_material", categoryL1: "食材", reason: "关键词匹配兜底" };
  }
  return { categoryCode: "other", categoryL1: "其他", reason: "关键词匹配兜底" };
}
