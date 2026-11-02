"use client";

/**
 * 月度交付包的展示。
 *
 * 同一份组件供两个页面用：`/pack` 是用户自己的，带月份切换与操作；
 * `/share/[token]` 是发给会计的只读页，只有打印。
 *
 * 所有数字都来自后端算好的 payload，这里不做任何二次汇总——
 * 页面和分享页必须显示同一组数字，前端重算一次就有可能对不上。
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import PageHeader from "@/components/page-header";
import { useToast } from "@/components/toast";
import { categoryLabel } from "@/lib/constants";
import { formatMoney } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import {
  createPackShare,
  getPackCsv,
  type PackException,
  type PackResult,
  type PackShare,
} from "@/lib/actions/pack-actions";

interface PackViewProps {
  /** 只读页没有项目 id，也不能切月份或分享 */
  projectId?: string;
  pack: PackResult;
  /** 只读页显示项目名；用户自己的页面用标题代替 */
  projectName?: string;
  readOnly?: boolean;
}

export default function PackView({ projectId, pack, projectName, readOnly = false }: PackViewProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { showToast } = useToast();

  const [share, setShare] = useState<PackShare | null>(pack.share);
  const [csvBusy, setCsvBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  // 分享地址由浏览器补全：服务端不知道用户访问的是哪个域名
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function handleCsv() {
    if (!projectId) return;
    setCsvBusy(true);
    try {
      const csv = await getPackCsv(projectId, pack.month);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pack-${pack.month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast(t("pack.csvFailed"), "error");
    } finally {
      setCsvBusy(false);
    }
  }

  async function handleShare() {
    if (!projectId) return;
    setShareBusy(true);
    try {
      const result = await createPackShare(projectId, pack.month);
      setShare(result);
      showToast(t("pack.shareCreated"), "success");
    } catch {
      showToast(t("pack.shareFailed"), "error");
    } finally {
      setShareBusy(false);
    }
  }

  async function handleCopy() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(`${origin}${share.path}`);
      showToast(t("pack.copied"), "success");
    } catch {
      showToast(t("pack.copyFailed"), "error");
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 print:bg-white print:pb-0">
      {readOnly ? (
        <div className="px-4 pt-6 lg:mx-auto lg:max-w-3xl lg:px-10 print:px-0 print:pt-0">
          <p className="text-xs text-[#64748B]">{t("pack.readOnly")}</p>
        </div>
      ) : (
        <PageHeader
          title={t("pack.title")}
          desktopTitle={t("pack.title")}
          desktopSubtitle={t("pack.subtitle")}
          showBack
          onBack={() => router.back()}
        />
      )}

      <div className="px-4 pt-4 space-y-4 lg:mx-auto lg:max-w-3xl lg:px-10 lg:pt-6 print:max-w-none print:px-0">
        {/* 操作栏：打印时整块去掉 */}
        {!readOnly && (
          <div className="bg-white rounded-md p-4 shadow-card space-y-3 print:hidden">
            <div className="flex items-center gap-3">
              <label className="text-sm text-[#475569] shrink-0">{t("pack.month")}</label>
              <input
                type="month"
                value={pack.month}
                onChange={(e) => {
                  const next = e.target.value;
                  if (!/^\d{4}-\d{2}$/.test(next)) return;
                  router.push(`/pack?project=${projectId}&month=${next}`);
                }}
                className="flex-1 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCsv}
                disabled={csvBusy}
                className="flex-1 bg-white border border-[#E2E8F0] text-[#475569] py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 btn-press"
              >
                {csvBusy ? t("pack.downloading") : t("pack.downloadCsv")}
              </button>
              <button
                onClick={handleShare}
                disabled={shareBusy}
                className="flex-1 bg-white border border-[#E2E8F0] text-brand py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 btn-press"
              >
                {shareBusy ? t("pack.sharing") : t("pack.createShare")}
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-medium btn-press"
              >
                {t("pack.print")}
              </button>
            </div>

            {share && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={`${origin}${share.path}`}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs text-[#475569] bg-[#F8FAFC]"
                  />
                  <button onClick={handleCopy} className="shrink-0 text-xs text-brand px-2 py-2 btn-press">
                    {t("pack.copy")}
                  </button>
                </div>
                <p className="text-xs text-[#64748B] leading-relaxed">{t("pack.shareHint")}</p>
              </div>
            )}
          </div>
        )}

        {/* 汇总 */}
        <div className="bg-white rounded-md p-4 shadow-card print:shadow-none print:border print:border-[#E2E8F0]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#0F172A]">
                {projectName ?? pack.project_name ?? t("pack.title")}
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                {pack.month} · {t("pack.generatedAt")} {pack.generated_at.slice(0, 10)}
              </p>
            </div>
            <span className="text-xs text-[#94A3B8]">{pack.summary.record_count} {t("pack.recordsUnit")}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4 lg:grid-cols-4">
            <Stat label={t("pack.income")} value={formatMoney(pack.summary.income)} tone="income" />
            <Stat label={t("pack.expense")} value={formatMoney(pack.summary.expense)} tone="expense" />
            <Stat label={t("pack.net")} value={formatMoney(pack.summary.net)} tone="net" />
            <Stat label={t("pack.taxTotal")} value={formatMoney(pack.summary.tax_total)} tone="muted" />
          </div>
        </div>

        {/* 分类小计 */}
        <div className="bg-white rounded-md shadow-card overflow-hidden print:shadow-none print:border print:border-[#E2E8F0]">
          <h3 className="text-sm font-medium text-[#0F172A] px-4 pt-4">{t("pack.categoryTitle")}</h3>
          {pack.categories.length === 0 ? (
            <p className="text-sm text-[#64748B] px-4 py-4">{t("pack.categoryEmpty")}</p>
          ) : (
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-xs text-[#64748B]">
                  <th className="text-left font-normal py-2 pl-4">{t("pack.category")}</th>
                  <th className="text-right font-normal py-2">{t("pack.records")}</th>
                  <th className="text-right font-normal py-2">{t("pack.amount")}</th>
                  <th className="text-right font-normal py-2 pr-4">{t("pack.share")}</th>
                </tr>
              </thead>
              <tbody>
                {pack.categories.map((cat) => (
                  <tr key={cat.name} className="border-b border-[#F1F5F9] last:border-0">
                    <td className="py-2 pl-4 text-[#0F172A]">{categoryLabel(cat.name, t)}</td>
                    <td className="py-2 text-right text-[#475569]">{cat.count}</td>
                    <td className="py-2 text-right text-[#0F172A]">{formatMoney(cat.amount)}</td>
                    <td className="py-2 pr-4 text-right text-[#64748B]">{cat.share}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 异常清单 */}
        <div className="bg-white rounded-md p-4 shadow-card print:shadow-none print:border print:border-[#E2E8F0]">
          <h3 className="text-sm font-medium text-[#0F172A]">{t("pack.exceptionTitle")}</h3>
          {pack.exceptions.length === 0 ? (
            <p className="text-sm text-[#64748B] mt-3">{t("pack.exceptionEmpty")}</p>
          ) : (
            <div className="space-y-3 mt-3">
              {pack.exceptions.map((exception, index) => (
                <ExceptionCard key={`${exception.code}-${index}`} exception={exception} />
              ))}
            </div>
          )}
        </div>

        {/* 只读页的转化入口：打开分享链接的人多半是会计或另一家店 */}
        {readOnly && (
          <div className="bg-white rounded-md p-4 shadow-card print:hidden text-center">
            <p className="text-sm font-medium text-[#0F172A]">{t("pack.ctaTitle")}</p>
            <p className="text-xs text-[#64748B] mt-1 leading-relaxed">{t("pack.ctaText")}</p>
            <a
              href="/auth/register"
              className="mt-3 inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white btn-press"
            >
              {t("pack.ctaButton")}
            </a>
          </div>
        )}
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
  tone: "income" | "expense" | "net" | "muted";
}) {
  const color =
    tone === "income"
      ? "text-[#059669]"
      : tone === "expense"
        ? "text-[#DC2626]"
        : tone === "net"
          ? "text-brand"
          : "text-[#475569]";
  return (
    <div className="rounded-lg bg-[#F8FAFC] px-3 py-2.5 print:bg-white">
      <p className="text-xs text-[#64748B]">{label}</p>
      <p className={`text-base font-semibold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

/** 异常条目的文案在这里拼：后端只给结构化字段，措辞跟着界面语言走 */
function exceptionText(exception: PackException, t: (key: string) => string): string {
  switch (exception.code) {
    case "duplicate_invoice_no":
      return t("pack.dupDetail")
        .replace("{no}", exception.label ?? "")
        .replace("{n}", String(exception.count))
        .replace("{amount}", formatMoney(exception.amount));
    case "missing_invoice":
      return t("pack.missingInvoiceDetail")
        .replace("{n}", String(exception.count))
        .replace("{amount}", formatMoney(exception.amount));
    case "amount_outlier":
      return t("pack.outlierDetail")
        .replace("{amount}", formatMoney(exception.amount))
        .replace("{ratio}", exception.ratio.toFixed(1));
    case "missing_date":
      return t("pack.missingDateDetail")
        .replace("{n}", String(exception.count))
        .replace("{amount}", formatMoney(exception.amount));
  }
}

function exceptionTitle(exception: PackException, t: (key: string) => string): string {
  switch (exception.code) {
    case "duplicate_invoice_no":
      return t("pack.dupTitle").replace("{n}", String(exception.count));
    case "missing_invoice":
      return t("pack.missingInvoiceTitle").replace("{n}", String(exception.count));
    case "amount_outlier":
      return t("pack.outlierTitle").replace("{cat}", categoryLabel(exception.label ?? "", t));
    case "missing_date":
      return t("pack.missingDateTitle").replace("{n}", String(exception.count));
  }
}

function ExceptionCard({ exception }: { exception: PackException }) {
  const { t } = useI18n();
  const tone =
    exception.severity === "high"
      ? { dot: "bg-error", text: "text-[#B91C1C]", label: t("pack.high") }
      : exception.severity === "medium"
        ? { dot: "bg-warning", text: "text-[#B45309]", label: t("pack.medium") }
        : { dot: "bg-[#94A3B8]", text: "text-[#475569]", label: t("pack.low") };

  return (
    <div className="border border-[#E2E8F0] rounded-lg p-3">
      <div className="flex items-start gap-2">
        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${tone.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-[#0F172A]">{exceptionTitle(exception, t)}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded bg-[#F8FAFC] ${tone.text}`}>{tone.label}</span>
          </div>
          <p className="text-xs text-[#475569] mt-1 leading-relaxed">{exceptionText(exception, t)}</p>

          {exception.records.length > 0 && (
            <div className="mt-2 space-y-1">
              {exception.records.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs text-[#64748B]">
                  <span className="w-20 shrink-0">{r.date || "—"}</span>
                  <span className="flex-1 min-w-0 truncate">{r.merchant || t("pack.noMerchant")}</span>
                  <span className="shrink-0">{formatMoney(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
