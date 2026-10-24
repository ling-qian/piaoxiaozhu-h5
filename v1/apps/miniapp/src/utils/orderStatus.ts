import { paymentApi } from '../services/api';

/**
 * 轮询订单真实状态，直到 paid 或超次。
 *
 * requestPayment 的返回**不可信**：真机调试模式下微信会限制支付，
 * 但调用仍可能正常 resolve；真正权威的是服务器订单状态（微信回调确认）。
 * 所以支付后必须查单：paid 才算成功，查不到就提示「确认中」而不是假成功。
 */
export async function waitForOrderPaid(
  orderId: string,
  attempts = 4,
  intervalMs = 1500
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const order = await paymentApi.getOrder(orderId);
      if (order.status === 'paid') return true;
    } catch {
      // 单次查询失败不中断，继续重试
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return false;
}
