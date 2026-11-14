/**
 * 金额与时间的显示格式。
 *
 * ## 为什么金额有两个函数
 *
 * 展示位和输入框的要求正好相反：
 *
 * - 展示位要千分位。万元级的票据写成 `12,345.60` 比 `12345.60` 好认，
 *   扫一眼就知道是几万还是十几万。
 * - 输入框不能有千分位。金额输入框是 `type='digit'`，收到 `1,234.56`
 *   会截成 `1`，用户改一次金额就丢三位数。
 *
 * 之前三个页面各自实现了一份：报表和项目页带千分位，结果页用 `toFixed`。
 * 同一笔金额从结果页跳到报表页，`1234.56` 变成 `1,234.56`，
 * 用户会以为数据被改过。
 */

/** 展示用：带千分位，固定两位小数。 */
export function formatAmount(val: number | null | undefined): string {
  const num = Number(val) || 0;
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 输入框用：不带千分位。`type='digit'` 只认数字和小数点。 */
export function formatAmountInput(val: number | null | undefined): string {
  return (Number(val) || 0).toFixed(2);
}

/** 带货币符号的展示。小程序是人民币场景，符号固定为 ¥。 */
export function formatMoney(val: number | null | undefined): string {
  return `¥${formatAmount(val)}`;
}

/** 百分比，保留一位小数。 */
export function formatPercent(val: number | null | undefined): string {
  return (Number(val) || 0).toFixed(1) + '%';
}

/** 时间戳转 `YYYY-MM-DD HH:mm`。无效输入原样返回，便于发现脏数据。 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
