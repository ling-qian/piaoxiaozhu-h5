/**
 * 验证码相关纯逻辑的回归。
 *
 * 这一层不测路由，只测三件容易悄悄坏掉的事：码的形状、哈希是不是绑定了
 * 密钥、比较是不是恒定时间且不会把不同哈希判成相同。
 */

import { describe, expect, it } from "vitest";

import { generateCode, hashCode, sameHash } from "./email-code";

describe("generateCode", () => {
  it("始终是六位数字", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("不会一直返回同一个值", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateCode()));
    expect(codes.size).toBeGreaterThan(40);
  });
});

describe("hashCode", () => {
  it("同一组输入稳定", async () => {
    const a = await hashCode("a@example.com", "123456", "secret");
    const b = await hashCode("a@example.com", "123456", "secret");
    expect(a).toBe(b);
  });

  it("换了密钥哈希就变，说明哈希绑定了服务端密钥", async () => {
    const a = await hashCode("a@example.com", "123456", "secret-1");
    const b = await hashCode("a@example.com", "123456", "secret-2");
    expect(a).not.toBe(b);
  });

  it("换了邮箱或验证码哈希也变", async () => {
    const base = await hashCode("a@example.com", "123456", "secret");
    expect(await hashCode("b@example.com", "123456", "secret")).not.toBe(base);
    expect(await hashCode("a@example.com", "654321", "secret")).not.toBe(base);
  });
});

describe("sameHash", () => {
  it("相同哈希返回 true", () => {
    expect(sameHash("abc123", "abc123")).toBe(true);
  });

  it("长度不同直接 false，不会越界比较", () => {
    expect(sameHash("abc", "abcd")).toBe(false);
  });

  it("只差最后一个字符也判为不同", () => {
    expect(sameHash("abc123", "abc124")).toBe(false);
  });
});
