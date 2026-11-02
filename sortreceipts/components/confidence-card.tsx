"use client";

import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
  return (
    <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[#475569]">{t("confidence.label")}</span>
        <span
          className="text-sm font-medium"
          style={{ color: getConfidenceColor(confidence) }}
        >
          {Math.round(confidence * 100)}%
        </span>
      </div>
      <div className="w-full h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${confidence * 100}%`,
            backgroundColor: getConfidenceColor(confidence),
          }}
        />
      </div>
      <p className="text-xs text-[#64748B] mt-1.5">
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
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="mt-3 pt-3 border-t border-[#E2E8F0]">
      <button
        onClick={() => setShow(!show)}
        className="flex items-center justify-between w-full"
      >
        <span className="text-xs text-[#64748B]">{t("confidence.ocrRaw")}</span>
        <span className="text-xs text-brand">
          {show ? `${t("common.collapse")} ▲` : `${t("common.expand")} ▼`}
        </span>
      </button>
      {show && (
        <pre className="mt-2 text-xs text-[#475569] bg-gray-50 rounded-lg p-3 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
          {rawText}
        </pre>
      )}
    </div>
  );
}
