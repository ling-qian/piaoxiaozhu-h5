import CategoryTag from "./category-tag";
import { getDirectionColor, getDirectionPrefix, formatAmount } from "@/lib/utils";

const INVOICE_TYPE_SHORT: Record<string, string> = {
  vat_special: "专票",
  vat_normal: "普票",
  vat_special_electronic: "数电专票",
  vat_normal_electronic: "数电普票",
  electronic: "电子票",
  machine_printed: "机打",
  receipt: "收据",
};

const INVOICE_TYPE_TAG_COLORS: Record<string, string> = {
  vat_special: "bg-red-50 text-red-600",
  vat_normal: "bg-blue-50 text-blue-600",
  vat_special_electronic: "bg-purple-50 text-purple-600",
  vat_normal_electronic: "bg-indigo-50 text-indigo-600",
  electronic: "bg-green-50 text-green-600",
  machine_printed: "bg-yellow-50 text-yellow-600",
  receipt: "bg-gray-50 text-gray-500",
};

interface RecordCardProps {
  id: string;
  merchantName: string | null;
  amount: number;
  direction: string;
  categoryCode: string;
  categoryL1: string;
  invoiceDate: string | null;
  invoiceType?: string | null;
  onClick?: () => void;
}

export default function RecordCard({
  merchantName,
  amount,
  direction,
  categoryCode,
  categoryL1,
  invoiceDate,
  invoiceType,
  onClick,
}: RecordCardProps) {
  return (
    <div
      className="bg-white rounded-md p-3 shadow-card flex items-center gap-2 cursor-pointer card-press animate-fade-in-up"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium truncate">
            {merchantName || "未知商户"}
          </span>
          <span className="shrink-0">
            <CategoryTag code={categoryCode} name={categoryL1} />
          </span>
          {invoiceType && INVOICE_TYPE_SHORT[invoiceType] && (
            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${INVOICE_TYPE_TAG_COLORS[invoiceType] || "bg-gray-50 text-gray-500"}`}>
              {INVOICE_TYPE_SHORT[invoiceType]}
            </span>
          )}
        </div>
        {invoiceDate && (
          <p className="text-xs text-[#999999]">{invoiceDate}</p>
        )}
      </div>
      <span
        className="text-base font-semibold shrink-0 whitespace-nowrap"
        style={{ color: getDirectionColor(direction) }}
      >
        {getDirectionPrefix(direction)}¥{formatAmount(amount)}
      </span>
    </div>
  );
}
