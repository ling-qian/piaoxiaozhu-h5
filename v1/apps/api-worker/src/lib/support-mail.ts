/**
 * support@ 等公开邮箱的分拣。
 *
 * 为什么不在 Cloudflare 控制台直接建几条转发规则：地址会越加越多
 * （support、billing、privacy、partner），规则散在控制台里，改一次要
 * 登录一次，也没法在 PR 里审。分拣逻辑放在代码里，加地址就是改一行表。
 *
 * 三条边界：
 *   1. 只转发，不回信。`reply()` 要求来信通过 DMARC、回信域名与收信域名一致，
 *      任何一条不满足就抛异常；对这个体量的业务，自动回复带来的误判
 *      比省下的时间更贵。
 *   2. 转发目标必须是 Email Routing 里已验证的地址，否则 `forward()` 抛错。
 *      所以目标地址从环境变量读，不写死。
 *   3. 日志只记分类和大小，不记主题与正文。客服邮箱里全是用户隐私。
 */
import type { Env } from "../env";

/** 分拣结果。`tag` 会写进转发头，收件箱里按标签建过滤规则 */
export type SupportTag = "support" | "billing" | "legal" | "partners";

export interface SupportClassification {
  tag: SupportTag;
  urgent: boolean;
  /** 命中原因，只进日志与头部，不碰正文 */
  reason: string;
}

/** 收件地址 → 默认分类。没列出的本地部分一律退信，不做 catch-all */
const ALIAS_TAGS: Record<string, SupportTag> = {
  support: "support",
  help: "support",
  hello: "support",
  billing: "billing",
  payment: "billing",
  payments: "billing",
  refund: "billing",
  privacy: "legal",
  legal: "legal",
  dpo: "legal",
  partner: "partners",
  partners: "partners",
};

/**
 * 主题里的升级信号。
 *
 * 只匹配关键词，不做语义判断：宁可漏掉一封该加急的，也不要把普通咨询
 * 全标成 urgent——标签一旦总是红的，就不再有人看它。
 */
const URGENT_RULES: Array<{ tag: SupportTag; words: string[]; reason: string }> = [
  {
    tag: "billing",
    words: ["refund", "chargeback", "charged twice", "double charged", "duplicate charge", "退款", "重复扣款", "多扣"],
    reason: "billing-dispute",
  },
  {
    tag: "legal",
    words: ["gdpr", "ccpa", "delete my data", "delete my account data", "subpoena", "law enforcement", "删除数据", "数据删除"],
    reason: "data-request",
  },
  {
    tag: "support",
    words: ["cannot log in", "can't log in", "locked out", "无法登录", "登不进去", "付了钱还是"],
    reason: "access-blocked",
  },
];

/** 从收件地址取分类；不认识的本地部分返回 null，由调用方退信 */
export function supportTagOf(to: string): SupportTag | null {
  const local = to.trim().toLowerCase().split("@")[0] ?? "";
  return ALIAS_TAGS[local] ?? null;
}

/**
 * 给一封来信分类。
 *
 * 主题命中升级规则时，分类跟着规则走：一封发到 support@ 的退款投诉
 * 应该落在账单，而不是留在通用队列里等。
 */
export function classifySupportMail(input: { to: string; subject: string }): SupportClassification | null {
  const baseTag = supportTagOf(input.to);
  if (!baseTag) return null;

  const subject = input.subject.toLowerCase();
  for (const rule of URGENT_RULES) {
    if (rule.words.some((word) => subject.includes(word))) {
      return { tag: rule.tag, urgent: true, reason: rule.reason };
    }
  }

  return { tag: baseTag, urgent: false, reason: "default" };
}

/** Email Routing 的 support 分支：分类后转发给已验证的收件箱 */
export async function handleSupportEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const to = (message.to ?? "").trim().toLowerCase();
  const classification = classifySupportMail({ to, subject: message.headers.get("subject") ?? "" });
  if (!classification) {
    message.setReject("No such recipient");
    return;
  }

  const inbox = (env.SUPPORT_INBOX ?? "").trim();
  if (!inbox) {
    // 没配目标地址时退信，而不是静默丢弃：发信人至少知道没送到
    console.error("[support] SUPPORT_INBOX 未配置，无法转发:", to);
    message.setReject("Support mailbox is not configured");
    return;
  }

  // 不可转发的信（例如源站 DMARC 策略拒绝转发）会在 forward() 抛错，
  // 由下面的 catch 统一退信。当前 workers-types 版本没有 canBeForwarded 字段，
  // 不做前置判断，避免依赖未声明的运行时属性。
  const headers = new Headers();
  headers.set("X-SortReceipts-Tag", classification.tag);
  headers.set("X-SortReceipts-Priority", classification.urgent ? "urgent" : "normal");
  headers.set("X-SortReceipts-Reason", classification.reason);
  headers.set("X-Original-Recipient", to);

  try {
    await message.forward(inbox, headers);
    console.log(
      `[support] tag=${classification.tag} urgent=${classification.urgent} reason=${classification.reason} size=${message.rawSize}`
    );
  } catch (err) {
    console.error("[support] 转发失败:", err);
    message.setReject("Support mailbox unavailable");
  }
}
