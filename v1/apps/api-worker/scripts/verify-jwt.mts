/**
 * 跨语言 JWT 兼容性验证。
 *
 * 关键场景：线上已有用户拿着 **Python 后端签发** 的 token。
 * 换到 Worker 后如果校验不通过，所有人会被踢下线——
 * 这种问题上线才发现，比代码写错严重得多。
 */
import { readFileSync } from "node:fs";

import { signToken, verifyToken } from "../src/lib/jwt.ts";

const secret = process.env.TEST_SECRET ?? "";
const pyToken = readFileSync(process.env.PY_TOKEN_FILE ?? "./py-token.txt", "utf8").trim();

const EXPECTED_SUB = "11111111-2222-3333-4444-555555555555";

// 1) Python 签发 → TS 校验
const fromPy = await verifyToken(pyToken, secret);
console.log(
  fromPy && fromPy.sub === EXPECTED_SUB
    ? "  ✅ Python 签发的 token 被 TS 正确校验"
    : `  ❌ 校验失败：${JSON.stringify(fromPy)}`
);

// 2) TS 自签自验
const mine = await signToken(EXPECTED_SUB, secret);
const back = await verifyToken(mine, secret);
console.log(back?.sub === EXPECTED_SUB ? "  ✅ TS 自签自验通过" : "  ❌ TS 自签自验失败");

// 3) 错误密钥必须拒绝
const bad = await verifyToken(mine, "wrong-secret-0123456789abcdef0123456789");
console.log(bad === null ? "  ✅ 错误密钥被拒绝" : "  ❌ 错误密钥竟然通过");

// 4) 过期 token 必须拒绝（签名对但时间过了）
const expired = await signToken(EXPECTED_SUB, secret, -60);
const expResult = await verifyToken(expired, secret);
console.log(expResult === null ? "  ✅ 过期 token 被拒绝" : "  ❌ 过期 token 仍通过");

// 5) 篡改 payload 必须拒绝
const parts = mine.split(".");
const forged = `${parts[0]}.${btoa(JSON.stringify({ sub: "attacker", exp: 4102444800 })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.${parts[2]}`;
const forgedResult = await verifyToken(forged, secret);
console.log(forgedResult === null ? "  ✅ 篡改 payload 被拒绝" : "  ❌ 篡改后仍通过");
