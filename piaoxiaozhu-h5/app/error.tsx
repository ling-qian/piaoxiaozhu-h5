"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-page">
      <div className="text-center animate-fade-in-up">
        <div className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="#FF4D4F" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-[#333333] mb-2">出了点问题</h2>
        <p className="text-sm text-[#999999] mb-6">
          页面加载出错，请稍后重试
        </p>
        <button
          onClick={reset}
          className="bg-brand text-white px-8 py-2.5 rounded-xl text-sm font-medium btn-press"
        >
          重新加载
        </button>
      </div>
    </div>
  );
}
