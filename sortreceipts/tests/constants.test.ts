import { describe, expect, it } from "vitest";

import { CATEGORIES, categoryLabel, resolveCategoryCode } from "../lib/constants";

describe("resolveCategoryCode", () => {
  it("认得内置分类码", () => {
    expect(resolveCategoryCode("food_material")).toBe("food_material");
  });

  it("把后端写进记录表的中文分类名映射回分类码", () => {
    expect(resolveCategoryCode("食材")).toBe("food_material");
    expect(resolveCategoryCode("水电燃气")).toBe("utilities");
    expect(resolveCategoryCode("未分类")).toBe("other");
  });

  it("旧版海外科目的历史记录也能映射，不会显示成孤儿分类", () => {
    expect(resolveCategoryCode("meals")).toBe("food_material");
    expect(resolveCategoryCode("marketing")).toBe("advertising");
  });

  it("不认识的码返回 undefined，由调用方决定怎么显示", () => {
    expect(resolveCategoryCode("not-a-category")).toBeUndefined();
  });

  it("每个内置分类都能被反查回自己", () => {
    for (const cat of CATEGORIES) {
      expect(resolveCategoryCode(cat.code)).toBe(cat.code);
    }
  });
});

describe("categoryLabel", () => {
  it("有 i18n 函数时用 labelKey 取当前语言", () => {
    expect(categoryLabel("rent", (key) => `t:${key}`)).toBe("t:cat.rent");
  });

  it("没有 i18n 函数时回落到中文名", () => {
    expect(categoryLabel("rent")).toBe("房租");
  });

  it("不认识的分类原样返回，不压成「其他」", () => {
    expect(categoryLabel("supplier-x")).toBe("supplier-x");
  });
});
