/**
 * 邮件总入口。
 *
 * 一个 Worker 只能有一个 `email` 处理器，而同一个域名下有两类完全不同的信：
 *
 *   1. `r-<token>@in.qianling-tech.top` —— 用户转发过来的票据，要识别入库；
 *   2. `support@` / `billing@` / `privacy@` —— 人写来的信，要分类后转给收件箱。
 *
 * 按收件域名分流，不按地址前缀猜。两类逻辑各自独立，任何一边出问题
 * 都不该影响另一边；不认识的地址明确退信，避免信被吞掉。
 */
import type { Env } from "../env";
import { handleReceiptEmail } from "./inbound";
import { handleSupportEmail, supportTagOf } from "./support-mail";

const DEFAULT_INBOX_DOMAIN = "in.qianling-tech.top";

export async function handleInboundEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const to = (message.to ?? "").trim().toLowerCase();
  const domain = to.split("@")[1] ?? "";
  const inboxDomain = (env.INBOX_DOMAIN ?? DEFAULT_INBOX_DOMAIN).trim().toLowerCase();

  if (domain === inboxDomain) {
    await handleReceiptEmail(message, env);
    return;
  }

  if (supportTagOf(to)) {
    await handleSupportEmail(message, env);
    return;
  }

  console.warn("[mail] 收件人不认识:", to);
  message.setReject("No such recipient");
}
