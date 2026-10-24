/**
 * 字段提取对拍：同一批 OCR 文本，比较 TS 与 Python 的输出是否逐字段一致。
 */
import { readFileSync } from "node:fs";

import { extractFields } from "../src/lib/field-extractor.ts";

interface Case {
  name: string;
  text: string;
}

// 用 cwd 相对路径：esbuild 打包后 import.meta.url 指向产物位置，不是脚本位置
const corpus = JSON.parse(readFileSync("scripts/field-corpus.json", "utf8")) as Case[];
const out = corpus.map((c) => {
  const f = extractFields(c.text);
  return {
    name: c.name,
    merchant_name: f.merchantName,
    total_amount: f.totalAmount,
    tax_amount: f.taxAmount,
    invoice_date: f.invoiceDate,
    invoice_type: f.invoiceType,
    invoice_code: f.invoiceCode,
    invoice_no: f.invoiceNo,
    seller_tax_no: f.sellerTaxNo,
  };
});
console.log(JSON.stringify(out, null, 0));
