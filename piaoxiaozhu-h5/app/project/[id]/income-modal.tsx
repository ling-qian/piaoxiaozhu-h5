"use client";

import { useState } from "react";

interface IncomeModalProps {
  projectId: string;
  onClosed: () => void;
  onSuccess: () => void;
  showToast: (msg: string, type: string) => void;
}

/** 添加收入弹窗 */
export default function IncomeModal({
  projectId,
  onClosed,
  onSuccess,
  showToast,
}: IncomeModalProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      showToast("请输入有效金额", "error");
      return;
    }
    setSubmitting(true);
    try {
      const { addManualIncome } = await import("@/lib/actions/record-actions");
      await addManualIncome(projectId, month, amt);
      showToast("收入添加成功", "success");
      onSuccess();
    } catch {
      showToast("添加失败", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center animate-fade-in"
      onClick={onClosed}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-mobile animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-4">添加收入</h3>
        <div className="mb-3">
          <label className="block text-xs text-[#999999] mb-1.5">月份</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <div className="mb-4">
          <label className="block text-xs text-[#999999] mb-1.5">金额（元）</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="请输入收入金额"
            className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClosed}
            className="flex-1 border border-[#EEEEEE] py-2.5 rounded-xl text-sm btn-press"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-[#52C41A] text-white py-2.5 rounded-xl text-sm disabled:opacity-50 btn-press"
          >
            {submitting ? "提交中..." : "确定"}
          </button>
        </div>
      </div>
    </div>
  );
}
