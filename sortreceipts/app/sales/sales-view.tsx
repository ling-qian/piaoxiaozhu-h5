"use client";

/**
 * 营业额与毛利。
 *
 * 一屏只做一件事：记今天（或补某天）的营业额，然后看这个月的毛利。
 * 支出只读不填——它来自票据，在这里再录一次就会出现两套数。
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import PageHeader from "@/components/page-header";
import { useToast } from "@/components/toast";
import { CURRENCY_SYMBOL, formatMoney } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { saveSale, type SalesResult } from "@/lib/actions/sales-actions";

interface SalesViewProps {
  projectId: string;
  data: SalesResult;
}

/** 本地今天：不能直接用 toISOString，那是 UTC，跨零点会差一天 */
function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function defaultDate(month: string): string {
  const today = todayLocal();
  return today.startsWith(month) ? today : `${month}-01`;
}

export default function SalesView({ projectId, data }: SalesViewProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { showToast } = useToast();

  const [date, setDate] = useState(defaultDate(data.month));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // 切月份后表单日期要跟着落在新月份，否则一保存就跳回上个月
  useEffect(() => {
    setDate(defaultDate(data.month));
  }, [data.month]);

  async function handleSave() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      showToast(t("sales.dateInvalid"), "error");
      return;
    }
    const value = Number(amount);
    if (!amount.trim() || !Number.isFinite(value) || value < 0) {
      showToast(t("sales.amountInvalid"), "error");
      return;
    }

    setSaving(true);
    try {
      await saveSale(projectId, { date, amount: value, note: note.trim() || null });
      showToast(t("sales.saved"), "success");
      setAmount("");
      setNote("");

      const savedMonth = date.slice(0, 7);
      if (savedMonth !== data.month) {
        router.push(`/sales?project=${projectId}&month=${savedMonth}`);
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("sales.saveFailed");
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  function editDay(day: { date: string; amount: number; note: string | null }) {
    setDate(day.date);
    setAmount(String(day.amount));
    setNote(day.note ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-16">
      <PageHeader
        title={t("sales.title")}
        desktopTitle={t("sales.title")}
        desktopSubtitle={t("sales.subtitle")}
        showBack
        onBack={() => router.back()}
      />

      <div className="px-4 pt-1 space-y-4 lg:mx-auto lg:max-w-3xl lg:px-10 lg:pt-6">
        <div className="bg-white rounded-md p-4 shadow-card">
          <label className="text-sm text-[#475569] mb-2 block">{t("sales.month")}</label>
          <input
            type="month"
            value={data.month}
            onChange={(e) => {
              const next = e.target.value;
              if (!/^\d{4}-\d{2}$/.test(next)) return;
              router.push(`/sales?project=${projectId}&month=${next}`);
            }}
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>

        {/* 录入 */}
        <div className="bg-white rounded-md p-4 shadow-card space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm text-[#475569] mb-1">{t("sales.date")}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-[#475569] mb-1">{t("sales.amount")}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] text-xs">
                  {CURRENCY_SYMBOL}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-[#E2E8F0] rounded-lg pl-7 pr-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-[#475569] mb-1">{t("sales.note")}</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              autoComplete="off"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-brand text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 btn-press"
          >
            {saving ? t("sales.saving") : t("sales.save")}
          </button>
        </div>

        {/* 月度汇总 */}
        <div className="bg-white rounded-md p-4 shadow-card">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("sales.revenue")} value={formatMoney(data.summary.revenue)} tone="brand" />
            <Stat label={t("sales.expense")} value={formatMoney(data.summary.expense)} tone="expense" />
            <Stat label={t("sales.grossProfit")} value={formatMoney(data.summary.gross_profit)} tone="income" />
            <Stat label={t("sales.margin")} value={`${data.summary.margin}%`} tone="muted" />
          </div>
          <p className="text-xs text-[#64748B] leading-relaxed mt-3">{t("sales.hint")}</p>
        </div>

        {/* 每天一行 */}
        <div className="bg-white rounded-md shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4">
            <h3 className="text-sm font-medium text-[#0F172A]">{t("sales.daysList")}</h3>
            <span className="text-xs text-[#64748B]">
              {t("sales.days").replace("{n}", String(data.summary.days_count))}
            </span>
          </div>

          {data.days.length === 0 ? (
            <p className="text-sm text-[#64748B] px-4 py-4">{t("sales.noDays")}</p>
          ) : (
            <div className="mt-2">
              {data.days.map((day) => (
                <button
                  key={day.date}
                  onClick={() => editDay(day)}
                  className="w-full flex items-center gap-3 px-4 py-3 border-t border-[#F1F5F9] text-left active:bg-[#F8FAFC]"
                >
                  <span className="text-sm text-[#0F172A] w-24 shrink-0">{day.date}</span>
                  <span className="flex-1 min-w-0 truncate text-xs text-[#64748B]">
                    {day.note || ""}
                  </span>
                  <span className="text-sm text-[#0F172A] shrink-0">{formatMoney(day.amount)}</span>
                  <span className="text-xs text-brand shrink-0">{t("sales.edit")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "brand" | "expense" | "income" | "muted";
}) {
  const color =
    tone === "brand"
      ? "text-brand"
      : tone === "expense"
        ? "text-[#DC2626]"
        : tone === "income"
          ? "text-[#059669]"
          : "text-[#475569]";
  return (
    <div className="rounded-lg bg-[#F8FAFC] px-3 py-2.5">
      <p className="text-xs text-[#64748B]">{label}</p>
      <p className={`text-base font-semibold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}
