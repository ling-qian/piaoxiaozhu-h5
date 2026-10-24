import { hashPassword, isValidEmail, isValidPassword, normalizeEmail, verifyPassword } from "../src/lib/password.ts";

const pw = "MySecret123";
const h1 = await hashPassword(pw);
const h2 = await hashPassword(pw);

console.log(`  哈希格式: ${h1.split("$")[0]}$${h1.split("$")[1]}$…  长度 ${h1.length}`);
console.log(`  同一密码两次哈希不同（盐随机）: ${h1 !== h2 ? "✅" : "❌"}`);
console.log(`  正确密码通过: ${(await verifyPassword(pw, h1)) ? "✅" : "❌"}`);
console.log(`  错误密码被拒: ${(await verifyPassword("wrong", h1)) ? "❌ 竟通过" : "✅"}`);
console.log(`  空哈希被拒:   ${(await verifyPassword(pw, null)) ? "❌" : "✅"}`);
console.log(`  损坏哈希被拒: ${(await verifyPassword(pw, "garbage")) ? "❌" : "✅"}`);
console.log(`  两次哈希都能验: ${(await verifyPassword(pw, h1)) && (await verifyPassword(pw, h2)) ? "✅" : "❌"}`);
console.log(`  邮箱规范化: ${normalizeEmail("  A@Example.COM ") === "a@example.com" ? "✅" : "❌"}`);
console.log(`  非法邮箱被拒: ${!isValidEmail("not-an-email") ? "✅" : "❌"}`);
console.log(`  短密码被拒:   ${!isValidPassword("abc").ok ? "✅" : "❌"}`);
console.log(`  全同字符被拒: ${!isValidPassword("88888888").ok ? "✅" : "❌"}`);
