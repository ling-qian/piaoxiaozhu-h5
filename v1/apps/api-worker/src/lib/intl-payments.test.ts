/**
 * 签名校验与定价的单元测试。
 *
 * 这两块不依赖任何外部服务，却决定了「会不会被白嫖」和「扣多少钱」，
 * 所以优先覆盖。真正的支付链路（创建会话、扣款）需要线上密钥，
 * 用 mock 测只能证明「代码没抛异常」，证明不了对接是否正确，
 * 那部分靠本地起服务 + 测试密钥人工验证。
 */

import { describe, expect, it } from "vitest";

import { verifyStripeSignature } from "./intl-payments";
import { PLANS, POINT_PACKAGES, getPlan, packagePrice, periodPriceCents, planPrice } from "./plans";

/** 按 Stripe 的算法生成签名：HMAC-SHA256(`${t}.${body}`) 的十六进制 */
async function sign(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SECRET = "whsec_test_1234567890";
const now = () => Math.floor(Date.now() / 1000);

describe("verifyStripeSignature", () => {
  it("接受正确签名", async () => {
    const t = now();
    const body = JSON.stringify({ type: "checkout.session.completed" });
    const v1 = await sign(SECRET, t, body);
    await expect(verifyStripeSignature(SECRET, body, `t=${t},v1=${v1}`)).resolves.toBe(true);
  });

  it("接受多个 v1 中的任意一个（Stripe 轮换密钥时会同时给两个）", async () => {
    const t = now();
    const body = '{"a":1}';
    const good = await sign(SECRET, t, body);
    await expect(
      verifyStripeSignature(SECRET, body, `t=${t},v1=${"0".repeat(64)},v1=${good}`)
    ).resolves.toBe(true);
  });

  it("拒绝被篡改的请求体", async () => {
    const t = now();
    const v1 = await sign(SECRET, t, '{"amount":100}');
    // 签名对应的金额是 100，实际传 999999 —— 必须拒绝
    await expect(
      verifyStripeSignature(SECRET, '{"amount":999999}', `t=${t},v1=${v1}`)
    ).resolves.toBe(false);
  });

  it("拒绝错误密钥签出的签名", async () => {
    const t = now();
    const body = '{"a":1}';
    const v1 = await sign("whsec_wrong_key", t, body);
    await expect(verifyStripeSignature(SECRET, body, `t=${t},v1=${v1}`)).resolves.toBe(false);
  });

  it("拒绝超时的重放请求（时间戳超过 5 分钟）", async () => {
    const t = now() - 400;
    const body = '{"a":1}';
    const v1 = await sign(SECRET, t, body);
    // 签名本身是对的，但时间戳太旧 —— 不校验时间的话旧回调可以被无限重放
    await expect(verifyStripeSignature(SECRET, body, `t=${t},v1=${v1}`)).resolves.toBe(false);
  });

  it("拒绝未来时间戳（防时钟偏移被利用）", async () => {
    const t = now() + 400;
    const body = '{"a":1}';
    const v1 = await sign(SECRET, t, body);
    await expect(verifyStripeSignature(SECRET, body, `t=${t},v1=${v1}`)).resolves.toBe(false);
  });

  it("缺签名头或缺 v1 时拒绝", async () => {
    const t = now();
    const body = '{"a":1}';
    await expect(verifyStripeSignature(SECRET, body, null)).resolves.toBe(false);
    await expect(verifyStripeSignature(SECRET, body, `t=${t}`)).resolves.toBe(false);
    await expect(verifyStripeSignature(SECRET, body, `v1=${"a".repeat(64)}`)).resolves.toBe(false);
    await expect(verifyStripeSignature(SECRET, body, "garbage")).resolves.toBe(false);
  });
});

describe("美元定价", () => {
  it("专业版月付 $3.99，企业版 $13.99", () => {
    expect(planPrice(getPlan("pro"), "USD")).toBe(399);
    expect(planPrice(getPlan("enterprise"), "USD")).toBe(1399);
  });

  it("人民币价保持不变（不能因为加美元而动了国内定价）", () => {
    expect(planPrice(getPlan("pro"), "CNY")).toBe(2900);
    expect(planPrice(getPlan("enterprise"), "CNY")).toBe(9900);
  });

  it("周期折扣按 USD 基价计算", () => {
    const pro = getPlan("pro");
    expect(periodPriceCents(pro, 1, "USD")).toBe(399);
    // 3 个月 9 折：399 × 3 × 0.9 = 1077.3 → 1077
    expect(periodPriceCents(pro, 3, "USD")).toBe(1077);
    // 12 个月 8 折：399 × 12 × 0.8 = 3830.4 → 3830
    expect(periodPriceCents(pro, 12, "USD")).toBe(3830);
  });

  it("免费版没有美元价，返回 0（调用方据此拒绝下单）", () => {
    expect(planPrice(getPlan("free"), "USD")).toBe(0);
  });

  it("积分包双币种都有价，且单价高于套餐", () => {
    for (const pkg of Object.values(POINT_PACKAGES)) {
      expect(packagePrice(pkg, "USD")).toBeGreaterThan(0);
      expect(packagePrice(pkg, "CNY")).toBeGreaterThan(0);
    }
    // pro = $3.99 / 300 分 ≈ $0.0133/分；最小积分包 $1.99 / 100 分 = $0.0199/分
    const proPerPoint = PLANS.pro!.priceCentsUsd! / PLANS.pro!.pointsGrant;
    const smallestPerPoint = POINT_PACKAGES.points_100!.priceCentsUsd / POINT_PACKAGES.points_100!.points;
    expect(smallestPerPoint).toBeGreaterThan(proPerPoint);
  });
});
