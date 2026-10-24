/**
 * 校验 TS 版指纹与 Python 版（packages/core）逐字节一致。
 *
 * 为什么必须验：线上已有记录的 invoice_fingerprint 是 Python 算的。
 * 两边算法若有一字节差异，历史记录与新记录就对不上，查重直接失效——
 * 表现是「同一张票能重复入账」，而且不会报错，很难发现。
 */
import { invoiceFingerprint } from "../src/lib/invoice-identity.ts";
import { checkInvoice, deriveVerdict } from "../src/lib/invoice-check.ts";

const cases = [
  { name: "数电票（有号码+代码）", input: { invoiceCode: "044001900111", invoiceNo: "25312000000012345678" } },
  { name: "传统发票（8 位号码）", input: { invoiceCode: "044001900111", invoiceNo: "12345678" } },
  { name: "无号码（销方+日期+金额）", input: { sellerTaxNo: "91440101MA5CX1234X", invoiceDate: "2026-10-20", totalAmountCents: 12850 } },
  { name: "小票（仅金额+日期）", input: { totalAmountCents: 12850, invoiceDate: "2026-10-21" } },
  { name: "空白", input: {} },
];

for (const { name, input } of cases) {
  const fp = await invoiceFingerprint(input as any);
  const verdict = deriveVerdict(checkInvoice(input as any));
  console.log(
    JSON.stringify({
      name,
      fp: fp?.[0] ?? null,
      strength: fp?.[1] ?? null,
      verdict,
    })
  );
}
