"use client";

import { useState, useTransition } from "react";

import PageHeader from "@/components/page-header";
import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n";
import { checkin, getCheckinCalendar, type CheckinCalendar } from "@/lib/actions/points-actions";

/** 一个月的日历格子。周一起头，空位补 null，空格子渲染成占位块 */
function buildMonthCells(month: string): (number | null)[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];

  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=周日
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // 转成「周一为第 0 列」
  const leading = (firstWeekday + 6) % 7;

  const cells: (number | null)[] = Array(leading).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

export default function CheckinClient({ initial }: { initial: CheckinCalendar | null }) {
  const { t } = useI18n();
  const { showToast } = useToast();

  const [calendar, setCalendar] = useState<CheckinCalendar | null>(initial);
  const [pending, startTransition] = useTransition();
  const [checkingIn, setCheckingIn] = useState(false);

  const cells = calendar ? buildMonthCells(calendar.month) : [];
  const checkedSet = new Set(calendar?.checkedDates ?? []);

  async function handleCheckin() {
    if (checkingIn || calendar?.todayCheckedIn) return;
    setCheckingIn(true);
    try {
      const res = await checkin();
      showToast(res.message, "success");
      // 重新拉一次日历：连续天数和本月天数都会变，本地算容易和后端不一致
      const fresh = await getCheckinCalendar().catch(() => null);
      if (fresh) setCalendar(fresh);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("checkin.failed"), "error");
    } finally {
      setCheckingIn(false);
    }
  }

  function changeMonth(delta: number) {
    if (!calendar) return;
    const [y, m] = calendar.month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const target = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

    startTransition(async () => {
      const fresh = await getCheckinCalendar(target).catch(() => null);
      if (fresh) setCalendar(fresh);
    });
  }

  return (
    <div className="pb-16 min-h-screen bg-[#F8FAFC] lg:pb-10">
      <PageHeader title={t("checkin.title")} showBack />

      <div className="px-4 pt-1 space-y-3 lg:mx-auto lg:max-w-3xl lg:space-y-4 lg:px-10 lg:pt-6">
        {/* 余额与核心指标 */}
        <div className="bg-white rounded-xl p-4 shadow-card">
          <p className="text-xs text-[#64748B] mb-1">{t("checkin.balance")}</p>
          <p className="text-3xl font-bold text-[#2563EB]">{calendar?.balance ?? 0}</p>

          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="text-center">
              <p className="text-lg font-semibold text-[#0F172A]">
                {calendar?.streak ?? 0}
                <span className="text-xs font-normal text-[#64748B] ml-0.5">
                  {t("checkin.streakUnit")}
                </span>
              </p>
              <p className="text-[11px] text-[#64748B]">{t("checkin.streak")}</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-[#0F172A]">
                {calendar?.monthCount ?? 0}
                <span className="text-xs font-normal text-[#64748B] ml-0.5">
                  {t("checkin.streakUnit")}
                </span>
              </p>
              <p className="text-[11px] text-[#64748B]">{t("checkin.monthCount")}</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-[#059669]">+{calendar?.reward ?? 0}</p>
              <p className="text-[11px] text-[#64748B]">{t("checkin.reward")}</p>
            </div>
          </div>
        </div>

        {/* 签到按钮 */}
        <button
          onClick={handleCheckin}
          disabled={checkingIn || calendar?.todayCheckedIn}
          className={`w-full py-3.5 rounded-xl font-semibold text-white transition-opacity ${
            calendar?.todayCheckedIn
              ? "bg-[#D9D9D9] cursor-default"
              : "bg-[#2563EB] active:opacity-80"
          }`}
        >
          {calendar?.todayCheckedIn
            ? t("checkin.checkedToday")
            : checkingIn
              ? "…"
              : t("checkin.doCheckin")}
        </button>

        {/* 日历 */}
        <div className="bg-white rounded-xl p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => changeMonth(-1)}
              className="w-8 h-8 flex items-center justify-center text-[#64748B]"
              aria-label={t("checkin.prevMonth")}
            >
              ‹
            </button>
            <p className="text-sm font-medium text-[#0F172A]">{calendar?.month ?? ""}</p>
            <button
              onClick={() => changeMonth(1)}
              className="w-8 h-8 flex items-center justify-center text-[#64748B]"
              aria-label={t("checkin.nextMonth")}
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {t("checkin.weekdays").split(",").map((w) => (
              <div key={w} className="text-[11px] text-[#94A3B8] py-1">
                {w}
              </div>
            ))}

            {cells.map((day, i) => {
              if (day === null) return <div key={`pad-${i}`} />;
              const dateStr = `${calendar?.month}-${String(day).padStart(2, "0")}`;
              const checked = checkedSet.has(dateStr);
              const isToday = calendar?.today === dateStr;

              return (
                <div
                  key={dateStr}
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs ${
                    checked
                      ? "bg-[#EFF6FF] text-[#2563EB] font-semibold"
                      : isToday
                        ? "border border-[#2563EB] text-[#2563EB]"
                        : "text-[#475569]"
                  }`}
                >
                  {checked ? "✓" : day}
                </div>
              );
            })}
          </div>

          {pending && <p className="text-xs text-[#64748B] text-center mt-2">…</p>}
        </div>

        <p className="text-[11px] text-[#64748B] text-center px-4">{t("checkin.subtitle")}</p>
      </div>
    </div>
  );
}
