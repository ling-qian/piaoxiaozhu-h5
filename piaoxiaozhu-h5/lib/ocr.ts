import Tesseract from "tesseract.js";

export interface OcrResult {
  rawText: string;
  confidence: number;
}

const OCR_TIMEOUT_MS = 90_000; // OCR 最大 90 秒

function preprocessImage(file: File | Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      // 限制最大尺寸，避免内存溢出
      const maxDim = 2048;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      // 放大小图以提高识别率
      const scale = Math.min(2, 1200 / Math.min(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // 计算灰度值
      const grayValues: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        grayValues.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }

      // 计算平均亮度判断票据类型
      const avgBrightness = grayValues.reduce((a, b) => a + b, 0) / grayValues.length;

      // Otsu 自适应阈值
      const histogram = new Array(256).fill(0);
      for (const g of grayValues) histogram[Math.min(255, Math.round(g))]++;
      const total = grayValues.length;

      let sum = 0;
      for (let i = 0; i < 256; i++) sum += i * histogram[i];

      let sumB = 0;
      let wB = 0;
      let maxVariance = 0;
      let threshold = 128;

      for (let t = 0; t < 256; t++) {
        wB += histogram[t];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += t * histogram[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const variance = wB * wF * (mB - mF) * (mB - mF);
        if (variance > maxVariance) {
          maxVariance = variance;
          threshold = t;
        }
      }

      // 根据亮度选择处理策略
      if (avgBrightness > 200) {
        // 浅色票据（白底）：增强对比度，不做二值化
        for (let i = 0; i < data.length; i += 4) {
          const gray = grayValues[i / 4];
          // 增强对比度：将暗色区域加深
          const enhanced = gray < threshold
            ? Math.max(0, gray * 0.6)
            : Math.min(255, 128 + (gray - 128) * 1.5);
          data[i] = enhanced;
          data[i + 1] = enhanced;
          data[i + 2] = enhanced;
        }
      } else if (avgBrightness > 150) {
        // 中等亮度：轻度二值化，保留灰度层次
        for (let i = 0; i < data.length; i += 4) {
          const gray = grayValues[i / 4];
          const val = gray > threshold + 20 ? 255
            : gray < threshold - 20 ? 0
            : gray;
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
        }
      } else {
        // 暗色票据：强二值化
        for (let i = 0; i < data.length; i += 4) {
          const gray = grayValues[i / 4];
          const val = gray > threshold ? 255 : 0;
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob(
        (blob) => resolve(blob || file),
        "image/png",
        1.0
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

export function cleanOcrText(text: string): string {
  let cleaned = text;

  // 移除零宽字符
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, "");

  // 常见 OCR 字符修正
  const ocrCharFixes: [RegExp, string][] = [
    // 金额符号修正
    [/又/g, "¥"],
    [/￥/g, "¥"],
    [/玛/g, "¥"],
    [/¥\s*¥/g, "¥"],
    // 数字中混入字母
    [/0O(?=\d)/g, "00"],
    [/(?<=\d)O(?=\d)/g, "0"],
    [/(?<=\d)l(?=\d)/g, "1"],
    [/(?<=\d)I(?=\d)/g, "1"],
    [/(?<=\d)S(?=\d)/g, "5"],
    [/(?<=\d)B(?=\d)/g, "8"],
    // 常见汉字 OCR 错误
    [/发累/g, "发票"],
    [/发栗/g, "发票"],
    [/税额/g, "税额"],
    [/合汁/g, "合计"],
    [/大写/g, "大写"],
    [/小写/g, "小写"],
    [/人民市/g, "人民币"],
    [/人民巾/g, "人民币"],
    [/价税/g, "价税"],
    [/合认/g, "合计"],
    [/金颧/g, "金额"],
    [/金颠/g, "金额"],
    [/收款/g, "收款"],
    [/付款/g, "付款"],
    [/购买方/g, "购买方"],
    [/销售方/g, "销售方"],
    // 日期格式修正
    [/(\d{4})年(\d{1,2})月(\d{1,2})日/g, "$1-$2-$3"],
  ];

  for (const [pattern, replacement] of ocrCharFixes) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // 合并中文字符间的多余空格
  const lines = cleaned.split("\n");
  const merged: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      merged.push("");
      continue;
    }
    const deSpaced = trimmed.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "");
    merged.push(deSpaced);
  }

  return merged.join("\n");
}

interface TesseractLoggerInfo {
  status: string;
  progress: number;
}

export async function recognizeImage(
  imageFile: File | Blob,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<OcrResult> {
  const processed = await preprocessImage(imageFile);

  const config: Record<string, unknown> = {
    logger: (info: TesseractLoggerInfo) => {
      if (info.status === "recognizing text" && onProgress) {
        onProgress(Math.round(info.progress * 100));
      }
    },
    // 从本地 public/tessdata 加载语言包，避免 CDN 被墙导致乱码
    langPath: "/tessdata",
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
  };

  // 超时控制：在 OCR 耗时过长时自动中止
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let rejectFn: ((reason: Error) => void) | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectFn = reject;
    timeoutId = setTimeout(() => {
      reject(new Error("OCR 识别超时，请重试或使用手动录入"));
    }, OCR_TIMEOUT_MS);
  });

  // AbortSignal 支持
  const abortPromise = signal
    ? new Promise<never>((_, reject) => {
        const onAbort = () => reject(new Error("OCR 已取消"));
        signal.addEventListener("abort", onAbort, { once: true });
      })
    : new Promise<never>(() => {});

  try {
    const result = await Promise.race([
      Tesseract.recognize(
        processed,
        "chi_sim+eng",
        config as Partial<Tesseract.WorkerOptions>
      ),
      timeoutPromise,
      abortPromise,
    ]);

    const rawText = cleanOcrText(result.data.text);

    return {
      rawText,
      confidence: result.data.confidence / 100,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
