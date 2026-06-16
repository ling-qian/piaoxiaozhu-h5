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
  amountWithoutTax: number | null;
  taxRate: number | null;
  invoiceDate: string | null;
  invoiceType: string | null;
  invoiceNo: string | null;
  invoiceCode: string | null;
  checkCode: string | null;
  buyerName: string | null;
  buyerTaxNo: string | null;
  sellerTaxNo: string | null;
  items: string | null;
  categoryCode: string;
  categoryL1: string;
  categoryL2: string | null;
  confidence: number;
  rawText: string | null;
  imageUrl: string | null;
}

function toNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

const INVOICE_TYPE_LABELS: Record<string, string> = {
  vat_special: "增值税专用发票",
  vat_normal: "增值税普通发票",
  vat_special_electronic: "增值税专用发票(数电)",
  vat_normal_electronic: "增值税普通发票(数电)",
  electronic: "电子发票",
  machine_printed: "机打发票",
  receipt: "收据/小票",
};

const INVOICE_TYPE_COLORS: Record<string, string> = {
  vat_special: "bg-red-100 text-red-700",
  vat_normal: "bg-blue-100 text-blue-700",
  vat_special_electronic: "bg-purple-100 text-purple-700",
  vat_normal_electronic: "bg-indigo-100 text-indigo-700",
  electronic: "bg-green-100 text-green-700",
  machine_printed: "bg-yellow-100 text-yellow-700",
  receipt: "bg-gray-100 text-gray-600",
};

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

  // 发票类型深度适配字段
  const [invoiceType, setInvoiceType] = useState<string | null>(null);
  const [invoiceNo, setInvoiceNo] = useState<string | null>(null);
  const [invoiceCode, setInvoiceCode] = useState<string | null>(null);
  const [checkCode, setCheckCode] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState<string | null>(null);
  const [buyerTaxNo, setBuyerTaxNo] = useState<string | null>(null);
  const [sellerTaxNo, setSellerTaxNo] = useState<string | null>(null);
  const [taxRate, setTaxRate] = useState<number | null>(null);
  const [amountWithoutTax, setAmountWithoutTax] = useState<number | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<string | null>(null);

  // MED-6: 原图和OCR原文
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [showOriginalImage, setShowOriginalImage] = useState(false);
  const [showRawText, setShowRawText] = useState(false);

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
          setImageUrl(record.imageUrl);
          setRawText(record.rawText);
          // 发票类型深度适配字段
          setInvoiceType(record.invoiceType);
          setInvoiceNo(record.invoiceNo);
          setInvoiceCode(record.invoiceCode);
          setCheckCode(record.checkCode);
          setBuyerName(record.buyerName);
          setBuyerTaxNo(record.buyerTaxNo);
          setSellerTaxNo(record.sellerTaxNo);
          setTaxRate(record.taxRate);
          setAmountWithoutTax(record.amountWithoutTax ? toNum(record.amountWithoutTax) : null);
          setInvoiceItems(record.items);
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
    <div className="pb-24">
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

        {/* 原始票据图片 */}
        {imageUrl && (
          <div className="bg-white rounded-md shadow-card animate-fade-in-up overflow-hidden">
            <button
              onClick={() => setShowOriginalImage(!showOriginalImage)}
              className="w-full flex items-center justify-between p-4"
            >
              <span className="text-sm text-[#666666]">原始票据</span>
              <span className="text-xs text-brand">
                {showOriginalImage ? "收起 ▲" : "查看 ▼"}
              </span>
            </button>
            {showOriginalImage && (
              <div className="px-4 pb-4">
                <img
                  src={imageUrl}
                  alt="原始票据"
                  className="w-full rounded-lg border border-[#EEEEEE]"
                />
              </div>
            )}
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

            {/* OCR 原文查看 */}
            {rawText && (
              <div className="mt-3 pt-3 border-t border-[#EEEEEE]">
                <button
                  onClick={() => setShowRawText(!showRawText)}
                  className="flex items-center justify-between w-full"
                >
                  <span className="text-xs text-[#999999]">OCR 识别原文</span>
                  <span className="text-xs text-brand">
                    {showRawText ? "收起 ▲" : "查看 ▼"}
                  </span>
                </button>
                {showRawText && (
                  <pre className="mt-2 text-xs text-[#666666] bg-gray-50 rounded-lg p-3 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {rawText}
                  </pre>
                )}
              </div>
            )}
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
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm text-[#666666] mb-1">
              金额 (元)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
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
              min="0"
              inputMode="decimal"
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

        {/* 发票类型深度适配 - 发票详情卡片 */}
        {invoiceType && !isManual && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up stagger-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-[#333333]">发票详情</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INVOICE_TYPE_COLORS[invoiceType] || "bg-gray-100 text-gray-600"}`}>
                {INVOICE_TYPE_LABELS[invoiceType] || invoiceType}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              {invoiceNo && (
                <div className="flex justify-between">
                  <span className="text-[#999999]">发票号码</span>
                  <span className="text-[#333333] font-mono">{invoiceNo}</span>
                </div>
              )}
              {invoiceCode && (
                <div className="flex justify-between">
                  <span className="text-[#999999]">发票代码</span>
                  <span className="text-[#333333] font-mono">{invoiceCode}</span>
                </div>
              )}
              {checkCode && (
                <div className="flex justify-between">
                  <span className="text-[#999999]">校验码</span>
                  <span className="text-[#333333] font-mono">{checkCode}</span>
                </div>
              )}
              {taxRate !== null && (
                <div className="flex justify-between">
                  <span className="text-[#999999]">税率</span>
                  <span className="text-[#333333]">{(taxRate * 100).toFixed(taxRate * 100 % 1 === 0 ? 0 : 1)}%</span>
                </div>
              )}
              {amountWithoutTax !== null && (
                <div className="flex justify-between">
                  <span className="text-[#999999]">不含税金额</span>
                  <span className="text-[#333333]">¥{amountWithoutTax.toFixed(2)}</span>
                </div>
              )}
              {buyerName && (
                <div className="flex justify-between">
                  <span className="text-[#999999]">购买方</span>
                  <span className="text-[#333333] text-right max-w-[60%] truncate">{buyerName}</span>
                </div>
              )}
              {buyerTaxNo && (
                <div className="flex justify-between">
                  <span className="text-[#999999]">购买方税号</span>
                  <span className="text-[#333333] font-mono text-xs">{buyerTaxNo}</span>
                </div>
              )}
              {sellerTaxNo && (
                <div className="flex justify-between">
                  <span className="text-[#999999]">销售方税号</span>
                  <span className="text-[#333333] font-mono text-xs">{sellerTaxNo}</span>
                </div>
              )}
            </div>

            {/* 商品明细 */}
            {invoiceItems && (() => {
              try {
                const items = JSON.parse(invoiceItems);
                if (!Array.isArray(items) || items.length === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-[#EEEEEE]">
                    <span className="text-xs text-[#999999] mb-2 block">商品明细</span>
                    <div className="space-y-1.5">
                      {items.map((item: { name: string; quantity: number; amount: number; taxRate: number }, idx: number) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-[#333333] truncate max-w-[50%]">{item.name}</span>
                          <span className="text-[#666666]">×{item.quantity} ¥{item.amount.toFixed(2)} {(item.taxRate * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}
          </div>
        )}

        {/* 固定底部保存按钮 */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#EEEEEE] p-4 z-40" style={{ paddingBottom: "calc(16px + var(--safe-bottom))" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-brand text-white py-3 rounded-xl font-medium disabled:opacity-50 btn-press"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
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
