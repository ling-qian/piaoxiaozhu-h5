import { describe, expect, it } from "vitest";

import { normalizeSource, parseSignupSource } from "./acquisition";

describe("normalizeSource", () => {
  it("转成小写并去掉空格", () => {
    expect(normalizeSource(" ProductHunt ")).toBe("producthunt");
  });

  it("只保留字母、数字与 . _ -", () => {
    expect(normalizeSource("hn/front?x=1")).toBe("hnfrontx1");
  });

  it("空值与清洗后为空都返回 null", () => {
    expect(normalizeSource(null)).toBeNull();
    expect(normalizeSource("  ")).toBeNull();
    expect(normalizeSource("///")).toBeNull();
  });

  it("超过 40 个字符时截断", () => {
    expect(normalizeSource("a".repeat(50))).toHaveLength(40);
  });
});

describe("parseSignupSource", () => {
  it("完整来源原样保留", () => {
    expect(parseSignupSource({ source: "ProductHunt", medium: "launch", campaign: "w8" })).toEqual({
      source: "producthunt",
      medium: "launch",
      campaign: "w8",
    });
  });

  it("缺少来源时记为 direct", () => {
    expect(parseSignupSource(null)).toEqual({ source: "direct", medium: null, campaign: null });
    expect(parseSignupSource({})).toEqual({ source: "direct", medium: null, campaign: null });
  });

  it("只带 source 时 medium 与 campaign 为空", () => {
    expect(parseSignupSource({ source: "hn" })).toEqual({
      source: "hn",
      medium: null,
      campaign: null,
    });
  });
});
