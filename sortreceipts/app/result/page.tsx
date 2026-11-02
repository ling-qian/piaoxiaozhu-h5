"use client";

import { useI18n } from "@/lib/i18n";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, CATEGORY_MAP, categoryLabel, resolveCategoryCode } from "@/lib/constants";
import { formatAmount } from "@/lib/utils";
import { getRecord, updateRecord, createManualRecord } from "@/lib/actions/record-actions";
import { getProjects } from "@/lib/actions/project-actions";
import { useToast } from "@/components/toast";
import { PageSpinner } from "@/components/spinner";
import PageHeader from "@/components/page-header";
import ConfidenceCard from "@/components/confidence-card";
import InvoiceDetailCard from "@/components/invoice-detail-card";

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

function ResultContent() {
  const { t } = useI18n();
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
          // 老记录的 category_code 可能是中文名，先解析成内置 code，
          // 否则分类选项里没有一项是选中的
          const code = record.categoryCode || record.categoryL1 || "";
          setCategoryCode(resolveCategoryCode(code) ?? code);
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
      showToast(t("result.selectProjectFirst"), "error");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      showToast(t("income.invalidAmount"), "error");
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
      showToast(t("result.saved"), "success");
      router.push(`/project/${activeProjectId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("result.saveFailed");
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageSpinner text={t("result.loadingRecord")} />;
  }

  return (
    <div className="pb-24">
      <PageHeader
        title={isManual ? t("result.manualEntry") : t("result.recognitionResult")}
        showBack
        onBack={() => router.back()}
      />

      <div className="px-4 pt-1 space-y-4 lg:mx-auto lg:max-w-3xl lg:px-10 lg:pt-6">
        {/* 项目选择 */}
        {!projectId && projects.length > 0 && (
          <ProjectSelector
            projects={projects}
            value={activeProjectId}
            onChange={setActiveProjectId}
          />
        )}
        {!projectId && projects.length === 0 && (
          <EmptyProjects redirect={() => router.push("/")} />
        )}

        {/* 原始票据图片 */}
        {imageUrl && (
          <OriginalImage image={imageUrl} />
        )}

        {/* 置信度卡片 — 仅非手动录入时展示 */}
        {!isManual && recordId && (
          <ConfidenceCard confidence={confidence} rawText={rawText} />
        )}

        {/* 表单 */}
        <RecordForm
          direction={direction}
          setDirection={setDirection}
          merchantName={merchantName}
          setMerchantName={setMerchantName}
          amount={amount}
          setAmount={setAmount}
          taxAmount={taxAmount}
          setTaxAmount={setTaxAmount}
          invoiceDate={invoiceDate}
          setInvoiceDate={setInvoiceDate}
          categoryCode={categoryCode}
          setCategoryCode={setCategoryCode}
        />

        {/* 发票详情卡片 */}
        {invoiceType && !isManual && (
          <InvoiceDetailCard
            invoiceType={invoiceType}
            invoiceNo={invoiceNo}
            invoiceCode={invoiceCode}
            checkCode={checkCode}
            taxRate={taxRate}
            amountWithoutTax={amountWithoutTax}
            buyerName={buyerName}
            buyerTaxNo={buyerTaxNo}
            sellerTaxNo={sellerTaxNo}
            invoiceItems={invoiceItems}
          />
        )}

        {/* 固定底部保存按钮：桌面让出侧边栏的位置，按钮与页面内容同宽 */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] p-4 z-40 lg:left-[260px] lg:px-10" style={{ paddingBottom: "calc(16px + var(--safe-bottom))" }}>
          <div className="lg:mx-auto lg:max-w-3xl">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-brand text-white py-3 rounded-xl font-medium disabled:opacity-50 btn-press"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 项目选择器 */
function ProjectSelector({
  projects,
  value,
  onChange,
}: {
  projects: ProjectOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
      <label className="block text-sm text-[#475569] mb-2">{t("result.selectProject")}</label>
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              value === p.id ? "bg-brand text-white" : "bg-gray-100 text-[#475569] hover:bg-gray-200"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 无项目提示 */
function EmptyProjects({ redirect }: { redirect: () => void }) {
  const { t } = useI18n();
  return (
    <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up text-center">
      <p className="text-sm text-[#64748B]">{t("result.noProjects")}</p>
      <button
        onClick={redirect}
        className="text-sm text-brand mt-2 btn-press"
      >
        {t("result.goCreate")} →
      </button>
    </div>
  );
}

/** 原始票据图片折叠展示 */
function OriginalImage({ image }: { image: string }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="bg-white rounded-md shadow-card animate-fade-in-up overflow-hidden">
      <button
        onClick={() => setShow(!show)}
        className="w-full flex items-center justify-between p-4"
      >
        <span className="text-sm text-[#475569]">{t("result.originalInvoice")}</span>
        <span className="text-xs text-brand">
          {show ? `${t("common.collapse")} ▲` : `${t("common.expand")} ▼`}
        </span>
      </button>
      {show && (
        <div className="px-4 pb-4">
          <img
            src={image}
            alt={t("result.originalInvoice")}
            className="w-full rounded-lg border border-[#E2E8F0]"
          />
        </div>
      )}
    </div>
  );
}

/** 编辑表单 — 方向切换 + 字段输入 + 分类选择 */
function RecordForm({
  direction, setDirection,
  merchantName, setMerchantName,
  amount, setAmount,
  taxAmount, setTaxAmount,
  invoiceDate, setInvoiceDate,
  categoryCode, setCategoryCode,
}: {
  direction: "out" | "income";
  setDirection: (d: "out" | "income") => void;
  merchantName: string;
  setMerchantName: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  taxAmount: string;
  setTaxAmount: (v: string) => void;
  invoiceDate: string;
  setInvoiceDate: (v: string) => void;
  categoryCode: string;
  setCategoryCode: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="bg-white rounded-md p-4 shadow-card space-y-4 animate-fade-in-up stagger-1">
      <div className="flex items-center gap-4">
        <DirectionButton
          label={t("common.expense")}
          direction="out"
          active={direction === "out"}
          onClick={() => setDirection("out")}
        />
        <DirectionButton
          label={t("common.income")}
          direction="income"
          active={direction === "income"}
          onClick={() => setDirection("income")}
        />
      </div>

      <div>
        <label className="block text-sm text-[#475569] mb-1">{t("result.merchantName")}</label>
        <input
          type="text"
          value={merchantName}
          onChange={(e) => setMerchantName(e.target.value)}
          className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          placeholder={t("result.merchantPlaceholder")}
          autoComplete="off"
        />
      </div>

      <div>
        <label className="block text-sm text-[#475569] mb-1">
          {t("result.amountYuan")}
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          placeholder="0.00"
        />
      </div>

      <div>
        <label className="block text-sm text-[#475569] mb-1">
          {t("result.taxYuan")}
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={taxAmount}
          onChange={(e) => setTaxAmount(e.target.value)}
          className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          placeholder={t("result.taxOptional")}
        />
      </div>

      <div>
        <label className="block text-sm text-[#475569] mb-1">{t("result.date")}</label>
        <input
          type="date"
          value={invoiceDate}
          onChange={(e) => setInvoiceDate(e.target.value)}
          className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm text-[#475569] mb-2">{t("result.category")}</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.code}
              onClick={() => setCategoryCode(cat.code)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 btn-press ${
                categoryCode === cat.code
                  ? "text-white scale-105"
                  : "bg-gray-100 text-[#475569]"
              }`}
              style={
                categoryCode === cat.code
                  ? { backgroundColor: cat.color }
                  : undefined
              }
            >
              {categoryLabel(cat.code, t)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 收支切换按钮。
 *
 * 配色按 direction 判断，不拿 label 比较——label 是显示文案，
 * 一旦翻译成英文，"支出" 的比较就永远不成立，两个按钮会变成同一个颜色。
 */
function DirectionButton({
  label,
  direction,
  active,
  onClick,
}: {
  label: string;
  direction: "out" | "income";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 btn-press ${
        active
          ? direction === "out"
            ? "bg-error/10 text-error border border-error/30"
            : "bg-success/10 text-success border border-success/30"
          : "bg-gray-50 text-[#64748B] border border-transparent"
      }`}
    >
      {label}
    </button>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ResultContent />
    </Suspense>
  );
}
