"use client";

import { useState } from "react";
import Link from "next/link";

import PageHeader from "@/components/page-header";
import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n";
import { createManualRecord } from "@/lib/actions/record-actions";
import { parseTextEntry, type ParsedEntry } from "@/lib/actions/insights-actions";

/** 解析结果允许用户改，所以要分开存草稿字段 */
interface Draft {
  direction: "out" | "income";
  amount: string;
  merchant: string;
  date: string;
  categoryL1: string;
}

function toDraft(p: ParsedEntry): Draft {
  return {
    direction: p.direction,
    amount: p.amount === null ? "" : String(p.amount),
    merchant: p.merchant || "",
    date: p.date || "",
    categoryL1: p.categoryL1 || "其他",
  };
}

export default function QuickEntryClient({
  projectId,
  projectName,
}: {
  projectId: string | null;
  projectName: string | null;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();

  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<ParsedEntry | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  async function handleParse() {
    if (!text.trim() || parsing) return;
    setParsing(true);
    try {
      const p = await parseTextEntry(text);
      setParsed(p);
      setDraft(toDraft(p));
      if (!p.ok) {
        showToast(t("quickEntry.needMore"), "info");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("ask.failed"), "error");
      setParsed(null);
      setDraft(null);
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!projectId || !draft || saving) return;

    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast(t("quickEntry.badAmount"), "error");
      return;
    }

    setSaving(true);
    try {
      await createManualRecord(projectId, {
        direction: draft.direction,
        merchantName: draft.merchant || t("quickEntry.unnamed"),
        amount,
        invoiceDate: draft.date || undefined,
        // 分类代码按一级分类名直接传。后端会自己映射到 code，
        // 这里传名字比在前端维护一张映射表更不容易出错。
        categoryCode: draft.categoryL1,
        categoryL1: draft.categoryL1,
      });
      showToast(t("quickEntry.saved"), "success");
      setText("");
      setParsed(null);
      setDraft(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("quickEntry.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  }

  // 没有项目时先引导创建，否则记账会挂不上去
  if (!projectId) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <PageHeader title={t("quickEntry.title")} showBack />
        <div className="px-4 pt-10 text-center lg:mx-auto lg:max-w-3xl">
          <p className="text-sm text-[#64748B] mb-4">{t("quickEntry.noProject")}</p>
          <Link
            href="/"
            className="inline-block px-6 py-2.5 rounded-xl bg-[#2563EB] text-white text-sm font-medium"
          >
            {t("quickEntry.backHome")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-16 min-h-screen bg-[#F8FAFC] lg:pb-10">
      <PageHeader title={t("quickEntry.title")} showBack />

      <div className="px-4 pt-1 space-y-3 lg:mx-auto lg:max-w-3xl lg:space-y-4 lg:px-10 lg:pt-6">
        <p className="text-sm text-[#475569]">{t("quickEntry.subtitle")}</p>
        <p className="text-[11px] text-[#64748B]">{t("quickEntry.projectLabel")} {projectName}</p>

        {/* 输入 */}
        <div className="bg-white rounded-xl p-4 shadow-card">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={t("quickEntry.placeholder")}
            className="w-full resize-none rounded-lg bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none"
          />
          <button
            onClick={handleParse}
            disabled={parsing || !text.trim()}
            className={`w-full mt-3 py-2.5 rounded-lg text-sm font-medium text-white ${
              parsing || !text.trim() ? "bg-[#D9D9D9]" : "bg-[#2563EB] active:opacity-80"
            }`}
          >
            {parsing ? t("quickEntry.parsing") : t("quickEntry.parse")}
          </button>
        </div>

        {/* 解析出的草稿，可改 */}
        {draft && parsed && (
          <div className="bg-white rounded-xl p-4 shadow-card space-y-3">
            {parsed.missing.length > 0 && (
              <p className="text-xs text-[#D97706]">
                {t("quickEntry.missing")}：{parsed.missing.join("、")}
              </p>
            )}

            <div className="flex gap-2">
              {(["out", "income"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDraft({ ...draft, direction: d })}
                  className={`flex-1 py-2 rounded-lg text-sm ${
                    draft.direction === d
                      ? "bg-[#2563EB] text-white"
                      : "bg-[#F8FAFC] text-[#475569]"
                  }`}
                >
                  {d === "out" ? t("common.expense") : t("common.income")}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="text-xs text-[#64748B]">{t("quickEntry.amount")}</span>
              <input
                type="number"
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                className="w-full mt-1 rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs text-[#64748B]">{t("quickEntry.merchant")}</span>
              <input
                value={draft.merchant}
                onChange={(e) => setDraft({ ...draft, merchant: e.target.value })}
                className="w-full mt-1 rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs text-[#64748B]">{t("quickEntry.date")}</span>
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                className="w-full mt-1 rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs text-[#64748B]">{t("quickEntry.category")}</span>
              <input
                value={draft.categoryL1}
                onChange={(e) => setDraft({ ...draft, categoryL1: e.target.value })}
                className="w-full mt-1 rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm outline-none"
              />
            </label>

            <button
              onClick={handleSave}
              disabled={saving}
              className={`w-full py-2.5 rounded-lg text-sm font-medium text-white ${
                saving ? "bg-[#D9D9D9]" : "bg-[#059669] active:opacity-80"
              }`}
            >
              {saving ? t("quickEntry.saving") : t("quickEntry.confirm")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
