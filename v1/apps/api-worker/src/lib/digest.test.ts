import { describe, expect, it } from "vitest";

import { buildDigestEmail, signUnsubscribe, verifyUnsubscribe } from "./digest";
import type { PackException } from "./pack";

const duplicateInvoice: PackException = {
  code: "duplicate_invoice_no",
  severity: "high",
  count: 2,
  amount: 132.5,
  label: "12345678",
  ratio: 0,
  records: [],
};

const exceptions: PackException[] = [duplicateInvoice];

describe("buildDigestEmail", () => {
  const base = { baseUrl: "https://example.com", unsubUrl: "https://example.com/u" };

  it("主题报出异常总数与月份", () => {
    const mail = buildDigestEmail({
      month: "2026-10",
      projects: [{ id: "p1", name: "Main", currency: "USD", recordCount: 12, exceptions }],
      ...base,
    });
    expect(mail.subject).toBe("2 things to check in your October 2026 invoices");
    expect(mail.html).toContain("Duplicate invoice number");
    expect(mail.html).toContain("$132.50");
    expect(mail.text).toContain("https://example.com/project/p1");
  });

  it("没有异常时主题说明无需检查，正文不提金额", () => {
    const mail = buildDigestEmail({
      month: "2026-10",
      projects: [{ id: "p1", name: "Main", currency: "CNY", recordCount: 3, exceptions: [] }],
      ...base,
    });
    expect(mail.subject).toBe("October 2026: nothing to check");
    expect(mail.text).not.toContain("¥");
  });

  it("单笔异常用单数", () => {
    const mail = buildDigestEmail({
      month: "2026-10",
      projects: [
        {
          id: "p1",
          name: "Main",
          currency: "USD",
          recordCount: 1,
          exceptions: [{ ...duplicateInvoice, count: 1 }],
        },
      ],
      ...base,
    });
    expect(mail.subject).toBe("1 thing to check in your October 2026 invoices");
  });
});

describe("退订签名", () => {
  it("同一用户签名稳定，不同用户不同", async () => {
    const a = await signUnsubscribe("secret", "user-a");
    expect(await signUnsubscribe("secret", "user-a")).toBe(a);
    expect(await signUnsubscribe("secret", "user-b")).not.toBe(a);
  });

  it("签名校验只接受原用户", async () => {
    const sig = await signUnsubscribe("secret", "user-a");
    expect(await verifyUnsubscribe("secret", "user-a", sig)).toBe(true);
    expect(await verifyUnsubscribe("secret", "user-b", sig)).toBe(false);
    expect(await verifyUnsubscribe("other", "user-a", sig)).toBe(false);
  });
});
