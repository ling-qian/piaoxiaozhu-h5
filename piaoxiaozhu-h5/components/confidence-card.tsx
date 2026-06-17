"use client";

import { useState } from "react";
import { getConfidenceColor, getConfidenceHint } from "@/lib/utils";

interface ConfidenceCardProps {
  confidence: number;
  rawText: string | null;
}

/** 识别置信度卡片 — 进度条 + 提示 + OCR 原文折叠 */
export default function ConfidenceCard({
  confidence,
  rawText,
}: ConfidenceCardProps) {
  return (
    <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[#666666]">识别置信度</span>
        <span
          className="text-sm font-medium"
          style={{ color: getConfidenceColor(confidence) }}
        >
          {Math.round(confidence * 100)}%
        </span>
      </div>
      <div className="w-full h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${confidence * 100}%`,
            backgroundColor: getConfidenceColor(confidence),
          }}
        />
      </div>
      <p className="text-xs text-[#999999] mt-1.5">
        {getConfidenceHint(confidence)}
      </p>

      {/* OCR 原文查看 */}
      {rawText && (
        <OcrRawText rawText={rawText} />
      )}
    </div>
  );
}

function OcrRawText({ rawText }: { rawText: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mt-3 pt-3 border-t border-[#EEEEEE]">
      <button
        onClick={() => setShow(!show)}
        className="flex items-center justify-between w-full"
      >
        <span className="text-xs text-[#999999]">OCR 识别原文</span>
        <span className="text-xs text-brand">
          {show ? "收起 ▲" : "查看 ▼"}
        </span>
      </button>
      {show && (
        <pre className="mt-2 text-xs text-[#666666] bg-gray-50 rounded-lg p-3 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
          {rawText}
        </pre>
      )}
    </div>
  );
}
