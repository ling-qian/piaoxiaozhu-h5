"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, CATEGORY_MAP } from "@/lib/constants";
import { formatAmount, getConfidenceColor, getConfidenceHint } from "@/lib/utils";
import { getRecord, updateRecord, createManualRecord } from "@/lib/actions/record-actions";
import { getProjects } from "@/lib/actions/project-actions";
import { useToast } from "@/components/toast";
import { PageSpinner } from "@/components/spinner";
import PageHeader from "@/components/page-header";

interface ProjectOption {
  id: string;
  name: string;
}

interface RecordData {
  id: string;
  direction: string;
  merchantName: string | null;
  amount: number;
  taxAmount: number | null;
  invoiceDate: string | null;
  invoiceType: string | null;
  categoryCode: string;
  categoryL1: string;
  categoryL2: string | null;
  confidence: number;
  rawText: string | null;
  imageUrl: string | null;
}

// Prisma Decimal → number 转换
function toNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

function ResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") || "";
  const recordId = searchParams.get("recordId") || "";
  const isManual = searchParams.get("manual") === "1";
  const { showToast } = useToast();

  const [activeProjectId, setActiveProjectId] = useState(projectId);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const [direction, setDirection] = useState<"out" | "income">("out");
  const [merchantName, setMerchantName] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [categoryCode, setCategoryCode] = useState("other");
  const [confidence, setConfidence] = useState(1.0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isManual && !!recordId);

  useEffect(() => {
    if (!projectId) {
      getProjects().then((list) => {
        setProjects(list.map((p) => ({ id: p.id, name: p.name })));
        if (list.length > 0 && !activeProjectId) {
          setActiveProjectId(list[0].id);
        }
      });
    }
  }, [projectId, activeProjectId]);

  useEffect(() => {
    if (!isManual && recordId) {
      getRecord(recordId).then((record: RecordData | null) => {
        if (record) {
          setDirection(record.direction as "out" | "income");
          setMerchantName(record.merchantName || "");
          setAmount(toNum(record.amount).toString());
          setTaxAmount(record.taxAmount ? toNum(record.taxAmount).toString() : "");
          setInvoiceDate(record.invoiceDate || "");
          setCategoryCode(record.categoryCode);
          setConfidence(record.confidence);
        }
        setLoading(false);
      });
    }
  }, [recordId, isManual]);

  const cat = CATEGORY_MAP[categoryCode];

  async function handleSave() {
    if (!activeProjectId) {
      showToast("请先选择项目", "error");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      showToast("请输入有效金额", "error");
      return;
    }

    setSaving(true);
    try {
      if (isManual) {
        await createManualRecord(activeProjectId, {
          direction,
          merchantName,
          amount: parseFloat(amount),
          taxAmount: taxAmount ? parseFloat(taxAmount) : undefined,
          invoiceDate: invoiceDate || undefined,
          categoryCode,
          categoryL1: cat?.l1 || "其他",
          categoryL2: cat?.l2,
        });
      } else if (recordId) {
        await updateRecord(recordId, {
          direction,
          merchantName: merchantName || undefined,
          amount: parseFloat(amount),
          taxAmount: taxAmount ? parseFloat(taxAmount) : undefined,
          invoiceDate: invoiceDate || undefined,
          categoryCode,
          categoryL1: cat?.l1 || "其他",
          categoryL2: cat?.l2,
        });
      }
      showToast("保存成功", "success");
      router.push(`/project/${activeProjectId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "保存失败";
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageSpinner text="加载记录" />;
  }

  return (
    <div className="pb-20">
      <PageHeader
        title={isManual ? "手动录入" : "识别结果"}
        showBack
        onBack={() => router.back()}
      />

      <div className="px-4 -mt-4 space-y-4">
        {!projectId && projects.length > 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <label className="block text-sm text-[#666666] mb-1">选择项目</label>
            <select
              value={activeProjectId}
              onChange={(e) => setActiveProjectId(e.target.value)}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm bg-white text-[#333333] focus:border-brand focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {!projectId && projects.length === 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up text-center">
            <p className="text-sm text-[#999999]">暂无项目，请先创建项目</p>
            <button
              onClick={() => router.push("/")}
              className="text-sm text-brand mt-2 btn-press"
            >
              去创建 →
            </button>
          </div>
        )}

        {!isManual && recordId && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#666666]">识别置信度</span>
              <span
                className="text-sm font-medium"
                style={{ color: getConfidenceColor(confidence) }}
              >
                {Math.round(confidence * 100)}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${confidence * 100}%`,
                  backgroundColor: getConfidenceColor(confidence),
                }}
              />
            </div>
            <p className="text-xs text-[#999999] mt-1.5">
              {getConfidenceHint(confidence)}
            </p>
          </div>
        )}

        <div className="bg-white rounded-md p-4 shadow-card space-y-4 animate-fade-in-up stagger-1">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setDirection("out")}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 btn-press ${
                direction === "out"
                  ? "bg-error/10 text-error border border-error/30"
                  : "bg-gray-50 text-[#999999] border border-transparent"
              }`}
            >
              支出
            </button>
            <button
              onClick={() => setDirection("income")}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 btn-press ${
                direction === "income"
                  ? "bg-success/10 text-success border border-success/30"
                  : "bg-gray-50 text-[#999999] border border-transparent"
              }`}
            >
              收入
            </button>
          </div>

          <div>
            <label className="block text-sm text-[#666666] mb-1">商户名称</label>
            <input
              type="text"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              placeholder="请输入商户名称"
            />
          </div>

          <div>
            <label className="block text-sm text-[#666666] mb-1">
              金额 (元)
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm text-[#666666] mb-1">
              税额 (元)
            </label>
            <input
              type="number"
              step="0.01"
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              placeholder="0.00 (可选)"
            />
          </div>

          <div>
            <label className="block text-sm text-[#666666] mb-1">日期</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-[#666666] mb-2">分类</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.code}
                  onClick={() => setCategoryCode(cat.code)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 btn-press ${
                    categoryCode === cat.code
                      ? "text-white scale-105"
                      : "bg-gray-100 text-[#666666]"
                  }`}
                  style={
                    categoryCode === cat.code
                      ? { backgroundColor: cat.color }
                      : undefined
                  }
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-brand text-white py-3 rounded-xl font-medium disabled:opacity-50 btn-press animate-fade-in-up stagger-2"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<PageSpinner text="加载中" />}>
      <ResultContent />
    </Suspense>
  );
}
