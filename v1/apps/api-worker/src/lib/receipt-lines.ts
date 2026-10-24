/**
 * 小票明细行加总 vs 合计的交叉校验——从 `packages/core/piaoxiaozhu_core/receipt_lines.py` 移植。
 *
 * 小票没有税额可校验，但有明细行。把行尾金额加总与合计比对，
 * 能抓出「合计读错」（19.30 → 193.00）这类规则层查不出的错误。
 *
 * 误报比漏报更糟：用户看到「合计算错了」，第一反应是「这程序不准」。
 * 所以判定保守——不确定就放行。
 */

const NON_ITEM_KEYWORDS = [
  "合计", "总计", "小计", "应付", "实付", "实收", "找零", "收款", "付款",
  "优惠", "折扣", "满减", "抹零", "税额", "税率", "余额", "会员", "积分",
  "发票", "税号", "电话", "地址", "单号", "时间", "日期", "收银员", "谢谢",
];

const DISCOUNT_KEYWORDS = ["优惠", "折扣", "满减", "抹零", "减免", "抵用", "券"];

/** 行尾金额：允许 ¥ 前缀、千分位、负数（退货行） */
const AMOUNT_AT_END = /[¥￥]?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|-?\d+\.\d{1,2})\s*$/;

/** 数量×单价形态，如「鸡蛋 2 x 6.40 12.80」 */
const QTY_PRICE = /(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)/;

export interface LineCheck {
  ok: boolean;
  checked: boolean;
  itemCount: number;
  itemsSum: number;
  total: number | null;
  diff: number;
  message: string;
}

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/,/g, "").replace(/[¥￥]/g, "").trim();
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

/** 抽出明细行金额：取「行尾金额」，小票的明细行几乎都以金额结尾 */
export function extractItems(rawText: string): number[] {
  const items: number[] = [];
  for (const raw of (rawText ?? "").split("\n")) {
    const line = raw.trim();
    if (!line || line.length < 2) continue;
    if (NON_ITEM_KEYWORDS.some((k) => line.includes(k))) continue;

    const m = AMOUNT_AT_END.exec(line);
    if (!m?.[1]) continue;

    const amount = parseAmount(m[1]);
    if (amount === null || amount === 0) continue;

    // 形如「烤串 15 x 12.00 180.00」：行尾已是小计，直接用；
    // 若行尾金额与「数量×单价」接近，取乘算结果（OCR 有时只识别出单价列）。
    const head = line.slice(0, m.index);
    const qp = QTY_PRICE.exec(head);
    if (qp?.[1] && qp?.[2]) {
      const qty = Number(qp[1]);
      const price = Number(qp[2]);
      const product = qty * price;
      if (Math.abs(amount - product) <= Math.max(0.02, product * 0.02)) {
        items.push(Math.round(product * 100) / 100);
        continue;
      }
    }

    items.push(Math.round(amount * 100) / 100);
  }
  return items;
}

export function crossCheckLines(rawText: string, total: number | null): LineCheck {
  const result: LineCheck = {
    ok: true,
    checked: false,
    itemCount: 0,
    itemsSum: 0,
    total,
    diff: 0,
    message: "",
  };
  if (total === null || total <= 0) return result;

  const text = rawText ?? "";
  // 有折让时分母口径不一致，判断没有意义
  if (DISCOUNT_KEYWORDS.some((k) => text.includes(k))) return result;

  const items = extractItems(text);
  result.itemCount = items.length;
  result.itemsSum = Math.round(items.reduce((a, b) => a + b, 0) * 100) / 100;

  // 少于 2 条明细不做判断：记账用的是「合计」，明细只影响粒度。
  // 若 OCR 漏掉一行，明细之和自然小于合计，但金额本身仍是对的，
  // 此时报警只会制造噪音（很多小票还有服务费/打包费未逐行列出）。
  if (items.length < 2) return result;

  result.checked = true;
  const diff = Math.abs(result.itemsSum - total);
  result.diff = Math.round(diff * 100) / 100;

  // 容差：至少 0.5 元，且不超过合计的 1%——小票常有抹零与四舍五入
  const tolerance = Math.max(0.5, total * 0.01);
  if (diff <= tolerance) return result;

  // 只在偏差较大时报警（超过 5% 或 5 元），避免因漏识别一行而误报
  if (diff <= Math.max(5.0, total * 0.05)) return result;

  result.ok = false;
  result.message =
    `明细合计 ¥${result.itemsSum.toFixed(2)} 与票据合计 ¥${total.toFixed(2)} 相差 ` +
    `¥${result.diff.toFixed(2)}，可能是某个商品金额没识别对，建议核对`;
  return result;
}
