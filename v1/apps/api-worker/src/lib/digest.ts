/**
 * 「本月发现」邮件。
 *
 * 这件事的目的不是通知，是把「打开产品」的触发从用户自己想，换成我们主动发。
 * 月底结账一年只疼十二次，中间没有触发，用户第二个月就走了。
 *
 * 内容只写发现：重复付款、缺票、金额异常。不放促销，不放功能介绍。
 * 每月最多一封，靠 `digest_logs` 去重；cron 每小时跑一次也不会重复发。
 */
import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { currencySymbol } from "./currency";
import { buildPack, currentMonth, previousMonth } from "./pack";
import type { PackException, PackRecord } from "./pack";
import { nowIso } from "./time";

export interface DigestProject {
  id: string;
  name: string;
  currency: string;
  recordCount: number;
  exceptions: PackException[];
}

interface DigestContent {
  subject: string;
  html: string;
  text: string;
}

const RECORD_COLUMNS = `id, direction, amount, tax_amount, invoice_date, merchant_name,
  category_l1, category_l2, invoice_no, invoice_code, file_id, reason`;

const LABELS: Record<string, string> = {
  duplicate_invoice_no: "Duplicate invoice number",
  missing_invoice: "Expense with no receipt",
  amount_outlier: "Unusual amount",
  missing_date: "Record with no date",
};

function money(amount: number, code: string): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${currencySymbol(code)}${value.toFixed(2)}`;
}

function monthName(month: string): string {
  const [y, m] = month.split("-");
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const idx = Number(m) - 1;
  return `${names[idx] ?? month} ${y}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDigestEmail(opts: {
  month: string;
  projects: DigestProject[];
  baseUrl: string;
  unsubUrl: string;
}): DigestContent {
  const { month, projects, baseUrl, unsubUrl } = opts;
  const withFindings = projects.filter((p) => p.exceptions.length > 0);
  const total = withFindings.reduce(
    (sum, p) => sum + p.exceptions.reduce((s, e) => s + e.count, 0),
    0
  );
  const label = monthName(month);

  const subject =
    total > 0
      ? `${total} thing${total === 1 ? "" : "s"} to check in your ${label} invoices`
      : `${label}: nothing to check`;

  const rows = withFindings
    .map((p) => {
      const items = p.exceptions
        .slice(0, 4)
        .map((e) => {
          const name = LABELS[e.code] ?? e.code;
          const extra = e.label ? ` · ${escapeHtml(e.label)}` : "";
          return `<li style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#0F172A">
            <strong>${name}</strong>${extra} — ${e.count} record${e.count === 1 ? "" : "s"},
            ${escapeHtml(money(e.amount, p.currency))}
          </li>`;
        })
        .join("");
      return `
        <div style="margin:0 0 20px">
          <p style="margin:0 0 8px;font-size:13px;color:#64748B">${escapeHtml(p.name)}</p>
          <ul style="margin:0;padding-left:18px">${items}</ul>
          <a href="${baseUrl}/project/${p.id}" style="display:inline-block;margin-top:4px;font-size:13px;color:#2563EB;text-decoration:none">
            Open the project →
          </a>
        </div>`;
    })
    .join("");

  const body =
    total > 0
      ? `
        <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#0F172A">
          ${total} item${total === 1 ? "" : "s"} in ${label} are worth a look before the month goes to your accountant.
        </p>
        ${rows}
        <p style="margin:22px 0 0;font-size:13px;line-height:1.65;color:#64748B">
          The full list, the CSV and the read-only link for your accountant are in the monthly pack.
        </p>`
      : `
        <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#0F172A">
          Nothing unusual in ${label}. No duplicate invoice numbers, no expenses missing a receipt,
          no amounts far outside their category.
        </p>
        <p style="margin:0;font-size:13px;line-height:1.65;color:#64748B">
          We check every month and only write when something needs a look.
        </p>`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0F172A">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#2563EB">SortReceipts</p>
      <h1 style="margin:0 0 18px;font-size:20px;line-height:1.35">${escapeHtml(subject)}</h1>
      ${body}
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:26px 0 14px">
      <p style="margin:0;font-size:11px;line-height:1.6;color:#94A3B8">
        You get this because you have a SortReceipts account.
        <a href="${unsubUrl}" style="color:#94A3B8">Unsubscribe</a>.
      </p>
    </div>`;

  const textLines = [
    subject,
    "",
    ...withFindings.flatMap((p) => [
      p.name,
      ...p.exceptions
        .slice(0, 4)
        .map(
          (e) =>
            `- ${LABELS[e.code] ?? e.code}${e.label ? ` (${e.label})` : ""}: ${e.count} record(s), ${money(e.amount, p.currency)}`
        ),
      `${baseUrl}/project/${p.id}`,
      "",
    ]),
    `Unsubscribe: ${unsubUrl}`,
  ];

  return { subject, html, text: textLines.join("\n") };
}

/** 退订链接的签名：用户 id + 固定前缀，防止有人枚举 id 帮别人退订 */
export async function signUnsubscribe(secret: string, userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`digest:${userId}`));
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function verifyUnsubscribe(secret: string, userId: string, sig: string): Promise<boolean> {
  const expected = await signUnsubscribe(secret, userId);
  // 长度不等直接 false，避免 timingSafeEqual 抛错
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

async function sendViaResend(env: Env, to: string, content: DigestContent): Promise<boolean> {
  const key = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!key || !from) {
    console.warn("[digest] 邮件服务未配置，跳过发送");
    return false;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      console.error("[digest] Resend 返回非 2xx:", resp.status, (await resp.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[digest] 发送失败:", e);
    return false;
  }
}

async function loadProjects(db: D1Database, userId: string, month: string): Promise<DigestProject[]> {
  const { results: projects } = await db
    .prepare("SELECT id, name, currency FROM projects WHERE user_id = ? AND status != 'deleted'")
    .bind(userId)
    .all<{ id: string; name: string; currency: string | null }>();

  const out: DigestProject[] = [];
  for (const project of projects ?? []) {
    const { results: records } = await db
      .prepare(`SELECT ${RECORD_COLUMNS} FROM invoice_records WHERE project_id = ? AND user_id = ?`)
      .bind(project.id, userId)
      .all<PackRecord>();
    const pack = buildPack(records ?? [], month, nowIso());
    out.push({
      id: project.id,
      name: project.name,
      currency: project.currency ?? "USD",
      recordCount: pack.summary.record_count,
      exceptions: pack.exceptions,
    });
  }
  return out;
}

/**
 * 发一轮「本月发现」。
 *
 * 只发给有邮箱、没退订、且这个月至少记了一笔的用户。
 * `force` 用于手动测试：跳过去重，但仍然只对指定用户发。
 */
export async function runFindingsDigest(
  env: Env,
  month: string,
  opts: { userId?: string; force?: boolean } = {}
): Promise<{ sent: number; skipped: number; failed: number }> {
  const baseUrl = env.APP_BASE_URL ?? "https://sortreceipts.qianling-tech.top";
  const secret = env.JWT_SECRET;

  const where = opts.userId ? "id = ? AND email IS NOT NULL" : "email IS NOT NULL";
  const binds = opts.userId ? [opts.userId] : [];
  const { results: users } = await env.DB.prepare(
    `SELECT * FROM users WHERE ${where} AND COALESCE(email_opt_out, 0) = 0`
  )
    .bind(...binds)
    .all<UserRow>();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users ?? []) {
    const email = user.email;
    if (!email) {
      skipped += 1;
      continue;
    }

    const projects = await loadProjects(env.DB, user.id, month);
    const totalRecords = projects.reduce((sum, p) => sum + p.recordCount, 0);

    // 没记账的人不发：他还没把这件事交给我们，收到邮件只会觉得被打扰。
    // 手动测试要跳过这一条：测试按钮的用途就是「让我看看这封邮件长什么样」，
    // 而用户点它的时候往往本月还没记几笔。
    if (totalRecords === 0 && !opts.force) {
      skipped += 1;
      continue;
    }

    if (!opts.force) {
      const fresh = await env.DB.prepare(
        `INSERT OR IGNORE INTO digest_logs (user_id, month, kind, sent_at) VALUES (?, ?, 'findings', ?)`
      )
        .bind(user.id, month, nowIso())
        .run();
      if (!fresh.meta.changes) {
        skipped += 1;
        continue;
      }
    }

    const sig = await signUnsubscribe(secret, user.id);
    const unsubUrl = `${baseUrl}/api/email/unsubscribe?u=${encodeURIComponent(user.id)}&s=${sig}`;
    const content = buildDigestEmail({ month, projects, baseUrl, unsubUrl });

    const ok = await sendViaResend(env, email, content);
    if (ok) {
      sent += 1;
    } else {
      failed += 1;
      // 发失败要把去重记录删掉，否则今天没发出去，这个月也不会再补
      await env.DB.prepare("DELETE FROM digest_logs WHERE user_id = ? AND month = ? AND kind = 'findings'")
        .bind(user.id, month)
        .run();
    }
  }

  return { sent, skipped, failed };
}

/**
 * cron 入口：只在每月 1 日和 15 日的 09:00 UTC 各发一次。
 *
 * 1 日发上个月（月底交付），15 日发当月（月中提醒）。
 * 定时器每小时触发，其余时间直接返回，不做任何查询。
 */
export async function maybeRunScheduledDigest(env: Env, now: Date = new Date()): Promise<void> {
  if (now.getUTCHours() !== 9) return;
  const day = now.getUTCDate();
  if (day !== 1 && day !== 15) return;

  const month = day === 1 ? previousMonth(now) : currentMonth(now);
  const result = await runFindingsDigest(env, month);
  console.log(
    `[digest] ${month} 发送=${result.sent} 跳过=${result.skipped} 失败=${result.failed}`
  );
}
