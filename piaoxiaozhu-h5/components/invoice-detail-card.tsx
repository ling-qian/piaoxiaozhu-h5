"use client";

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

  const label = INVOICE_TYPE_LABELS[invoiceType] || invoiceType;
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
        <span className="text-sm font-medium text-[#333333]">发票详情</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
          {label}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        {invoiceNo && (
          <Field label="发票号码" value={invoiceNo} mono />
        )}
        {invoiceCode && (
          <Field label="发票代码" value={invoiceCode} mono />
        )}
        {checkCode && (
          <Field label="校验码" value={checkCode} mono />
        )}
        {taxRate !== null && (
          <Field
            label="税率"
            value={`${(taxRate * 100).toFixed(taxRate * 100 % 1 === 0 ? 0 : 1)}%`}
          />
        )}
        {amountWithoutTax !== null && (
          <Field label="不含税金额" value={`¥${amountWithoutTax.toFixed(2)}`} />
        )}
        {buyerName && (
          <Field label="购买方" value={buyerName} />
        )}
        {buyerTaxNo && (
          <Field label="购买方税号" value={buyerTaxNo} mono />
        )}
        {sellerTaxNo && (
          <Field label="销售方税号" value={sellerTaxNo} mono />
        )}
      </div>

      {/* 商品明细 */}
      {parsedItems && parsedItems.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#EEEEEE]">
          <span className="text-xs text-[#999999] mb-2 block">商品明细</span>
          <div className="space-y-1.5">
            {parsedItems.map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="text-[#333333] truncate max-w-[50%]">{item.name}</span>
                <span className="text-[#666666]">
                  ×{item.quantity} ¥{item.amount.toFixed(2)} {(item.taxRate * 100).toFixed(0)}%
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
      <span className="text-[#999999]">{label}</span>
      <span className={mono ? "text-[#333333] font-mono text-xs" : "text-[#333333] text-right max-w-[60%] truncate"}>
        {value}
      </span>
    </div>
  );
}
