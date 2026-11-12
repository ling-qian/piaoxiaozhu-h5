/**
 * 套餐权益校验。
 *
 * 导出的开关在后端的 `PLANS[...].canExport` 里，前端只读 `/api/me/quota`
 * 拿不到别的字段就够了。校验放在服务端：页面上的按钮可以藏，但 server action
 * 和 `/api/export/csv` 都是公开入口，只藏按钮等于没拦。
 */

import "server-only";

import { ApiError, apiFetch } from "./api";

export const EXPORT_LOCKED_MESSAGE = "当前套餐不含导出，升级后可以下载 CSV 和生成分享链接。";

/**
 * 当前账号能不能导出。
 *
 * 只有后端明确回 `can_export: false` 才拦；字段缺失时放行，避免后端
 * 换字段名时把付费用户一起挡在门外。读不到配额会抛错，由调用方决定
 * 回 403 还是 500。
 */
export async function requireExportPlan(): Promise<void> {
  const quota = await apiFetch<{ can_export?: boolean }>("/api/me/quota");
  if (quota?.can_export === false) {
    throw new ApiError(403, EXPORT_LOCKED_MESSAGE);
  }
}
