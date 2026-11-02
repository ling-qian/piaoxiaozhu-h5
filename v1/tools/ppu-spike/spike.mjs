import { PaddleOcrService } from "ppu-paddle-ocr";
import { readFileSync } from "node:fs";

const t0 = Date.now();
const svc = new PaddleOcrService();
await svc.initialize();
console.log(`模型加载: ${Date.now() - t0}ms`);

const buf = readFileSync("/tmp/receipt_test.jpg");
const img = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); // 库要求 ArrayBuffer
const t1 = Date.now();
const r = await svc.recognize(img, { flatten: true });
console.log(`识别耗时: ${Date.now() - t1}ms  平均置信度: ${r.confidence?.toFixed(3)}`);
console.log("---- 识别文本 ----");
console.log(r.text);
