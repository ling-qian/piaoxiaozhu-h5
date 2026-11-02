/**
 * 发验证码邮件。
 *
 * 为什么选 Resend 而不是别的：Cloudflare Worker 里没有 SMTP，能用的只有
 * HTTP 接口。Resend 的接口是一个 POST，密钥一配就能用，也没有额外 SDK 要把。
 *
 * 发件域名必须在 Resend 后台验证过 SPF/DKIM，否则对方收件箱会把信判为垃圾邮件。
 * 这一步在 DNS 里做，代码这边只认 `EMAIL_FROM` 这个字符串。
 */

import type { Env } from "../env";
import type { Locale } from "./locale";
import { serverError } from "./http";

interface Mail {
  subject: string;
  html: string;
  text: string;
}

function buildMail(code: string, ttlMinutes: number, locale: Locale): Mail {
  if (locale === "zh") {
    return {
      subject: `${code} 是你的 SortReceipts 验证码`,
      text: `你的 SortReceipts 注册验证码是 ${code}，${ttlMinutes} 分钟内有效。\n如果不是你本人操作，忽略这封邮件即可。`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0B1220">
          <p style="font-size:14px;color:#55606E;margin:0 0 8px">SortReceipts 注册验证</p>
          <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:0 0 24px">${code}</p>
          <p style="font-size:14px;line-height:1.7;color:#55606E;margin:0 0 8px">
            把这六位数字填进注册页面即可。验证码 ${ttlMinutes} 分钟内有效。
          </p>
          <p style="font-size:13px;line-height:1.7;color:#8B95A1;margin:16px 0 0">
            如果不是你本人操作，忽略这封邮件即可，你的邮箱不会被注册。
          </p>
        </div>`,
    };
  }

  return {
    subject: `${code} is your SortReceipts code`,
    text: `Your SortReceipts verification code is ${code}. It expires in ${ttlMinutes} minutes.\nIf you did not request it, ignore this email.`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0B1220">
        <p style="font-size:14px;color:#55606E;margin:0 0 8px">Verify your email for SortReceipts</p>
        <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:0 0 24px">${code}</p>
        <p style="font-size:14px;line-height:1.7;color:#55606E;margin:0 0 8px">
          Enter this six-digit code on the sign-up page. It expires in ${ttlMinutes} minutes.
        </p>
        <p style="font-size:13px;line-height:1.7;color:#8B95A1;margin:16px 0 0">
          If you did not ask for this, ignore the email — no account will be created.
        </p>
      </div>`,
  };
}

export async function sendVerificationEmail(
  env: Env,
  to: string,
  code: string,
  ttlMinutes: number,
  locale: Locale
): Promise<void> {
  const key = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;

  if (!key || !from) {
    throw serverError(
      locale === "zh"
        ? "邮件服务还没配置，暂时发不出验证码"
        : "Email delivery is not configured yet, so no code can be sent"
    );
  }

  const mail = buildMail(code, ttlMinutes, locale);

  let resp: Response;
  try {
    resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.error("[email] Resend 请求失败:", e);
    throw serverError(
      locale === "zh" ? "验证码邮件发送失败，请稍后重试" : "Could not send the email. Please try again."
    );
  }

  if (!resp.ok) {
    console.error("[email] Resend 返回非 2xx:", resp.status, (await resp.text()).slice(0, 200));
    throw serverError(
      locale === "zh" ? "验证码邮件发送失败，请稍后重试" : "Could not send the email. Please try again."
    );
  }
}
