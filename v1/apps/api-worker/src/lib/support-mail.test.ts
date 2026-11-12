import { describe, expect, it } from "vitest";

import type { Env } from "../env";
import { handleInboundEmail } from "./mail-router";
import { classifySupportMail, handleSupportEmail, supportTagOf } from "./support-mail";

function fakeMessage(to: string, subject = "") {
  const forwarded: Array<{ to: string; headers?: Headers }> = [];
  const rejected: string[] = [];

  const message = {
    from: "customer@example.com",
    to,
    headers: new Headers({ subject }),
    raw: new ReadableStream(),
    rawSize: 2048,
    canBeForwarded: true,
    setReject(reason: string) {
      rejected.push(reason);
    },
    async forward(rcpt: string, headers?: Headers) {
      forwarded.push({ to: rcpt, headers });
    },
    async reply() {
      throw new Error("support 分支不应该回信");
    },
  } as unknown as ForwardableEmailMessage;

  return { message, forwarded, rejected };
}

const env = { SUPPORT_INBOX: "owner@example.com", INBOX_DOMAIN: "in.qianling-tech.top" } as Env;

describe("supportTagOf", () => {
  it("把公开地址映射到四类队列", () => {
    expect(supportTagOf("support@qianling-tech.top")).toBe("support");
    expect(supportTagOf("HELP@qianling-tech.top")).toBe("support");
    expect(supportTagOf("billing@qianling-tech.top")).toBe("billing");
    expect(supportTagOf("refund@qianling-tech.top")).toBe("billing");
    expect(supportTagOf("privacy@qianling-tech.top")).toBe("legal");
    expect(supportTagOf("partner@qianling-tech.top")).toBe("partners");
  });

  it("不认识的本地部分返回 null，留给调用方退信", () => {
    expect(supportTagOf("random@qianling-tech.top")).toBeNull();
    expect(supportTagOf("r-0123456789abcdef@qianling-tech.top")).toBeNull();
    expect(supportTagOf("")).toBeNull();
  });
});

describe("classifySupportMail", () => {
  it("默认按收件地址分类，不加急", () => {
    expect(classifySupportMail({ to: "support@qianling-tech.top", subject: "Scan failed" })).toEqual({
      tag: "support",
      urgent: false,
      reason: "default",
    });
  });

  it("退款主题落到账单并加急", () => {
    expect(classifySupportMail({ to: "support@qianling-tech.top", subject: "Charged twice, please refund" })).toEqual({
      tag: "billing",
      urgent: true,
      reason: "billing-dispute",
    });
  });

  it("中文主题也能命中", () => {
    expect(classifySupportMail({ to: "help@qianling-tech.top", subject: "重复扣款了" })?.tag).toBe("billing");
    expect(classifySupportMail({ to: "privacy@qianling-tech.top", subject: "请帮我删除数据" })?.reason).toBe(
      "data-request"
    );
  });

  it("删号请求走法规队列，即使发到 support@", () => {
    expect(classifySupportMail({ to: "support@qianling-tech.top", subject: "GDPR deletion request" })).toEqual({
      tag: "legal",
      urgent: true,
      reason: "data-request",
    });
  });

  it("未知地址返回 null", () => {
    expect(classifySupportMail({ to: "someone@example.com", subject: "hi" })).toBeNull();
  });
});

describe("handleSupportEmail", () => {
  it("转发到收件箱并带上分类头", async () => {
    const { message, forwarded } = fakeMessage("support@qianling-tech.top", "hello");
    await handleSupportEmail(message, env);

    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]?.to).toBe("owner@example.com");
    expect(forwarded[0]?.headers?.get("X-SortReceipts-Tag")).toBe("support");
    expect(forwarded[0]?.headers?.get("X-SortReceipts-Priority")).toBe("normal");
    expect(forwarded[0]?.headers?.get("X-Original-Recipient")).toBe("support@qianling-tech.top");
  });

  it("加急邮件打上 urgent", async () => {
    const { message, forwarded } = fakeMessage("billing@qianling-tech.top", "Chargeback started");
    await handleSupportEmail(message, env);
    expect(forwarded[0]?.headers?.get("X-SortReceipts-Priority")).toBe("urgent");
  });

  it("没配 SUPPORT_INBOX 时退信，而不是静默丢弃", async () => {
    const { message, forwarded, rejected } = fakeMessage("support@qianling-tech.top");
    await handleSupportEmail(message, {} as Env);
    expect(forwarded).toHaveLength(0);
    expect(rejected[0]).toMatch(/not configured/);
  });

  it("forward 抛错时退信，不让异常冒到运行时", async () => {
    const { message, rejected } = fakeMessage("support@qianling-tech.top");
    message.forward = async () => {
      throw new Error("destination not verified");
    };
    await handleSupportEmail(message, env);
    expect(rejected[0]).toMatch(/unavailable/);
  });
});

describe("handleInboundEmail 分流", () => {
  it("收票子域走票据分支：token 不合法时退信", async () => {
    const { message, forwarded, rejected } = fakeMessage("nope@in.qianling-tech.top", "receipt");
    await handleInboundEmail(message, env);
    expect(forwarded).toHaveLength(0);
    expect(rejected[0]).toBe("No such recipient");
  });

  it("主域的 support 地址走分拣分支", async () => {
    const { message, forwarded } = fakeMessage("support@qianling-tech.top", "Need help");
    await handleInboundEmail(message, env);
    expect(forwarded[0]?.to).toBe("owner@example.com");
  });

  it("不认识的地址退信，避免把信吞掉", async () => {
    const { message, forwarded, rejected } = fakeMessage("random@qianling-tech.top");
    await handleInboundEmail(message, env);
    expect(forwarded).toHaveLength(0);
    expect(rejected[0]).toBe("No such recipient");
  });
});
