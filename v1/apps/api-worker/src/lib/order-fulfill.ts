/**
 * 订单发货：把「已支付的订单」变成用户实际拿到的东西。
 *
 * 抽出来是因为三个渠道（微信 / Stripe / PayPal）都要做同一件事：
 * 置 paid → 发积分 → 更新套餐。各写一份的话，改规则时必然会漏掉其中一个，
 * 而漏掉的那条线会表现成「付了钱没到账」——最难解释的一类故障。
 */

import { POINT_PACKAGES, getPlan, isPointPackage, periodPoints, renewalExpiry } from "./plans";
import { logPoints } from "./points";
import { nowIso } from "./time";

export interface PayableOrder {
  id: string;
  user_id: string;
  plan_code: string;
  amount_cents: number;
  period_months: number;
  status: string;
}

/**
 * 标记订单已支付并发放权益。
 *
 * 幂等：订单已是 paid 时直接返回 `{ alreadyPaid: true }`，不重复发放。
 * 支付商回调会重推（Stripe 在没收到 200 时最多重试三天），
 * 少了这道判断用户能白嫖积分。
 */
export async function fulfillOrder(
  db: D1Database,
  order: PayableOrder,
  transactionId: string
): Promise<{ alreadyPaid: boolean }> {
  if (order.status === "paid") return { alreadyPaid: true };

  const ts = nowIso();

  // 只在 pending → paid 的迁移上生效。并发回调同时到达时，
  // 后到的那个 update 影响 0 行，据此判定不重复发货。
  const res = await db
    .prepare(
      "UPDATE orders SET status = 'paid', paid_at = ?, transaction_id = ? WHERE id = ? AND status != 'paid'"
    )
    .bind(ts, transactionId, order.id)
    .run();

  if ((res.meta?.changes ?? 0) === 0) return { alreadyPaid: true };

  if (isPointPackage(order.plan_code)) {
    const pkg = POINT_PACKAGES[order.plan_code]!;
    await logPoints(
      db,
      order.user_id,
      "purchase_grant",
      pkg.points,
      `购买积分包 ${pkg.name}，订单 ${order.id}`,
      ts
    );
    return { alreadyPaid: false };
  }

  const plan = getPlan(order.plan_code);
  const grant = periodPoints(plan, order.period_months);
  if (grant > 0) {
    await logPoints(
      db,
      order.user_id,
      "purchase_grant",
      grant,
      `购买套餐 ${order.plan_code}（${order.period_months} 个月），订单 ${order.id}`,
      ts
    );
  }

  const user = await db
    .prepare("SELECT plan_expires_at FROM users WHERE id = ?")
    .bind(order.user_id)
    .first<{ plan_expires_at: string | null }>();
  const expiry = renewalExpiry(user?.plan_expires_at, order.period_months);

  await db
    .prepare(
      "UPDATE users SET plan_code = ?, plan_expires_at = ?, plan_remind_stage = NULL WHERE id = ?"
    )
    .bind(order.plan_code, expiry, order.user_id)
    .run();

  return { alreadyPaid: false };
}
