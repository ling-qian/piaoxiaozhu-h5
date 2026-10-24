/**
 * 端到端验证上传链路：用 TS 生成的预签名 URL 真的 PUT 一张图到 COS。
 *
 * 这是唯一能证明签名正确的测试——签名错了 COS 只会回 403，
 * 而签名「看起来正确」却差了 60 秒偏移、%3B 编码、SignKey 用 hex 还是原始字节，
 * 本地怎么算都发现不了。
 */
import { readFileSync } from "node:fs";

import { cosPresignPut, cosPublicUrl } from "../src/lib/cos.ts";

const bucket = process.env.COS_BUCKET_NAME!;
const region = process.env.COS_REGION!;
const secretId = process.env.COS_SECRET_ID!;
const secretKey = process.env.COS_SECRET_KEY!;
const imagePath = process.env.TEST_IMAGE!;

const key = `uploads/_selftest/${Date.now()}-presign-check.jpg`;
const body = readFileSync(imagePath);

const url = await cosPresignPut({ bucket, region, secretId, secretKey, key, expires: 900 });

console.log(`  对象键: ${key}`);
console.log(`  图片: ${(body.length / 1024).toFixed(0)} KB`);
console.log(`  签名 URL 长度: ${url.length}`);

// 1) PUT 上传
const t0 = Date.now();
const put = await fetch(url, {
  method: "PUT",
  body,
  headers: { "Content-Type": "image/jpeg" },
});
const putMs = Date.now() - t0;

if (!put.ok) {
  console.log(`  ❌ PUT 失败: HTTP ${put.status}`);
  console.log(`     响应: ${(await put.text()).slice(0, 300)}`);
  process.exit(1);
}
console.log(`  ✅ PUT 成功 (HTTP ${put.status}, ${putMs}ms)`);

// 2) 公开地址回读（COS 桶是公读时可用）
const publicUrl = cosPublicUrl(bucket, region, key);
const get = await fetch(publicUrl);
const got = get.ok ? (await get.arrayBuffer()).byteLength : 0;
console.log(
  get.ok
    ? `  ✅ 回读成功 (${(got / 1024).toFixed(0)} KB)${got === body.length ? "，字节数一致" : "，⚠️ 字节数不一致"}`
    : `  ⚠️ 回读 HTTP ${get.status}（桶未开放公读时属正常）`
);

// 3) 过期/篡改必须被拒（验证签名真的在校验，而不是碰巧通过）
const tampered = url.replace(/q-signature=[0-9a-f]+/, "q-signature=" + "0".repeat(40));
const bad = await fetch(tampered, { method: "PUT", body, headers: { "Content-Type": "image/jpeg" } });
console.log(
  bad.ok ? "  ❌ 篡改签名竟然通过（严重问题）" : `  ✅ 篡改签名被拒 (HTTP ${bad.status})`
);
