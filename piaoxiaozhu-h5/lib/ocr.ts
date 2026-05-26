import Tesseract from "tesseract.js";

export interface OcrResult {
  rawText: string;
  confidence: number;
}

export async function recognizeImage(
  imageFile: File | Blob,
  onProgress?: (progress: number) => void
): Promise<OcrResult> {
  const result = await Tesseract.recognize(imageFile, "chi_sim+eng", {
    logger: (info) => {
      if (info.status === "recognizing text" && onProgress) {
        onProgress(Math.round(info.progress * 100));
      }
    },
  });

  return {
    rawText: result.data.text,
    confidence: result.data.confidence / 100,
  };
}
