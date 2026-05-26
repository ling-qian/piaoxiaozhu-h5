import CategoryTag from "./category-tag";
import { getDirectionColor, getDirectionPrefix, formatAmount } from "@/lib/utils";

interface RecordCardProps {
  id: string;
  merchantName: string | null;
  amount: number;
  direction: string;
  categoryCode: string;
  categoryL1: string;
  invoiceDate: string | null;
  onClick?: () => void;
}

export default function RecordCard({
  merchantName,
  amount,
  direction,
  categoryCode,
  categoryL1,
  invoiceDate,
  onClick,
}: RecordCardProps) {
  return (
    <div
      className="bg-white rounded-md p-3 shadow-card flex items-center justify-between cursor-pointer card-press animate-fade-in-up"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium truncate">
            {merchantName || "未知商户"}
          </span>
          <CategoryTag code={categoryCode} name={categoryL1} />
        </div>
        {invoiceDate && (
          <p className="text-xs text-[#999999]">{invoiceDate}</p>
        )}
      </div>
      <span
        className="text-base font-semibold ml-2"
        style={{ color: getDirectionColor(direction) }}
      >
        {getDirectionPrefix(direction)}¥{formatAmount(amount)}
      </span>
    </div>
  );
}
