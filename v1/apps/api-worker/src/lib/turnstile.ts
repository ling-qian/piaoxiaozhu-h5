/**
 * 人机验证（Cloudflare Turnstile）。
 *
 * 选 Turnstile 的理由：它是 Cloudflare 自家的，和 Worker 同一个后台，
 * 免费且不需要用户点红绿灯之外的任何东西；对真实用户几乎无感，
 * 对脚本则要求它在页面里真跑一遍 JS。
 *
 * 校验必须在服务端做。前端那个 token 只是「我跑过脚本」的自述，
 * 谁都能伪造一个字符串塞进请求体。
 */

import type { Env } from "../env";
import type { Locale } from "./locale";
import { badRequest, serverError } from "./http";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function assertHuman(
  env: Env,
  token: string | undefined,
  ip: string | undefined,
  locale: Locale
): Promise<void> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw serverError(
      locale === "zh"
        ? "人机验证还没配置，暂时无法注册"
        : "Human verification is not configured yet, so sign-up is unavailable"
    );
  }

  const value = (token ?? "").trim();
  if (!value) {
    throw badRequest(locale === "zh" ? "请先完成人机验证" : "Please complete the human verification first");
  }

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", value);
  // 带上来源 IP，Turnstile 会拿它和服务端看到的一致性和风控数据作比对
  if (ip) form.append("remoteip", ip);

  let resp: Response;
  try {
    resp = await fetch(VERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.error("[turnstile] 校验请求失败:", e);
    throw serverError(
      locale === "zh" ? "人机验证服务暂时不可用，请稍后重试" : "Human verification is unavailable right now"
    );
  }

  const data = (await resp.json().catch(() => null)) as { success?: boolean } | null;
  if (!resp.ok || !data?.success) {
    throw badRequest(
      locale === "zh" ? "人机验证未通过，请重试" : "Human verification failed. Please try again."
    );
  }
}
