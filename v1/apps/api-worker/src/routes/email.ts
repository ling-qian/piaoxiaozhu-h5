/**
 * 邮件相关接口：收票地址、测试发送、退订。
 *
 * 收票地址按需生成：用户第一次打开会员页才建 token，不给所有账号预生成。
 * 地址里的随机段足够长，别人猜不到，也不需要登录就能往里发信——
 * 这正是它的用途，也是它必须够长的原因。
 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { verifyUnsubscribe, runFindingsDigest } from "../lib/digest";
import { ingestReceiptImage, resolveProjectId } from "../lib/inbound";
import { currentMonth } from "../lib/pack";
import { nowIso } from "../lib/time";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

function inboxDomain(env: Env): string {
  return (env.INBOX_DOMAIN ?? "in.qianling-tech.top").trim();
}

router.get("/me/inbox", async (c) => {
  const u = c.get("user");
  let token = u.inbox_token ?? null;

  if (!token) {
    // 12 字节足够：32 个十六进制字符，猜中一个地址的概率可以忽略
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    await c.env.DB.prepare("UPDATE users SET inbox_token = ? WHERE id = ?").bind(token, u.id).run();
  }

  return c.json({
    address: `r-${token}@${inboxDomain(c.env)}`,
    configured: Boolean(c.env.INBOX_DOMAIN),
  });
});

/**
 * 给自己发一封测试邮件。
 *
 * 用途有两个：验证 Resend 配置还活着，以及让用户在没有任何数据的月份
 * 也能看到这封邮件长什么样。真实推送由 cron 控制，这里不写去重表。
 */
router.post("/email/digest/test", async (c) => {
  const u = c.get("user");
  if (!u.email) {
    return c.json({ detail: "这个账号没有绑定邮箱，发不了" }, 400);
  }
  if ((u as any).email_opt_out) {
    return c.json({ detail: "你已退订提醒邮件，先重新订阅才能测试" }, 400);
  }

  const result = await runFindingsDigest(c.env, currentMonth(), { userId: u.id, force: true });
  if (result.sent === 0) {
    return c.json({ detail: "这封邮件没发出去，检查 Resend 配置或稍后再试" }, 502);
  }
  return c.json({ sent_to: u.email, month: currentMonth(), at: nowIso() });
});

/**
 * 模拟一封建行收票邮件。
 *
 * 存在的理由只有一个：Email Routing 需要配 MX，配好之前没法端到端验证。
 * 这个接口从登录态直接喂附件给同一条入库链路，能先把识别、扣分、入库
 * 三段验通；MX 配好之后它仍然有用——排查「是邮件没进来，还是解析有问题」。
 */
router.post("/email/inbound/test", async (c) => {
  const u = c.get("user");
  const body = await c.req.json<any>().catch(() => ({}));

  const b64 = String(body?.data_base64 ?? "");
  if (!b64) {
    return c.json({ detail: "缺少 data_base64" }, 400);
  }

  let bytes: ArrayBuffer;
  try {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    bytes = arr.buffer;
  } catch {
    return c.json({ detail: "data_base64 不是合法的 base64" }, 400);
  }

  const projectId = await resolveProjectId(c.env, u);
  const result = await ingestReceiptImage(
    c.env,
    u,
    projectId,
    bytes,
    String(body?.filename ?? "receipt.jpg"),
    String(body?.content_type ?? "image/jpeg")
  );

  const status = result.status === "created" ? 201 : result.status === "failed" ? 502 : 200;
  return c.json({ status: result.status, record_id: result.recordId ?? null, project_id: projectId }, status);
});

/** 退订：链接里带签名，不需要登录也能点 */
router.get("/email/unsubscribe", async (c) => {
  const userId = c.req.query("u") ?? "";
  const sig = c.req.query("s") ?? "";

  const ok = userId && sig ? await verifyUnsubscribe(c.env.JWT_SECRET, userId, sig) : false;
  if (!ok) {
    return c.html(
      `<!DOCTYPE html><html><body style="font-family:system-ui;padding:40px;color:#0F172A">
        <p>This unsubscribe link is not valid.</p></body></html>`,
      400
    );
  }

  await c.env.DB.prepare("UPDATE users SET email_opt_out = 1 WHERE id = ?").bind(userId).run();

  return c.html(
    `<!DOCTYPE html><html><body style="font-family:system-ui;padding:40px;color:#0F172A">
      <p style="font-size:18px;font-weight:600">You're unsubscribed.</p>
      <p style="color:#64748B;font-size:14px">You won't get the monthly findings email again.
      Your data and your account are unchanged.</p>
      <p style="margin-top:24px"><a href="https://sortreceipts.qianling-tech.top" style="color:#2563EB;font-size:14px">Back to SortReceipts</a></p>
    </body></html>`
  );
});

export default router;
