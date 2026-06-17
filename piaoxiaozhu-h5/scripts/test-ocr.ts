/**
 * 本地 OCR 测试脚本
 * 用法: npx tsx scripts/test-ocr.ts <图片路径>
 */
import { recognizeImage, cleanOcrText } from "../lib/ocr";
import { extractFields } from "../lib/extract-fields";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("用法: npx tsx scripts/test-ocr.ts <图片路径>");
    process.exit(1);
  }

  const resolved = path.resolve(imagePath);
  if (!fs.existsSync(resolved)) {
    console.error(`文件不存在: ${resolved}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
  };
  const mime = mimeMap[ext] || "image/jpeg";
  const file = new File([buffer], path.basename(resolved), { type: mime });

  console.log(`\n📷 图片: ${path.basename(resolved)} (${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log("⏳ 开始 OCR 识别...\n");

  const startTime = Date.now();

  try {
    const result = await recognizeImage(file, (progress) => {
      if (progress % 20 === 0 || progress === 100) {
        console.log(`  进度: ${progress}%`);
      }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ OCR 完成 (${elapsed}s)，置信度: ${(result.confidence * 100).toFixed(1)}%\n`);

    console.log("═══════════════════════════════════════");
    console.log("OCR 原文:");
    console.log("═══════════════════════════════════════");
    console.log(result.rawText);

    console.log("\n═══════════════════════════════════════");
    console.log("cleanOcrText 后:");
    console.log("═══════════════════════════════════════");
    const cleaned = cleanOcrText(result.rawText);
    console.log(cleaned);

    console.log("\n═══════════════════════════════════════");
    console.log("提取字段:");
    console.log("═══════════════════════════════════════");
    const fields = extractFields(result.rawText);
    console.log(JSON.stringify(fields, null, 2));

    if (fields.totalAmount) {
      console.log(`\n💰 金额: ¥${fields.totalAmount.toFixed(2)}`);
    } else {
      console.log("\n⚠️  未识别到金额!");
    }
    if (fields.merchantName) {
      console.log(`🏪 商户: ${fields.merchantName}`);
    } else {
      console.log("⚠️  未识别到商户名!");
    }
    if (fields.invoiceDate) {
      console.log(`📅 日期: ${fields.invoiceDate}`);
    }
    if (fields.taxAmount) {
      console.log(`🧾 税额: ¥${fields.taxAmount.toFixed(2)}`);
    }
  } catch (err) {
    console.error("❌ OCR 失败:", err);
  }
}

main();
