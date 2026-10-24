/**
 * 微信支付加密能力对拍：TS 与 Python 必须逐字节一致。
 *
 * RSA PKCS#1 v1.5 是**确定性**签名——同样的密钥和报文，两边算出的签名必须完全相同。
 * 所以这里直接比字符串，不靠「能验过就算对」。
 *
 * AES-GCM 是随机化的（每次 IV 不同），所以改成「Python 加密 → TS 解密」验证。
 */
import { readFileSync } from "node:fs";

import {
  buildPayParams,
  decryptResource,
  importPlatformPublicKey,
  signMessage,
  verifyNotify,
} from "../src/lib/wechat-pay.ts";

const priv = readFileSync(".testkeys/priv.pem", "utf8");
const cert = readFileSync(".testkeys/cert.pem", "utf8");
const message = process.env.PAY_TEST_MESSAGE ?? "";
const pySig = process.env.PAY_PY_SIGNATURE ?? "";

// 1) 同一报文：TS 签名 vs Python 签名（应逐字节相同）
const tsSig = await signMessage(priv, message);
console.log(`  签名一致: ${tsSig === pySig ? "✅" : "❌"}`);
if (tsSig !== pySig) {
  console.log(`    TS:     ${tsSig.slice(0, 48)}…`);
  console.log(`    Python: ${pySig.slice(0, 48)}…`);
}

// 2) 从证书提取公钥并验签（验证 DER 解析正确）
const pubKey = await importPlatformPublicKey(cert);
const sigBytes = Uint8Array.from(atob(pySig), (c) => c.charCodeAt(0));
const verified = await crypto.subtle.verify(
  "RSASSA-PKCS1-v1_5",
  pubKey,
  sigBytes,
  new TextEncoder().encode(message)
);
console.log(`  证书提取公钥并验签: ${verified ? "✅" : "❌"}`);

// 3) 用 PUBLIC KEY PEM（微信「公钥模式」）也要能验
const pubPem = readFileSync(".testkeys/pub.pem", "utf8");
const pubKey2 = await importPlatformPublicKey(pubPem);
const verified2 = await crypto.subtle.verify(
  "RSASSA-PKCS1-v1_5",
  pubKey2,
  sigBytes,
  new TextEncoder().encode(message)
);
console.log(`  PUBLIC KEY 模式验签:   ${verified2 ? "✅" : "❌"}`);

// 4) AES-GCM 解密（Python 用 APIv3 密钥加密的回调 resource）
const apiv3Key = process.env.PAY_APIV3_KEY ?? "";
const resource = JSON.parse(process.env.PAY_RESOURCE ?? "{}");
try {
  const plain = await decryptResource(resource, apiv3Key);
  const expect = JSON.parse(process.env.PAY_PLAINTEXT ?? "{}");
  const ok = JSON.stringify(plain) === JSON.stringify(expect);
  console.log(`  回调解密:             ${ok ? "✅" : "❌"}`);
  if (!ok) console.log(`    TS: ${JSON.stringify(plain)}`);
} catch (e) {
  console.log(`  回调解密:             ❌ ${e instanceof Error ? e.message : e}`);
}

// 5) 回调验签：正确签名应通过，篡改报文应被拒
const headers = new Headers({
  "Wechatpay-Timestamp": process.env.PAY_TS ?? "",
  "Wechatpay-Nonce": process.env.PAY_NONCE ?? "",
  "Wechatpay-Signature": process.env.PAY_NOTIFY_SIG ?? "",
});
try {
  await verifyNotify(headers, process.env.PAY_NOTIFY_BODY ?? "", pubPem);
  console.log("  回调验签（正确签名）: ✅");
} catch (e) {
  console.log(`  回调验签（正确签名）: ❌ ${e instanceof Error ? e.message : e}`);
}
try {
  await verifyNotify(headers, (process.env.PAY_NOTIFY_BODY ?? "") + "x", pubPem);
  console.log("  回调验签（篡改报文）: ❌ 竟然通过");
} catch {
  console.log("  回调验签（篡改报文）: ✅ 已拒绝");
}

// 6) 支付参数签名与 Python 对齐
const params = await buildPayParams({
  appid: "wxtestappid",
  prepayId: "wx1234567890",
  privateKeyPem: priv,
  nonce: process.env.PAY_NONCE_FIXED ?? "abc123",
  timestamp: process.env.PAY_TS_FIXED ?? "1792746332",
});
console.log(`  支付参数 paySign:     ${params.paySign === process.env.PAY_PARAMS_SIGN ? "✅" : "❌"}`);
