"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import PageHeader from "@/components/page-header";
import { useI18n } from "@/lib/i18n";
import type { PointPackage, PointsLog, PointsSummary } from "@/lib/actions/points-actions";
import { formatPrice } from "@/lib/currency";
import { SHOW_CHECKIN } from "@/lib/region";

/** 流水 action 对应的文案 key。不认识的一律显示「积分变动」，避免露出后端代号 */
const ACTION_KEYS: Record<string, string> = {
  signup_bonus: "points.act.signup",
  daily_checkin: "points.act.checkin",
  purchase_grant: "points.act.purchase",
  consume_invoice_ocr: "points.act.ocr",
  consume_ai_analysis: "points.act.analysis",
  ai_ask: "points.act.ask",
};

/**
 * 系统自动产生的流水。
 *
 * 这些条目的 reason 由后端写成中文（「新用户注册赠送」「每日签到」），
 * 内容和上面那行动作名重复。英文界面下重复一遍中文只会让人困惑，
 * 所以这类条目第二行显示时间。
 *
 * 购买与问账的 reason 里带着订单号、问题摘要，有实际信息，保留原样。
 */
const SYSTEM_ACTIONS = new Set(["signup_bonus", "daily_checkin"]);

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/**
 * 只在客户端渲染的时间。
 *
 * 时间按用户本地时区显示，而服务端跑在 Cloudflare 节点上、用的是 UTC，
 * 同一个时间戳两边算出来的文字必然不同（`02:47` 与 `10:47`）。
 * 直接渲染会让 React 判定水合不匹配并报 #418，整棵子树被丢弃重渲染。
 *
 * 首帧渲染空字符串，挂载后再填入：服务端产物和客户端首帧因此完全一致。
 * 代价是时间有一瞬空白，比整页重渲染便宜得多。
 */
function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => setText(formatTime(iso)), [iso]);
  return <>{text}</>;
}


export default function PointsClient({
  summary,
  logs,
  total,
  packages,
}: {
  summary: PointsSummary | null;
  logs: PointsLog[];
  total: number;
  packages: PointPackage[];
}) {
  const { t } = useI18n();

  return (
    <div className="pb-16 min-h-screen bg-[#F8FAFC] lg:pb-10">
      <PageHeader title={t("points.title")} showBack />

      <div className="px-4 pt-1 space-y-3 lg:mx-auto lg:max-w-3xl lg:space-y-4 lg:px-10 lg:pt-6">
        {/* 余额 */}
        <div className="bg-white rounded-xl p-4 shadow-card">
          <p className="text-xs text-[#64748B] mb-1">{t("points.balance")}</p>
          <p className="text-3xl font-bold text-[#2563EB]">{summary?.balance ?? 0}</p>

          <div className="flex gap-2 mt-4">
            {SHOW_CHECKIN && (
                <Link
                  href="/checkin"
                  className="flex-1 py-2 rounded-lg bg-[#EFF6FF] text-[#2563EB] text-sm font-medium text-center"
                >
                  {t("checkin.title")}
                </Link>
            )}
            <Link
              href="/member"
              className="flex-1 py-2 rounded-lg bg-[#F8FAFC] text-[#475569] text-sm font-medium text-center"
            >
              {t("member.title")}
            </Link>
          </div>
        </div>

        {/* 消耗标准 */}
        {summary && (
          <div className="bg-white rounded-xl p-4 shadow-card">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-[#475569]">{t("points.costOcr")}</span>
              <span className="text-sm font-medium text-[#0F172A]">
                {summary.costs.invoiceOcr} {t("points.unit")}
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-[#475569]">{t("points.costAnalysis")}</span>
              <span className="text-sm font-medium text-[#0F172A]">
                {summary.costs.aiAnalysis} {t("points.unit")}
              </span>
            </div>
          </div>
        )}

        {/* 积分包 */}
        {packages.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-card">
            <p className="text-sm font-medium text-[#0F172A] mb-2">{t("points.packages")}</p>
            <div className="space-y-2">
              {packages.map((p) => (
                <div key={p.code} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-[#475569]">{p.name}</span>
                  <span className="text-sm font-semibold text-[#2563EB]">
                    {formatPrice(p.priceCny, p.priceUsd)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[#64748B] mt-2">{t("points.packagesHint")}</p>
          </div>
        )}

        {/* 流水 */}
        <div className="bg-white rounded-xl shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0F0F0]">
            <p className="text-sm font-medium text-[#0F172A]">{t("points.history")}</p>
            {total > 0 && (
              <span className="text-xs text-[#64748B]">
                {(total === 1 ? t("points.oneRecord") : t("points.totalCount")).replace("{n}", String(total))}
              </span>
            )}
          </div>

          {logs.length === 0 ? (
            <p className="text-center text-sm text-[#64748B] py-10">{t("points.empty")}</p>
          ) : (
            <ul className="divide-y divide-[#F8FAFC]">
              {logs.map((log) => {
                const positive = log.delta > 0;
                // delta 为 0 的记录是「免费问账」的计数标记，不是真的零变动。
                // 显示成「+0」会让人困惑，直接归到不显示数值的那类。
                const isMarker = log.delta === 0;

                return (
                  <li key={log.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-[#0F172A] truncate">
                        {t(ACTION_KEYS[log.action] ?? "points.act.other")}
                      </p>
                      {/* 时间按用户本地时区显示，服务端（UTC）算出来的必然不同。
                          这类差异用 suppressHydrationWarning 放过，保留客户端结果。 */}
                      <p className="text-[11px] text-[#64748B] mt-0.5 truncate">
                        {SYSTEM_ACTIONS.has(log.action) || !log.reason ? (
                          <LocalTime iso={log.createdAt} />
                        ) : (
                          log.reason
                        )}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-semibold ml-3 shrink-0 ${
                        isMarker
                          ? "text-[#94A3B8]"
                          : positive
                            ? "text-[#059669]"
                            : "text-[#0F172A]"
                      }`}
                    >
                      {isMarker ? "—" : `${positive ? "+" : ""}${log.delta}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
