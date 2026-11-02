/**
 * 一次性的登录链路验证。
 *
 * 为什么需要它：登录是 server action，不是 REST 接口，curl 调不到。
 * 只有真浏览器点一次按钮，才能确认「表单提交 → 服务端签 cookie → 跳转 → 会话生效」
 * 这一整条链没有断。
 */

const { chromium } = require("playwright");

const BASE = process.argv[4] || "http://127.0.0.1:3000";
const EMAIL = process.argv[2];
const PASSWORD = process.argv[3];

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await ctx.newPage();

  const result = { steps: [], errors: [] };
  page.on("console", (m) => {
    if (m.type() === "error") result.errors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => result.errors.push("pageerror: " + e.message.slice(0, 200)));

  try {
    // ① 打开登录页
    await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle", timeout: 30000 });
    result.steps.push(`登录页已打开，标题: ${await page.title()}`);

    // ② 填表
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    result.steps.push("已填入邮箱与密码");

    // ③ 提交：点页面上唯一的主按钮（表单内的 submit）
    const submit = page.locator('form button[type="submit"]').first();
    await submit.click();
    result.steps.push("已点击登录");

    // ④ 等跳转或错误提示
    await page.waitForTimeout(4000);
    result.finalUrl = page.url();

    // ⑤ 检查是否拿到了会话 cookie
    const cookies = await ctx.cookies();
    const tokenCookie = cookies.find((c) => c.name === "px_token");
    result.cookie = tokenCookie
      ? { present: true, httpOnly: tokenCookie.httpOnly, sameSite: tokenCookie.sameSite, days: Math.round((tokenCookie.expires - Date.now() / 1000) / 86400) }
      : { present: false };

    // ⑥ 页面上的可读状态：是否有错误提示
    const bodyText = (await page.locator("body").innerText()).slice(0, 400);
    result.bodyPreview = bodyText.replace(/\s+/g, " ").trim();

    await page.screenshot({ path: "/tmp/h5-login-after.png", fullPage: false });

    // ⑦ 登录后再访问需要会话的页面，确认不是被弹回登录页
    await page.goto(`${BASE}/points`, { waitUntil: "networkidle", timeout: 30000 });
    result.pointsUrl = page.url();
    result.pointsText = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 220);
    await page.screenshot({ path: "/tmp/h5-points.png", fullPage: false });
  } catch (e) {
    result.steps.push("异常: " + e.message.slice(0, 300));
  } finally {
    await browser.close();
    console.log(JSON.stringify(result, null, 2));
  }
})();
