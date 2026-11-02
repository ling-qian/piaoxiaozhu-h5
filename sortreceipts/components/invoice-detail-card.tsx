"use client";

import { useI18n } from "@/lib/i18n";
import { formatPrice, CURRENCY_SYMBOL } from "@/lib/currency";
import { SHOW_CN_INVOICE_FIELDS } from "@/lib/region";

/** 发票详情卡片 — 展示发票代码/号码/税率/购买方/销售方/商品明细 */
interface InvoiceDetailCardProps {
  invoiceType: string | null;
  invoiceNo: string | null;
  invoiceCode: string | null;
  checkCode: string | null;
  taxRate: number | null;
  amountWithoutTax: number | null;
  buyerName: string | null;
  buyerTaxNo: string | null;
  sellerTaxNo: string | null;
  invoiceItems: string | null;
}

/**
 * 票种 → i18n key。
 *
 * 这些是中国增值税发票的分类。海外小票绝大多数落在 `receipt`，
 * 其余几种在欧美不出现——保留映射只为兼容历史数据，不是给海外用户看的。
 */
const INVOICE_TYPE_KEYS: Record<string, string> = {
  vat_special: "invoice.type.vatSpecial",
  vat_normal: "invoice.type.vatNormal",
  vat_special_electronic: "invoice.type.vatSpecialE",
  vat_normal_electronic: "invoice.type.vatNormalE",
  electronic: "invoice.type.electronic",
  machine_printed: "invoice.type.machine",
  receipt: "invoice.type.receipt",
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

export default function InvoiceDetailCard({
  invoiceType,
  invoiceNo,
  invoiceCode,
  checkCode,
  taxRate,
  amountWithoutTax,
  buyerName,
  buyerTaxNo,
  sellerTaxNo,
  invoiceItems,
}: InvoiceDetailCardProps) {
  if (!invoiceType) return null;

  const { t } = useI18n();
  // 未知票种直接显示原始值——比显示「未知」更有助于排查后端返回了什么
  const label = (invoiceType && INVOICE_TYPE_KEYS[invoiceType])
    ? t(INVOICE_TYPE_KEYS[invoiceType])
    : invoiceType;
  const color = INVOICE_TYPE_COLORS[invoiceType] || "bg-gray-100 text-gray-600";

  // 解析商品明细
  let parsedItems: { name: string; quantity: number; amount: number; taxRate: number }[] | null = null;
  if (invoiceItems) {
    try {
      const items = JSON.parse(invoiceItems);
      if (Array.isArray(items) && items.length > 0) {
        parsedItems = items;
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up stagger-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-[#0F172A]">{t("invoice.detail")}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
          {label}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        {invoiceNo && (
          <Field label={t("invoice.no")} value={invoiceNo} mono />
        )}
        {/* 发票代码与校验码是中国增值税发票专有。欧美小票没有这两项，
            识别出来是空的；留着一个空字段会让用户以为识别失败。 */}
        {SHOW_CN_INVOICE_FIELDS && invoiceCode && (
          <Field label={t("invoice.code")} value={invoiceCode} mono />
        )}
        {SHOW_CN_INVOICE_FIELDS && checkCode && (
          <Field label={t("invoice.checkCode")} value={checkCode} mono />
        )}
        {taxRate !== null && (
          <Field
            label={t("invoice.taxRate")}
            value={`${(taxRate * 100).toFixed(taxRate * 100 % 1 === 0 ? 0 : 1)}%`}
          />
        )}
        {amountWithoutTax !== null && (
          // 金额没有随单据存币种，按当前站点币种展示
          <Field label={t("invoice.amountWithoutTax")} value={formatPrice(amountWithoutTax, amountWithoutTax)} />
        )}
        {buyerName && (
          <Field label={t("invoice.buyer")} value={buyerName} />
        )}
        {SHOW_CN_INVOICE_FIELDS && buyerTaxNo && (
          <Field label={t("invoice.buyerTaxNo")} value={buyerTaxNo} mono />
        )}
        {SHOW_CN_INVOICE_FIELDS && sellerTaxNo && (
          <Field label={t("invoice.sellerTaxNo")} value={sellerTaxNo} mono />
        )}
      </div>

      {/* 商品明细 */}
      {parsedItems && parsedItems.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] mb-2 block">{t("invoice.items")}</span>
          <div className="space-y-1.5">
            {parsedItems.map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="text-[#0F172A] truncate max-w-[50%]">{item.name}</span>
                <span className="text-[#475569]">
                  ×{item.quantity} {CURRENCY_SYMBOL}{item.amount.toFixed(2)} {(item.taxRate * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 单行字段展示 */
function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#64748B]">{label}</span>
      <span className={mono ? "text-[#0F172A] font-mono text-xs" : "text-[#0F172A] text-right max-w-[60%] truncate"}>
        {value}
      </span>
    </div>
  );
}
