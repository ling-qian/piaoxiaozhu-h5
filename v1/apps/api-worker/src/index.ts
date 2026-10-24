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
import authRoutes from "./routes/auth";
import meRoutes from "./routes/me";
import projectRoutes from "./routes/projects";
import recordRoutes from "./routes/records";
import insightRoutes from "./routes/insights";
import analysisRoutes from "./routes/analysis";
import ocrRoutes from "./routes/ocr";
import fileRoutes from "./routes/files";
import paymentRoutes from "./routes/payments";

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
  if (
    c.req.path.startsWith("/api/auth/") ||
    c.req.path === "/api/payments/wechat/notify"
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

// 兜底 404 也用统一结构，避免前端拿到 HTML 报错页
app.notFound((c) => c.json({ detail: `接口不存在：${c.req.method} ${c.req.path}` }, 404));

export default app;
