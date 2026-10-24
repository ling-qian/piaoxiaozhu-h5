/**
 * 时间统一用 ISO 8601 UTC 字符串（定长），D1 里按字符串比较即等价于按时间比较。
 *
 * 之所以不用时间戳数字：与旧 PostgreSQL 数据（timestamptz）导出后能直接对齐，
 * 排查问题时肉眼可读。
 */

export function nowIso(): string {
  return new Date().toISOString();
}

/** 北京时间某个自然日的起点，换算成 UTC ISO —— 对齐旧实现的「按北京日界」口径。 */
export function cnDayStartIso(now: Date = new Date()): string {
  const CN_OFFSET_MS = 8 * 60 * 60 * 1000;
  const shifted = new Date(now.getTime() + CN_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const cnMidnightUtc = Date.UTC(y, m, d) - CN_OFFSET_MS;
  return new Date(cnMidnightUtc).toISOString();
}

/** 当前月份 YYYY-MM（北京时间） */
export function cnMonth(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 3600_000);
  return shifted.toISOString().slice(0, 7);
}

/**
 * 北京时间「本月 1 日 00:00」对应的 UTC ISO。
 *
 * 不能简单用字符串切月（`YYYY-MM-01` 缺时间部分），也不能拿带 +08:00 的字符串
 * 跟库里存的 UTC 'Z' 字符串比较——格式不同，字典序比较会得出错误结果。
 */
export function cnMonthStartIso(now: Date = new Date()): string {
  const CN_OFFSET_MS = 8 * 60 * 60 * 1000;
  const shifted = new Date(now.getTime() + CN_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  return new Date(Date.UTC(y, m, 1) - CN_OFFSET_MS).toISOString();
}
