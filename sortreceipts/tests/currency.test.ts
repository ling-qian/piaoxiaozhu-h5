import { describe, expect, it } from "vitest";

import { CURRENCY_SYMBOL, currencySymbolOf, formatMoney, formatPrice } from "../lib/currency";

describe("formatPrice", () => {
  it("美元保留两位小数", () => {
    expect(formatPrice(29, 3.99, "USD")).toBe("$3.99");
  });

  it("人民币整数不补小数", () => {
    expect(formatPrice(29, 3.99, "CNY")).toBe("¥29");
  });

  it("当前币种价格缺失时退回另一种币种，而不是显示 0", () => {
    expect(formatPrice(29, 0, "USD")).toBe("$29.00");
  });
});

describe("currencySymbolOf", () => {
  it("认得项目币种", () => {
    expect(currencySymbolOf("EUR")).toBe("€");
    expect(currencySymbolOf("cny")).toBe("¥");
  });

  it("未知或空值退回站点币种", () => {
    expect(currencySymbolOf(null)).toBe(CURRENCY_SYMBOL);
    expect(currencySymbolOf("XYZ")).toBe(CURRENCY_SYMBOL);
  });
});

describe("formatMoney", () => {
  it("负号放在货币符号之前", () => {
    expect(formatMoney(-120, "USD")).toBe("-$120.00");
  });

  it("非法金额按 0 处理", () => {
    expect(formatMoney(Number.NaN, "USD")).toBe("$0.00");
  });
});
