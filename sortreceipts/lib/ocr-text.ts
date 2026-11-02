/**
 * OCR 结果的文本清洗。
 *
 * 原来这些逻辑和浏览器端 Tesseract 的调用放在同一个文件（`lib/ocr.ts`）。
 * 现在识别统一走后端 PaddleOCR，浏览器不再跑 OCR，所以那个文件删了，
 * 但清洗函数还有用——`extract-fields.ts` 在没有图片、只能吃文本时要用它。
 *
 * 单独成文件而不是内联进 extract-fields：这段映射表有几十条，
 * 混进字段提取逻辑里会让那个文件更难读。
 */

/** 修正 OCR 常见错字，去掉中文字间多余空格 */
export function cleanOcrText(text: string): string {
  let cleaned = text;

  // 移除零宽字符。有些 OCR 引擎会在中文字符间插入它们，肉眼看不见但会打断正则匹配
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, "");

  const ocrCharFixes: [RegExp, string][] = [
    // 金额符号：OCR 常把 ¥ 认成「又」「玛」，或输出全角「￥」
    [/又/g, "¥"],
    [/￥/g, "¥"],
    [/玛/g, "¥"],
    [/¥\s*¥/g, "¥"],
    // 数字中混入字母。只在数字之间替换，避免误伤正常单词
    [/0O(?=\d)/g, "00"],
    [/(?<=\d)O(?=\d)/g, "0"],
    [/(?<=\d)l(?=\d)/g, "1"],
    [/(?<=\d)I(?=\d)/g, "1"],
    [/(?<=\d)S(?=\d)/g, "5"],
    [/(?<=\d)B(?=\d)/g, "8"],
    // 常见汉字误认
    [/发累/g, "发票"],
    [/发栗/g, "发票"],
    [/合汁/g, "合计"],
    [/合认/g, "合计"],
    [/人民市/g, "人民币"],
    [/人民巾/g, "人民币"],
    [/金颧/g, "金额"],
    [/金颠/g, "金额"],
    // 日期格式统一成 YYYY-MM-DD，后面的正则才好解析
    [/(\d{4})年(\d{1,2})月(\d{1,2})日/g, "$1-$2-$3"],
  ];

  for (const [pattern, replacement] of ocrCharFixes) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // 去掉中文字符之间的空格。英文和数字之间的空格要保留，否则金额和单位会粘在一起
  const lines = cleaned.split("\n");
  const merged: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      merged.push("");
      continue;
    }
    merged.push(trimmed.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, ""));
  }

  return merged.join("\n");
}
