import { extractFields } from "../lib/extract-fields";
import { categorize } from "../lib/categorize";

interface TestCase {
  name: string;
  rawText: string;
  expected: {
    merchantName?: string | null;
    totalAmount?: number | null;
    taxAmount?: number | null;
    invoiceDate?: string | null;
    invoiceType?: string | null;
    categoryCode?: string;
  };
}

const testCases: TestCase[] = [
  {
    name: "增值税电子普通发票 - 美团外卖",
    rawText: `电子发票
增值税电子普通发票
发票代码：050002100311
发票号码：23456789
开票日期：2025年03月15日
购买方名称：张三餐饮店
销售方名称：北京三快科技有限公司
金额：¥85.50
税额：¥5.13
价税合计：¥90.63
备注：美团外卖佣金`,
    expected: {
      merchantName: "北京三快科技有限公司",
      totalAmount: 90.63,
      taxAmount: 5.13,
      invoiceDate: "2025-03-15",
      invoiceType: "vat_normal_electronic",
      categoryCode: "platform_fee",
    },
  },
  {
    name: "增值税专用发票 - 食材采购",
    rawText: `增值税专用发票
发票代码：1100221130
发票号码：12345678
开票日期：2025年01月20日
销售方名称：上海鲜汇贸易有限公司
金额：3,200.00
税额：416.00
价税合计：3,616.00
备注：蔬菜海鲜采购`,
    expected: {
      merchantName: "上海鲜汇贸易有限公司",
      totalAmount: 3616.0,
      taxAmount: 416.0,
      invoiceDate: "2025-01-20",
      invoiceType: "vat_special",
      categoryCode: "food_material",
    },
  },
  {
    name: "收据 - 房租",
    rawText: `收据
日期：2025-04-01
收款单位：杭州恒达物业管理有限公司
金额：¥8,500.00
备注：4月份商铺租金`,
    expected: {
      merchantName: "杭州恒达物业管理有限公司",
      totalAmount: 8500.0,
      invoiceDate: "2025-04-01",
      invoiceType: "receipt",
      categoryCode: "rent",
    },
  },
  {
    name: "机打发票 - 水电费",
    rawText: `机打发票
发票代码：133001100131
发票号码：88765432
开票日期：2025/02/10
销售方：杭州市电力公司
金额：1,256.80
税额：75.41
价税合计：1,332.21`,
    expected: {
      merchantName: "杭州市电力公司",
      totalAmount: 1332.21,
      taxAmount: 75.41,
      invoiceDate: "2025-02-10",
      invoiceType: "machine_printed",
      categoryCode: "utilities",
    },
  },
  {
    name: "电子发票 - 饿了么",
    rawText: `电子发票
增值税电子普通发票
开票日期：2025年05月08日
销售方名称：上海拉扎斯信息科技有限公司
金额：¥120.00
税额：¥7.20
价税合计：¥127.20
备注：饿了么平台服务费`,
    expected: {
      merchantName: "上海拉扎斯信息科技有限公司",
      totalAmount: 127.2,
      taxAmount: 7.2,
      invoiceDate: "2025-05-08",
      invoiceType: "vat_normal_electronic",
      categoryCode: "platform_fee",
    },
  },
  {
    name: "小票 - 超市购物",
    rawText: `永辉超市
小票
日期：2025.03.25
食用油  89.90
面粉    25.50
蔬菜    38.60
合计：¥154.00`,
    expected: {
      totalAmount: 154.0,
      invoiceDate: "2025-03-25",
      invoiceType: "receipt",
      categoryCode: "food_material",
    },
  },
  {
    name: "增值税普通发票 - 办公用品",
    rawText: `增值税普通发票
发票代码：3100211130
发票号码：55667788
开票日期：2025年06月12日
销售方名称：杭州办公用品有限公司
金额：¥580.00
税额：¥34.80
价税合计：¥614.80
备注：打印纸和墨盒`,
    expected: {
      merchantName: "杭州办公用品有限公司",
      totalAmount: 614.8,
      taxAmount: 34.8,
      invoiceDate: "2025-06-12",
      invoiceType: "vat_normal",
      categoryCode: "office",
    },
  },
  {
    name: "OCR噪声 - 常见识别错误",
    rawText: `增值税电子普通发票
开票日期：2O25年O3月1O日
销售方名称：美团（北京）科技有限公司
金额：￥2，350.00
税额：￥141.00
价税合计：￥2，491.00`,
    expected: {
      merchantName: "美团（北京）科技有限公司",
      totalAmount: 2491.0,
      taxAmount: 141.0,
      invoiceDate: null,
      invoiceType: "vat_normal_electronic",
      categoryCode: "platform_fee",
    },
  },
  {
    name: "工资条",
    rawText: `工资条
日期：2025-03-31
姓名：李四
基本工资：5,000.00
社保：1,200.00
公积金：800.00
实发：¥3,000.00`,
    expected: {
      totalAmount: 3000.0,
      invoiceDate: "2025-03-31",
      categoryCode: "salary",
    },
  },
  {
    name: "广告推广发票",
    rawText: `增值税电子普通发票
开票日期：2025年04月20日
销售方名称：北京字节跳动科技有限公司
金额：¥3,000.00
税额：¥180.00
价税合计：¥3,180.00
备注：抖音推广费用`,
    expected: {
      merchantName: "北京字节跳动科技有限公司",
      totalAmount: 3180.0,
      taxAmount: 180.0,
      invoiceDate: "2025-04-20",
      invoiceType: "vat_normal_electronic",
      categoryCode: "advertising",
    },
  },
  {
    name: "极简收据 - 仅金额",
    rawText: `收据
¥500.00`,
    expected: {
      totalAmount: 500.0,
      invoiceType: "receipt",
    },
  },
  {
    name: "空文本",
    rawText: "",
    expected: {
      merchantName: null,
      totalAmount: null,
      taxAmount: null,
      invoiceDate: null,
      invoiceType: null,
      categoryCode: "food_material",
    },
  },
  {
    name: "OCR噪声-Tesseract中文拆字",
    rawText: `增 值 税 电 子 普 通 发 票
发 票 代 码 : 050002100311
发 票 号 码 : 23456789
开 票 日 期 : 2025 年 03 月 15 日
销 售 方 名 称 : 北 京 三 快 科 技 有 限 公 司
金 额 : ¥85.50
税 额 : ¥5.13
价 税 合 计 : ¥90.63`,
    expected: {
      merchantName: "北京三快科技有限公司",
      totalAmount: 90.63,
      taxAmount: 5.13,
      invoiceDate: "2025-03-15",
      invoiceType: "vat_normal_electronic",
      categoryCode: "platform_fee",
    },
  },
  {
    name: "OCR噪声-¥符号误识别",
    rawText: `增值税电子普通发票
开票日期：2025年03月15日
销售方名称：北京三快科技有限公司
金额：又85.50
税额：又5.13
价税合计：玛90.63`,
    expected: {
      merchantName: "北京三快科技有限公司",
      totalAmount: 90.63,
      taxAmount: 5.13,
      invoiceDate: "2025-03-15",
      invoiceType: "vat_normal_electronic",
      categoryCode: "platform_fee",
    },
  },
];

function compareValues(actual: any, expected: any, field: string): { pass: boolean; detail: string } {
  if (expected === undefined) return { pass: true, detail: "未校验" };
  if (actual === expected) return { pass: true, detail: `✅ ${actual}` };

  if (typeof expected === "number" && typeof actual === "number") {
    const diff = Math.abs(actual - expected);
    if (diff < 0.02) return { pass: true, detail: `✅ ${actual} (误差${diff.toFixed(2)})` };
    return { pass: false, detail: `❌ 期望 ${expected}, 实际 ${actual}` };
  }

  return { pass: false, detail: `❌ 期望 ${expected}, 实际 ${actual}` };
}

function runExtractionTests() {
  console.log("\n" + "=".repeat(70));
  console.log("📋 字段提取准确度测试 (extractFields)");
  console.log("=".repeat(70));

  let totalFields = 0;
  let passedFields = 0;
  let failedDetails: string[] = [];

  for (const tc of testCases) {
    const fields = extractFields(tc.rawText);
    const cat = categorize(fields.merchantName, tc.rawText);

    const checks = {
      merchantName: compareValues(fields.merchantName, tc.expected.merchantName, "商户名"),
      totalAmount: compareValues(fields.totalAmount, tc.expected.totalAmount, "金额"),
      taxAmount: compareValues(fields.taxAmount, tc.expected.taxAmount, "税额"),
      invoiceDate: compareValues(fields.invoiceDate, tc.expected.invoiceDate, "日期"),
      invoiceType: compareValues(fields.invoiceType, tc.expected.invoiceType, "票据类型"),
      categoryCode: compareValues(cat.categoryCode, tc.expected.categoryCode, "分类"),
    };

    const allPass = Object.values(checks).every((c) => c.pass);
    const icon = allPass ? "✅" : "❌";

    console.log(`\n${icon} ${tc.name}`);
    for (const [field, result] of Object.entries(checks)) {
      totalFields++;
      if (result.pass) passedFields++;
      else failedDetails.push(`  ${tc.name} / ${field}: ${result.detail}`);
      console.log(`  ${field}: ${result.detail}`);
    }
  }

  console.log("\n" + "-".repeat(70));
  console.log(`📊 字段提取总结: ${passedFields}/${totalFields} 通过 (${((passedFields / totalFields) * 100).toFixed(1)}%)`);

  if (failedDetails.length > 0) {
    console.log("\n❌ 失败详情:");
    failedDetails.forEach((d) => console.log(d));
  }

  return { totalFields, passedFields, failedDetails };
}

async function runOcrEndToEndTest() {
  console.log("\n" + "=".repeat(70));
  console.log("📷 端到端 OCR 测试 (Tesseract.js + extractFields)");
  console.log("=".repeat(70));

  let createCanvasFn: any;
  try {
    const canvasMod = await import("canvas");
    createCanvasFn = canvasMod.createCanvas;
  } catch {
    console.log("\n⚠️ canvas 模块不可用，跳过端到端测试");
    console.log("  安装方法: npm install --save-dev canvas");
    return;
  }

  const Tesseract = (await import("tesseract.js")).default;

  const invoiceTexts = [
    {
      name: "Canvas生成-增值税发票",
      lines: [
        "增值税电子普通发票",
        "发票代码：050002100311",
        "发票号码：23456789",
        "开票日期：2025年03月15日",
        "销售方名称：北京三快科技有限公司",
        "金额：¥85.50",
        "税额：¥5.13",
        "价税合计：¥90.63",
      ],
      expected: { totalAmount: 90.63, invoiceType: "vat_normal_electronic" },
    },
    {
      name: "Canvas生成-收据",
      lines: [
        "收据",
        "日期：2025-04-01",
        "收款单位：杭州恒达物业",
        "金额：¥8,500.00",
      ],
      expected: { totalAmount: 8500.0, invoiceType: "receipt" },
    },
  ];

  for (const inv of invoiceTexts) {
    const canvas = createCanvasFn(600, 400);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 600, 400);

    ctx.fillStyle = "#000000";
    ctx.font = "bold 22px SimSun, serif";
    inv.lines.forEach((line: string, i: number) => {
      ctx.fillText(line, 40, 55 + i * 40);
    });

    const tmpPath = `/tmp/piaoxiaozhu-test-${Date.now()}.png`;
    const fs = await import("fs");
    const buf = canvas.toBuffer("image/png");
    fs.writeFileSync(tmpPath, buf);

    console.log(`\n🔍 ${inv.name} - 开始OCR识别...`);
    const startTime = Date.now();

    try {
      const result = await Tesseract.recognize(tmpPath, "chi_sim+eng", {
        logger: () => {},
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rawText = result.data.text;
      const ocrConf = (result.data.confidence / 100).toFixed(2);

      console.log(`  耗时: ${elapsed}s | OCR置信度: ${ocrConf}`);
      console.log(`  原始文本:\n${rawText.split("\n").map((l: string) => "    " + l).join("\n")}`);

      const fields = extractFields(rawText);
      console.log(`  提取结果:`);
      console.log(`    商户: ${fields.merchantName}`);
      console.log(`    金额: ${fields.totalAmount}`);
      console.log(`    税额: ${fields.taxAmount}`);
      console.log(`    日期: ${fields.invoiceDate}`);
      console.log(`    类型: ${fields.invoiceType}`);

      const cat = categorize(fields.merchantName, rawText);
      console.log(`    分类: ${cat.categoryL1} (${cat.categoryCode}) [${cat.reason}]`);

      const amountOk = inv.expected.totalAmount != null
        ? compareValues(fields.totalAmount, inv.expected.totalAmount, "金额")
        : { pass: true, detail: "未校验" };
      const typeOk = inv.expected.invoiceType != null
        ? compareValues(fields.invoiceType, inv.expected.invoiceType, "类型")
        : { pass: true, detail: "未校验" };

      console.log(`  校验: 金额${amountOk.detail} | 类型${typeOk.detail}`);
    } catch (err: any) {
      console.log(`  ❌ OCR失败: ${err.message}`);
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  }
}

async function main() {
  console.log("🧪 票小助 H5 - OCR 准确度测试");
  console.log(`📅 ${new Date().toLocaleString("zh-CN")}`);

  const extractionResult = runExtractionTests();

  try {
    await runOcrEndToEndTest();
  } catch (err: any) {
    console.log(`\n⚠️ 端到端测试跳过: ${err.message}`);
    console.log("  需要安装 canvas: npm install --save-dev canvas");
  }

  console.log("\n" + "=".repeat(70));
  console.log("🏁 测试完成");
  console.log("=".repeat(70));

  process.exit(extractionResult.failedDetails.length > 0 ? 1 : 0);
}

main().catch(console.error);
