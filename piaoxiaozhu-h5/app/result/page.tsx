"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { extractFields } from "@/lib/extract-fields";
import { categorize } from "@/lib/categorize";
import { CATEGORIES, CATEGORY_MAP } from "@/lib/constants";
import { formatAmount, getConfidenceColor, getConfidenceHint } from "@/lib/utils";
import { createRecordFromOcr, createManualRecord } from "@/lib/actions/record-actions";
import PageHeader from "@/components/page-header";
import CategoryTag from "@/components/category-tag";

function ResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") || "";
  const rawText = searchParams.get("rawText") || "";
  const ocrConfidence = parseFloat(searchParams.get("confidence") || "0.5");
  const isManual = searchParams.get("manual") === "1";

  const [direction, setDirection] = useState<"out" | "income">("out");
  const [merchantName, setMerchantName] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [categoryCode, setCategoryCode] = useState("other");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isManual && rawText) {
      const fields = extractFields(rawText);
      const cat = categorize(fields.merchantName, rawText);

      if (fields.merchantName) setMerchantName(fields.merchantName);
      if (fields.totalAmount) setAmount(fields.totalAmount.toString());
      if (fields.taxAmount) setTaxAmount(fields.taxAmount.toString());
      if (fields.invoiceDate) setInvoiceDate(fields.invoiceDate);
      setCategoryCode(cat.categoryCode);
    }
  }, [rawText, isManual]);

  const cat = CATEGORY_MAP[categoryCode];

  async function handleSave() {
    if (!projectId) {
      alert("请先选择项目");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      alert("请输入金额");
      return;
    }

    setSaving(true);
    try {
      if (isManual) {
        await createManualRecord(projectId, {
          direction,
          merchantName,
          amount: parseFloat(amount),
          taxAmount: taxAmount ? parseFloat(taxAmount) : undefined,
          invoiceDate: invoiceDate || undefined,
          categoryCode,
          categoryL1: cat?.l1 || "其他",
          categoryL2: cat?.l2,
        });
      } else {
        await createRecordFromOcr(projectId, decodeURIComponent(rawText), null);
      }
      router.push(`/project/${projectId}`);
    } catch (err: any) {
      alert(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-20">
      <PageHeader
        title={isManual ? "手动录入" : "识别结果"}
        showBack
        onBack={() => router.back()}
      />

      <div className="px-4 -mt-4 space-y-4">
        {!isManual && rawText && (
          <div className="bg-white rounded-md p-4 shadow-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#666666]">识别置信度</span>
              <span
                className="text-sm font-medium"
                style={{ color: getConfidenceColor(ocrConfidence) }}
              >
                {Math.round(ocrConfidence * 100)}%
              </span>
            </div>
            <p className="text-xs text-[#999999]">
              {getConfidenceHint(ocrConfidence)}
            </p>
          </div>
        )}

        <div className="bg-white rounded-md p-4 shadow-card space-y-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setDirection("out")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                direction === "out"
                  ? "bg-error/10 text-error border border-error/30"
                  : "bg-gray-50 text-[#999999] border border-transparent"
              }`}
            >
              支出
            </button>
            <button
              onClick={() => setDirection("income")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${
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
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    categoryCode === cat.code
                      ? "text-white"
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
          className="w-full bg-brand text-white py-3 rounded-xl font-medium disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center text-[#999999]">加载中...</div>}>
      <ResultContent />
    </Suspense>
  );
}
