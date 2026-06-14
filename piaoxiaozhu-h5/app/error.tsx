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
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="text-5xl mb-4">😵</div>
      <h2 className="text-lg font-semibold text-[#333333] mb-2">出了点问题</h2>
      <p className="text-sm text-[#999999] mb-6">
        {error.message || "页面加载失败，请稍后重试"}
      </p>
      <button
        onClick={reset}
        className="bg-brand text-white px-6 py-2.5 rounded-xl text-sm font-medium btn-press"
      >
        重新加载
      </button>
    </div>
  );
}
