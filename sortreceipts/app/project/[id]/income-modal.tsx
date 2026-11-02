"use client";

import { useI18n } from "@/lib/i18n";
import { useState } from "react";

interface IncomeModalProps {
  projectId: string;
  onClosed: () => void;
  onSuccess: () => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

/** 添加收入弹窗 */
export default function IncomeModal({
  projectId,
  onClosed,
  onSuccess,
  showToast,
}: IncomeModalProps) {
  const { t } = useI18n();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      showToast(t("income.invalidAmount"), "error");
      return;
    }
    setSubmitting(true);
    try {
      const { addManualIncome } = await import("@/lib/actions/record-actions");
      await addManualIncome(projectId, month, amt);
      showToast(t("income.added"), "success");
      onSuccess();
    } catch {
      showToast(t("income.addFailed"), "error");
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
        <h3 className="text-base font-semibold mb-4">{t("income.title")}</h3>
        <div className="mb-3">
          <label className="block text-xs text-[#64748B] mb-1.5">{t("income.month")}</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <div className="mb-4">
          <label className="block text-xs text-[#64748B] mb-1.5">{t("income.amountYuan")}</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("income.amountPlaceholder")}
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClosed}
            className="flex-1 border border-[#E2E8F0] py-2.5 rounded-xl text-sm btn-press"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-[#059669] text-white py-2.5 rounded-xl text-sm disabled:opacity-50 btn-press"
          >
            {submitting ? t("common.submitting") : t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
