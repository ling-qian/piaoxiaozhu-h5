import { describe, expect, it } from "vitest";

import { generatePartnerCode, normalizePartnerCode } from "./partners";

describe("normalizePartnerCode", () => {
  it("统一转成大写并去掉空格", () => {
    expect(normalizePartnerCode(" ab12cd ")).toBe("AB12CD");
  });

  it("长度与字符不合法时返回 null", () => {
    expect(normalizePartnerCode("ABC")).toBeNull();
    expect(normalizePartnerCode("ABCDEFGHIJKLM")).toBeNull();
    expect(normalizePartnerCode("AB-12")).toBeNull();
  });

  it("纯数字不收，避免和订单号混淆", () => {
    expect(normalizePartnerCode("123456")).toBeNull();
  });

  it("空值与非字符串都返回 null", () => {
    expect(normalizePartnerCode(null)).toBeNull();
    expect(normalizePartnerCode(undefined)).toBeNull();
  });
});

describe("generatePartnerCode", () => {
  it("默认六位，且只用不含歧义的字符", () => {
    const code = generatePartnerCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("两次生成不同（碰撞由调用方查库兜底）", () => {
    expect(generatePartnerCode()).not.toBe(generatePartnerCode());
  });
});
