/**
 * 识别成本实测脚本。
 *
 * 跑一批真实票据图片，走与线上相同的视觉模型调用，记录每张的上传耗时、
 * 模型耗时、token 用量与识别结果。结果按图片名缓存，中断后重跑会跳过已完成的。
 *
 * 用法（在 api-worker 目录）：
 *   npx vite-node scripts/measure-ocr-cost.mts -- --dir=/tmp/ocr-cost/img --out=/tmp/ocr-cost/results.json
 *   npx vite-node scripts/measure-ocr-cost.mts -- --dir=/tmp/ocr-cost/img --limit=1
 *
 * 密钥从 v1/services/api/.env 与 sortreceipts/.env 读，缺哪个补哪个，不打印值。
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { cosUploadForVision } from "../src/lib/cos";
import { toDataUrl } from "../src/lib/ocr";
import { recognizeViaLLM } from "../src/lib/ocr-vision";

const ENV_FILES = [
  "/Users/tom/work/piaoxiaozhu/v1/services/api/.env",
  "/Users/tom/work/piaoxiaozhu/sortreceipts/.env",
];

const KEYS = [
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL_NAME",
  "COS_BUCKET_NAME",
  "COS_REGION",
  "COS_SECRET_ID",
  "COS_SECRET_KEY",
] as const;

type Key = (typeof KEYS)[number];

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function loadEnv(): Promise<Record<Key, string>> {
  const files: Record<string, string>[] = [];
  for (const file of ENV_FILES) {
    try {
      files.push(parseEnv(await readFile(file, "utf8")));
    } catch {
      // 文件不存在就跳过
    }
  }
  const merged = {} as Record<Key, string>;
  for (const key of KEYS) {
    merged[key] = files.map((f) => f[key]).find((v) => v) ?? "";
  }
  return merged;
}

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

interface SampleResult {
  file: string;
  bytes: number;
  image_source: "cos" | "data_url";
  upload_ms: number;
  llm_ms: number;
  ok: boolean;
  failure?: string;
  message?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number; image_tokens?: number };
  };
  merchant?: string | null;
  amount?: number | null;
  invoice_date?: string | null;
  category_code?: string | null;
  is_invoice?: boolean;
}

interface ResultFile {
  started_at: string;
  updated_at: string;
  model: string;
  endpoint: string;
  locale: string;
  samples: SampleResult[];
}

async function main() {
  const dir = arg("dir", "/tmp/ocr-cost/img");
  const out = arg("out", "/tmp/ocr-cost/results.json");
  const limit = Number(arg("limit", "0"));
  const locale = arg("locale", "en") === "zh" ? "zh" : "en";
  /** 国内节点与主站同 Key 同模型；主站走 Cloudflare，在本机常常连不通 */
  const baseOverride = arg("base", "");

  const loaded = await loadEnv();
  const env = { ...loaded, LLM_BASE_URL: baseOverride || loaded.LLM_BASE_URL };
  if (!env.LLM_API_KEY || !env.LLM_BASE_URL || !env.LLM_MODEL_NAME) {
    throw new Error("缺少 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL_NAME，检查 .env");
  }

  const files = (await readdir(dir))
    .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
    .sort();
  const target = limit > 0 ? files.slice(0, limit) : files;

  const previous: ResultFile | null = existsSync(out)
    ? JSON.parse(await readFile(out, "utf8"))
    : null;
  const cache = new Map(
    (previous?.samples ?? []).filter((s) => s.ok).map((s) => [s.file, s])
  );

  const result: ResultFile = {
    started_at: previous?.started_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    model: env.LLM_MODEL_NAME,
    endpoint: env.LLM_BASE_URL,
    locale,
    samples: [],
  };

  const cosReady = Boolean(
    env.COS_BUCKET_NAME && env.COS_REGION && env.COS_SECRET_ID && env.COS_SECRET_KEY
  );
  const gapMs = Number(arg("gap", "4000"));

  async function call(buf: ArrayBuffer) {
    const uploadStart = performance.now();
    const cosUrl = cosReady ? await cosUploadForVision(buf, env) : null;
    const uploadMs = Math.round(performance.now() - uploadStart);

    const llmStart = performance.now();
    const result = await recognizeViaLLM(cosUrl ?? toDataUrl(buf), env, locale);
    const llmMs = Math.round(performance.now() - llmStart);

    return { result, cos: cosUrl, uploadMs, llmMs };
  }

  /** 免费额度按分钟限流，识别失败里只有这一种值得整张重试 */
  function isRateLimited(r: { failure?: string; message?: string }) {
    return r.failure === "bad_response" && /429|rate limit|请求太频繁/i.test(r.message ?? "");
  }

  for (const [i, file] of target.entries()) {
    const cached = cache.get(file);
    if (cached) {
      result.samples.push(cached);
      console.log(`[${i + 1}/${target.length}] ${file} 已测过，跳过`);
      continue;
    }

    const bytes = await readFile(path.join(dir, file));
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    let res = await call(buf);
    // 免费额度按分钟限流。撞上了就等一分钟再试，别把这一张记成失败
    for (let wait = 0; !res.result.ok && isRateLimited(res.result) && wait < 2; wait += 1) {
      console.log(`  ${file} 被限流，等待 60 秒后重试`);
      await new Promise((r) => setTimeout(r, 60_000));
      res = await call(buf);
    }

    const sample: SampleResult = {
      file,
      bytes: buf.byteLength,
      image_source: res.cos ? "cos" : "data_url",
      upload_ms: res.uploadMs,
      llm_ms: res.llmMs,
      ok: res.result.ok,
      failure: res.result.failure,
      message: res.result.message,
      usage: res.result.usage,
      merchant: res.result.data?.merchantName ?? null,
      amount: res.result.data?.amount ?? null,
      invoice_date: res.result.data?.invoiceDate ?? null,
      category_code: res.result.data?.category?.code ?? null,
      is_invoice: res.result.data?.isInvoice,
    };

    result.samples.push(sample);
    result.updated_at = new Date().toISOString();
    await writeFile(out, JSON.stringify(result, null, 2));

    console.log(
      `[${i + 1}/${target.length}] ${file} ok=${sample.ok} upload=${sample.upload_ms}ms llm=${sample.llm_ms}ms ` +
        `tokens=${sample.usage?.total_tokens ?? "-"} bytes=${sample.bytes}`
    );
    if (!sample.ok) console.log(`  ${sample.failure}: ${sample.message}`);

    // 给共享出口留一点间隔，避免连续调用被限流
    await new Promise((r) => setTimeout(r, gapMs));
  }

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(result, null, 2));

  const okCount = result.samples.filter((s) => s.ok).length;
  const totalMs = result.samples.reduce((n, s) => n + s.upload_ms + s.llm_ms, 0);
  console.log(`\n完成 ${result.samples.length} 张：成功 ${okCount}，总耗时 ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`结果写入 ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
