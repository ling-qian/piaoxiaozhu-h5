"use client";

import { useI18n } from "@/lib/i18n";
import { CATEGORIES, categoryLabel } from "@/lib/constants";

interface FilterBarProps {
  showFilterBar: boolean;
  hasActiveFilter: boolean;
  filterCategory: string;
  filterDirection: string;
  filterDateFrom: string;
  filterDateTo: string;
  onToggle: () => void;
  onSetCategory: (v: string) => void;
  onSetDirection: (v: string) => void;
  onSetDateFrom: (v: string) => void;
  onSetDateTo: (v: string) => void;
  onClearFilters: () => void;
}

export default function FilterBar({
  showFilterBar,
  hasActiveFilter,
  filterCategory,
  filterDirection,
  filterDateFrom,
  filterDateTo,
  onToggle,
  onSetCategory,
  onSetDirection,
  onSetDateFrom,
  onSetDateTo,
  onClearFilters,
}: FilterBarProps) {
  if (!showFilterBar) return null;

  return (
    <div className="bg-white rounded-md p-3 shadow-card space-y-2 animate-fade-in-up">
      {/* 方向筛选 */}
      <FilterDirectionBar
        value={filterDirection}
        onChange={onSetDirection}
      />
      {/* 分类筛选 */}
      <FilterCategoryBar
        selected={filterCategory}
        onChange={onSetCategory}
      />
      {/* 日期范围 */}
      <FilterDateRange
        from={filterDateFrom}
        to={filterDateTo}
        onChangeFrom={onSetDateFrom}
        onChangeTo={onSetDateTo}
      />
      {hasActiveFilter && (
        <button
          onClick={onClearFilters}
          className="text-xs text-brand btn-press"
        >
          清除所有筛选
        </button>
      )}
    </div>
  );
}

/** 方向筛选 */
function FilterDirectionBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-1.5">
      <FilterPill
        label={t("filter.allDirections")}
        active={!value}
        onClick={() => onChange("")}
      />
      <FilterPill
        label={t("common.expense")}
        active={value === "out"}
        color="#DC2626"
        onClick={() => onChange(value === "out" ? "" : "out")}
      />
      <FilterPill
        label={t("common.income")}
        active={value === "income"}
        color="#059669"
        onClick={() => onChange(value === "income" ? "" : "income")}
      />
    </div>
  );
}

/** 分类筛选 */
function FilterCategoryBar({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-1.5">
      <FilterPill
        label={t("filter.allCategories")}
        active={!selected}
        onClick={() => onChange("")}
      />
      {CATEGORIES.map((cat) => (
        <FilterPill
          key={cat.code}
          label={categoryLabel(cat.code, t)}
          active={selected === cat.code}
          color={cat.color}
          onClick={() => onChange(selected === cat.code ? "" : cat.code)}
        />
      ))}
    </div>
  );
}

/** 日期范围 */
function FilterDateRange({
  from,
  to,
  onChangeFrom,
  onChangeTo,
}: {
  from: string;
  to: string;
  onChangeFrom: (v: string) => void;
  onChangeTo: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={from}
        onChange={(e) => onChangeFrom(e.target.value)}
        className="flex-1 border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-xs focus:border-brand focus:outline-none"
        placeholder={t("filter.dateFrom")}
      />
      <span className="text-xs text-[#64748B]">–</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onChangeTo(e.target.value)}
        className="flex-1 border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-xs focus:border-brand focus:outline-none"
        placeholder={t("filter.dateTo")}
      />
    </div>
  );
}

/** 筛选按钮 */
function FilterPill({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs btn-press ${
        active
          ? color
            ? "text-white"
            : "bg-[#0F172A] text-white"
          : "bg-gray-100 text-[#475569]"
      }`}
      style={active && color ? { backgroundColor: color } : undefined}
    >
      {label}
    </button>
  );
}
