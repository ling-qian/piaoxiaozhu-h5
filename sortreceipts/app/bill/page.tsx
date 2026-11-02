"use client";

/**
 * 供应商对账单复核页。
 *
 * 一张账单识别出 N 行，用户逐行改完再整批入账。页面只有两个阶段，
 * 都留在同一页里：拍照识别 → 复核提交。切换页面会把识别结果丢掉，
 * 而重新识别一次要花一次积分。
 *
 * 金额是本页唯一的必填项。品项、分类都可以空着入账，金额空着不行——
 * 后端也会把金额非法的行计进 failed，这里提前拦下来，省一次往返。
 */

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getProjects } from "@/lib/actions/project-actions";
import { createRecordsFromBill, recognizeBill, type BillRecognition } from "@/lib/actions/record-actions";
import { CATEGORIES, CATEGORY_MAP, categoryLabel, resolveCategoryCode } from "@/lib/constants";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import { formatAmount } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n";
import PageHeader from "@/components/page-header";

interface ProjectOption {
  id: string;
  name: string;
}

/** 复核行。金额存字符串，因为用户输入过程中会有 "12." 这种中间态 */
interface ReviewRow {
  key: string;
  description: string;
  amount: string;
  categoryCode: string;
  confidence: number | null;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024;

/** 金额是否可用：空串、非数字、都不是有效输入 */
function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function toRow(lineNo: number, line: BillRecognition["lines"][number]): ReviewRow {
  const code = resolveCategoryCode(line.categoryCode ?? "") ?? "other";
  return {
    key: `line-${lineNo}`,
    description: line.description ?? "",
    amount: formatAmount(line.amount),
    categoryCode: code,
    confidence: line.confidence,
  };
}

function BillContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("project") || "";
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [projectId, setProjectId] = useState(urlProjectId);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const [stage, setStage] = useState<"pick" | "recognizing" | "review">("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [bill, setBill] = useState<BillRecognition | null>(null);

  const [merchant, setMerchant] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [direction, setDirection] = useState<"out" | "income">("out");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!urlProjectId) {
      getProjects().then((list) => {
        setProjects(list.map((p) => ({ id: p.id, name: p.name })));
        setProjectId((current) => current || (list[0]?.id ?? ""));
      });
    }
  }, [urlProjectId]);

  // 预览图用 blob URL，离开页面时释放，否则会一直占着内存
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function handleFile(file: File) {
    if (!projectId) {
      showToast(t("bill.noProject"), "error");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast(t("upload.overSize"), "error");
      return;
    }

    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setStage("recognizing");

    try {
      const result = await recognizeBill(projectId, file);
      setBill(result);
      setMerchant(result.supplierName ?? "");
      setInvoiceDate(result.periodEnd ?? result.periodStart ?? "");
      setRows(result.lines.map((line, i) => toRow(i + 1, line)));
      setStage("review");

      if (result.lines.length === 0) {
        showToast(t("bill.emptyLines"), "error");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("bill.recognizeFailed");
      showToast(message, "error");
      setStage("pick");
    }
  }

  function updateRow(key: string, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}-${prev.length}`,
        description: "",
        amount: "",
        categoryCode: "other",
        confidence: null,
      },
    ]);
  }

  function retake() {
    setBill(null);
    setRows([]);
    setStage("pick");
    // 直接打开选图，少点一次
    inputRef.current?.click();
  }

  const validRows = rows.filter((row) => parseAmount(row.amount) !== null);
  const invalidCount = rows.length - validRows.length;
  const total = validRows.reduce((sum, row) => sum + (parseAmount(row.amount) ?? 0), 0);

  async function handleConfirm() {
    if (!bill || validRows.length === 0) {
      showToast(t("bill.noValidRows"), "error");
      return;
    }

    setSaving(true);
    try {
      const result = await createRecordsFromBill(projectId, {
        fileId: bill.fileId,
        direction,
        merchantName: merchant.trim() || null,
        invoiceDate: invoiceDate || null,
        rawText: bill.rawText,
        lines: validRows.map((row) => {
          const cat = CATEGORY_MAP[row.categoryCode];
          return {
            description: row.description.trim() || null,
            amount: parseAmount(row.amount) ?? 0,
            taxAmount: null,
            invoiceDate: null,
            categoryCode: cat?.code ?? row.categoryCode,
            categoryL1: cat?.l1 ?? null,
            categoryL2: cat?.l2 ?? null,
            confidence: row.confidence,
          };
        }),
      });

      const skipped = invalidCount + result.failed;
      let message: string;
      if (result.created > 0) {
        message = t("bill.created").replace("{n}", String(result.created));
        if (result.duplicates > 0) {
          message += t("bill.duplicates").replace("{n}", String(result.duplicates));
        }
        if (skipped > 0) message += t("bill.failed").replace("{n}", String(skipped));
      } else {
        message = t("bill.allDuplicate");
      }

      showToast(message, result.created > 0 ? "success" : "info");
      router.push(`/project/${projectId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("common.error");
      showToast(message, "error");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32 lg:pb-10">
      <PageHeader
        title={t("bill.title")}
        desktopTitle={t("bill.title")}
        desktopSubtitle={t("bill.subtitle")}
        showBack
        onBack={() => router.back()}
      />

      <div className="px-4 pt-1 space-y-4 lg:mx-auto lg:max-w-3xl lg:px-10 lg:pt-6">
        {stage !== "review" && !urlProjectId && projects.length > 0 && (
          <div className="bg-white rounded-md p-4 shadow-card">
            <label className="text-sm text-[#475569] mb-2 block">{t("bill.chooseProject")}</label>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProjectId(p.id)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    projectId === p.id ? "bg-brand text-white" : "bg-gray-100 text-[#475569] hover:bg-gray-200"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {stage !== "review" && !urlProjectId && projects.length === 0 && (
          <div className="bg-white rounded-md p-4 shadow-card text-center">
            <p className="text-sm text-[#64748B]">{t("upload.noProject")}</p>
            <button onClick={() => router.push("/")} className="text-sm text-brand mt-2 btn-press">
              {t("upload.goCreate")}
            </button>
          </div>
        )}

        {stage === "pick" && (
          <div className="bg-white rounded-md p-4 shadow-card">
            <div
              onClick={() => inputRef.current?.click()}
              className="w-full min-h-[200px] border-2 border-dashed border-[#E2E8F0] rounded-xl flex flex-col items-center justify-center cursor-pointer active:border-brand transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mb-2">
                <path d="M4 4h16v16H4z" />
                <path d="M8 9h8M8 13h8M8 17h5" />
              </svg>
              <p className="text-sm text-[#64748B]">{t("bill.entry")}</p>
              <p className="text-xs text-[#CBD5E1] mt-1">{t("bill.pickHint")}</p>
            </div>
          </div>
        )}

        {stage === "recognizing" && (
          <div className="bg-white rounded-md p-6 shadow-card flex flex-col items-center">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="max-h-52 rounded-lg object-contain mb-4" />
            )}
            <div className="w-8 h-8 border-[3px] border-brand/20 border-t-brand rounded-full animate-spin" />
            <p className="text-sm text-[#475569] mt-3">{t("bill.recognizing")}</p>
          </div>
        )}

        {stage === "review" && bill && (
          <>
            <div className="bg-white rounded-md p-4 shadow-card space-y-3">
              <div className="flex items-start gap-3">
                {preview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="w-16 h-16 rounded-lg object-cover border border-[#E2E8F0]" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#64748B]">{t("bill.rows").replace("{n}", String(rows.length))}</p>
                  <p className="text-sm text-[#0F172A] mt-0.5 truncate">
                    {merchant.trim() || t("bill.supplier")}
                  </p>
                </div>
                <button onClick={retake} className="text-xs text-brand shrink-0 btn-press">
                  {t("bill.retake")}
                </button>
              </div>

              {(!bill.isBill || bill.warning) && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2">
                  <p className="text-xs text-[#B45309] leading-relaxed">
                    {bill.warning || t("bill.notBill")}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm text-[#475569] mb-1">{t("bill.supplier")}</label>
                <input
                  type="text"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                  autoComplete="off"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm text-[#475569] mb-1">{t("bill.date")}</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-[#475569] mb-1">{t("bill.direction")}</label>
                  <div className="flex gap-1.5">
                    <DirectionButton
                      label={t("common.expense")}
                      active={direction === "out"}
                      tone="out"
                      onClick={() => setDirection("out")}
                    />
                    <DirectionButton
                      label={t("common.income")}
                      active={direction === "income"}
                      tone="income"
                      onClick={() => setDirection("income")}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-md p-4 shadow-card space-y-3">
              {rows.length === 0 && (
                <p className="text-sm text-[#64748B] text-center py-4">{t("bill.emptyLines")}</p>
              )}

              {rows.map((row, index) => {
                const invalid = parseAmount(row.amount) === null;
                return (
                  <div key={row.key} className="border border-[#E2E8F0] rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-brand-bg text-brand text-xs flex items-center justify-center">
                        {index + 1}
                      </span>
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateRow(row.key, { description: e.target.value })}
                        className="flex-1 min-w-0 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                        placeholder={t("bill.description")}
                      />
                      <button
                        onClick={() => removeRow(row.key)}
                        aria-label={t("bill.deleteRow")}
                        className="w-7 h-7 shrink-0 rounded-full bg-gray-100 text-[#64748B] text-xs flex items-center justify-center active:bg-gray-200"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative w-32 shrink-0">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] text-xs">
                          {CURRENCY_SYMBOL}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={row.amount}
                          onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                          className={`w-full border rounded-lg pl-7 pr-2 py-2 text-sm text-right focus:outline-none ${
                            invalid ? "border-error/60 focus:border-error" : "border-[#E2E8F0] focus:border-brand"
                          }`}
                          placeholder="0.00"
                        />
                      </div>
                      <select
                        value={row.categoryCode}
                        onChange={(e) => updateRow(row.key, { categoryCode: e.target.value })}
                        className="flex-1 min-w-0 border border-[#E2E8F0] rounded-lg px-2 py-2 text-sm text-[#475569] focus:border-brand focus:outline-none bg-white"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat.code} value={cat.code}>
                            {categoryLabel(cat.code, t)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}

              <button onClick={addRow} className="w-full border border-dashed border-[#E2E8F0] rounded-lg py-2.5 text-sm text-[#64748B] active:border-brand active:text-brand">
                + {t("upload.add")}
              </button>

              {invalidCount > 0 && (
                <p className="text-xs text-error">{t("bill.invalidRows").replace("{n}", String(invalidCount))}</p>
              )}
            </div>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="hidden"
        />

        <div className="bg-brand-bg rounded-md p-4">
          <p className="text-xs text-[#475569] leading-relaxed">{t("bill.entryDesc")}</p>
        </div>
      </div>

      {stage === "review" && bill && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] p-4 z-40 lg:left-[260px] lg:px-10" style={{ paddingBottom: "calc(16px + var(--safe-bottom))" }}>
          <div className="lg:mx-auto lg:max-w-3xl flex items-center gap-3">
            <div className="shrink-0">
              <p className="text-xs text-[#64748B]">{t("bill.total")}</p>
              <p className="text-base font-semibold text-[#0F172A]">
                {CURRENCY_SYMBOL}
                {formatAmount(total)}
              </p>
            </div>
            <button
              onClick={handleConfirm}
              disabled={saving || validRows.length === 0}
              className="flex-1 bg-brand text-white py-3 rounded-xl font-medium disabled:opacity-50 btn-press"
            >
              {saving
                ? t("bill.confirming")
                : `${t("bill.confirm")} · ${validRows.length}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DirectionButton({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: "out" | "income";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200 btn-press ${
        active
          ? tone === "out"
            ? "bg-error/10 text-error border border-error/30"
            : "bg-success/10 text-success border border-success/30"
          : "bg-gray-50 text-[#64748B] border border-transparent"
      }`}
    >
      {label}
    </button>
  );
}

export default function BillPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-[3px] border-brand/20 border-t-brand rounded-full animate-spin" />
        </div>
      }
    >
      <BillContent />
    </Suspense>
  );
}
