/**
 * Worker 入口。
 *
 * 路由前缀 `/api` 与旧后端保持一致，前端 api.ts 里的路径一个字都不用改。
 * 错误体统一走 `{"detail": "..."}`。
 */
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Env } from "./env";
import type { UserRow } from "./db/types";
import { ApiError, errorHandler, unauthorized } from "./lib/http";
import { verifyToken } from "./lib/jwt";
import { reconcilePaypalOrders } from "./lib/paypal-reconcile";
import authRoutes from "./routes/auth";
import meRoutes from "./routes/me";
import projectRoutes from "./routes/projects";
import recordRoutes from "./routes/records";
import insightRoutes from "./routes/insights";
import analysisRoutes from "./routes/analysis";
import ocrRoutes from "./routes/ocr";
import fileRoutes from "./routes/files";
import paymentRoutes from "./routes/payments";
import pointRoutes from "./routes/points";
import adminRoutes from "./routes/admin";
import intlPaymentRoutes from "./routes/payments-intl";
import dodoPaymentRoutes from "./routes/payments-dodo";
import interestRoutes from "./routes/interest";
import packRoutes from "./routes/pack";
import salesRoutes from "./routes/sales";
import emailRoutes from "./routes/email";
import { maybeRunScheduledDigest } from "./lib/digest";
import { handleInboundEmail } from "./lib/mail-router";

type Vars = { user: UserRow };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.onError(errorHandler);

// 小程序请求不走 CORS，但 H5 端要跨域
app.use("/api/*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"] }));

/** 健康检查（含 D1 连通性），部署后第一道验证就是这个 */
app.get("/health", async (c) => {
  let dbOk = false;
  try {
    await c.env.DB.prepare("SELECT 1").first();
    dbOk = true;
  } catch (e) {
    console.error("[health] D1 不可用:", e);
  }
  return c.json(
    {
      status: dbOk ? "ok" : "degraded",
      service: "piaoxiaozhu-api-worker",
      version: "1.0.0",
      d1: dbOk,
    },
    dbOk ? 200 : 503
  );
});

/** 鉴权中间件：只有 /api/auth/* 免登录 */
app.use("/api/*", async (c, next) => {
  // 免登录白名单：
  //   /api/auth/*                      登录本身
  //   /api/payments/wechat/notify      微信服务器回调（不带 JWT，安全靠验签+解密）
  //   /api/admin/*                     后台管理，用 X-Admin-Token 单令牌鉴权，
  //                                    不走用户 JWT，各 handler 自己校验
  if (
    c.req.path.startsWith("/api/auth/") ||
    c.req.path.startsWith("/api/admin/") ||
    c.req.path === "/api/payments/wechat/notify" ||
    c.req.path === "/api/payments/stripe/webhook" ||
    c.req.path === "/api/payments/dodo/webhook" ||
    c.req.path === "/api/payments/paypal/webhook" ||
    // 只读分享：凭快照令牌访问，会计不需要注册账号
    c.req.path.startsWith("/api/share/") ||
    // 退订链接来自邮件，凭签名访问，用户可能没有登录态
    c.req.path === "/api/email/unsubscribe"
  ) {
    return next();
  }

  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw unauthorized();

  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) throw unauthorized();

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub)
    .first<UserRow>();
  if (!user) throw unauthorized("User not found");

  c.set("user", user);
  return next();
});

app.route("/api/auth", authRoutes);
app.route("/api", meRoutes);
app.route("/api", projectRoutes);
app.route("/api", recordRoutes);
app.route("/api", insightRoutes);
app.route("/api", analysisRoutes);
app.route("/api", ocrRoutes);
app.route("/api", fileRoutes);
app.route("/api", paymentRoutes);
app.route("/api", pointRoutes);
app.route("/api", adminRoutes);
app.route("/api", intlPaymentRoutes);
app.route("/api", dodoPaymentRoutes);
app.route("/api", interestRoutes);
app.route("/api", packRoutes);
app.route("/api", salesRoutes);
app.route("/api", emailRoutes);

// 兜底 404 也用统一结构，避免前端拿到 HTML 报错页
app.notFound((c) => c.json({ detail: `接口不存在：${c.req.method} ${c.req.path}` }, 404));

/**
 * 定时对账。
 *
 * PayPal 没有「必达」保证：用户关掉标签页，回跳 capture 就不会发生。
 * 这个小任务把停在 pending 的订单和 PayPal 核对一遍，钱扣了就补发货。
 * 频率不高，单轮处理量也小——真正的通道是 webhook，这里是兜底。
 */
async function scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
  ctx.waitUntil(
    reconcilePaypalOrders(env)
      .then((r) => {
        console.log(`[cron] PayPal 对账 检查=${r.scanned} 发货=${r.paid} 失败=${r.failed}`);
      })
      .catch((err) => {
        console.error("[cron] PayPal 对账异常", err);
      })
  );

  // 「本月发现」：每月 1 日与 15 日的 09:00 UTC 各一封，内部自带日期判断
  ctx.waitUntil(
    maybeRunScheduledDigest(env).catch((err) => {
      console.error("[cron] 本月发现邮件异常", err);
    })
  );
}

export default {
  fetch: app.fetch,
  scheduled,
  // Cloudflare Email Routing 把收到的信转给 Worker 时走这里
  email: handleInboundEmail,
};
