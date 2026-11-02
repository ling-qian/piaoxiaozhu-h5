/**
 * 按用户 + 动作的小时级限流。
 *
 * 为什么需要它：OCR 与 AI 接口每调一次都在花钱，而积分只在「入账」时扣。
 * 识别一次不保存，用户不会被扣分，却已经让服务商烧掉一次调用。
 * 没有这一层，一个正常账号就能把预算刷穿。
 *
 * 实现故意做得简单：D1 存一条调用流水，按小时窗口计数。
 * 不引 Redis 之类的组件——单体 Worker 加一张表已经够用，
 * 多一个依赖就多一个故障点。
 */
import { tooManyRequests } from "./http";

/** 超过这个时长的不再计入窗口，也顺手从表里删掉 */
const WINDOW_SECONDS = 3_600;
const RETENTION_SECONDS = 86_400;

/**
 * 计数并登记一次调用。
 *
 * 调用发生在业务逻辑之前：超限的请求不应产生任何外部开销。
 * 失败（比如下游超时）也照算一次，因为钱已经花了。
 */
export async function assertHourlyLimit(
  db: D1Database,
  userId: string,
  action: string,
  limit: number,
  message: string
): Promise<void> {
  const now = Date.now();
  const since = new Date(now - WINDOW_SECONDS * 1000).toISOString();

  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM api_usage WHERE user_id = ? AND action = ? AND created_at >= ?")
    .bind(userId, action, since)
    .first<{ n: number }>();
  if (Number(row?.n ?? 0) >= limit) throw tooManyRequests(message);

  await db
    .prepare("INSERT INTO api_usage (id, user_id, action, created_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, action, new Date(now).toISOString())
    .run();

  // 大约每 30 次清理一次一天前的流水。每次调用都删一遍要多一次写，
  // 这张表的规模不值得那个成本。
  if (Math.random() < 0.03) {
    const cutoff = new Date(now - RETENTION_SECONDS * 1000).toISOString();
    await db.prepare("DELETE FROM api_usage WHERE created_at < ?").bind(cutoff).run();
  }
}
