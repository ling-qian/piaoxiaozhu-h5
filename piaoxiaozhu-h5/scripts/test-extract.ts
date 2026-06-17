/**
 * 字段提取测试脚本 - 直接测试 extractFields 逻辑
 * 用法: npx tsx scripts/test-extract.ts
 */

import { extractFields } from "../lib/extract-fields";
import { cleanOcrText } from "../lib/ocr";

// 模拟各种常见票据的 OCR 文本
const testCases = [
  {
    name: "增值税电子普通发票",
    text: `
电子发票（普通发票）
发票号码: 2430200000001115487629
开票日期: 2026年06月10日
购买方名称: 北京某某餐饮管理有限公司
销售方名称: 上海某某食品科技有限公司
金  额: ¥1,234.56
税  率: 6%
税  额: ¥74.07
价税合计: ¥1,308.63
    `,
  },
  {
    name: "餐饮小票",
    text: `
美团外卖
订单号: 202606101234567890
商户: 张三麻辣烫（望京店）
合计: ¥45.80
支付时间: 2026-06-10 12:30
    `,
  },
  {
    name: "饿了么订单",
    text: `
饿了么
订单编号 2026061012345678
商家名称: 李四黄焖鸡米饭
实付金额: ¥32.50
下单时间: 2026年06月10日
    `,
  },
  {
    name: "超市购物小票",
    text: `
永辉超市
日期: 2026-06-08
收银员: 001
商品: 矿泉水 x2  6.00
商品: 面包 x1    8.50
商品: 牛奶 x1   12.80
合计: ¥27.30
    `,
  },
  {
    name: "增值税专用发票",
    text: `
增值税专用发票
发票代码: 044002100311
发票号码: 2430200000001115487629
开票日期: 2026年05月28日
销售方名称: 北京某某商贸有限公司
金  额: ¥50,000.00
税  率: 13%
税  额: ¥6,500.00
价税合计: ¥56,500.00
    `,
  },
  {
    name: "租金发票（常见问题）",
    text: `
电子发票
发票号码 12345678
开票日期 2026年03月01日
销售方名称: 某某物业管理有限公司
金额: ¥8,000.00
税率: 9%
税额: ¥720.00
价税合计: ¥8,720.00
    `,
  },
  {
    name: "OCR识别质量差的发票",
    text: `
发累
号码: 2430200000
日期 2026年06月01日
销售方 某某餐饮有限公司
金颧 又1,234.56
税率 6%
税额 又74.07
价税合计 又1,308.63
    `,
  },
  {
    name: "只有¥符号的小票",
    text: `
瑞幸咖啡
2026-06-15
拿铁 x1 ¥18.00
生椰拿铁 x2 ¥38.00
¥56.00
    `,
  },
];

console.log("═══════════════════════════════════════════════════════");
console.log("  票据字段提取测试");
console.log("═══════════════════════════════════════════════════════\n");

let passCount = 0;
let failCount = 0;

for (const tc of testCases) {
  console.log(`\n📋 测试: ${tc.name}`);
  console.log("─────────────────────────────────────────────────────");

  const cleaned = cleanOcrText(tc.text);
  console.log("cleanOcrText 后:");
  console.log(cleaned.split("\n").map(l => `  ${l}`).join("\n"));

  const fields = extractFields(tc.text);

  console.log("\n提取结果:");
  const amountStr = fields.totalAmount ? `¥${fields.totalAmount.toFixed(2)}` : "❌ 未识别";
  const merchantStr = fields.merchantName || "❌ 未识别";
  const dateStr = fields.invoiceDate || "❌ 未识别";
  const taxStr = fields.taxAmount ? `¥${fields.taxAmount.toFixed(2)}` : "-";
  const typeStr = fields.invoiceType || "-";

  console.log(`  💰 金额: ${amountStr}`);
  console.log(`  🏪 商户: ${merchantStr}`);
  console.log(`  📅 日期: ${dateStr}`);
  console.log(`  🧾 税额: ${taxStr}`);
  console.log(`  📄 类型: ${typeStr}`);

  // 简单判断是否成功
  if (fields.totalAmount && fields.totalAmount > 0) {
    console.log("  ✅ 金额识别成功");
    passCount++;
  } else {
    console.log("  ❌ 金额识别失败");
    failCount++;
  }
}

console.log("\n═══════════════════════════════════════════════════════");
console.log(`  结果: ${passCount} 通过, ${failCount} 失败`);
console.log("═══════════════════════════════════════════════════════");
