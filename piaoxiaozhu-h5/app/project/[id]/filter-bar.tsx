"use client";

import { CATEGORIES } from "@/lib/constants";

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
  return (
    <div className="flex flex-wrap gap-1.5">
      <FilterPill
        label="全部方向"
        active={!value}
        onClick={() => onChange("")}
      />
      <FilterPill
        label="支出"
        active={value === "out"}
        color="#FF4D4F"
        onClick={() => onChange(value === "out" ? "" : "out")}
      />
      <FilterPill
        label="收入"
        active={value === "income"}
        color="#52C41A"
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
  return (
    <div className="flex flex-wrap gap-1.5">
      <FilterPill
        label="全部分类"
        active={!selected}
        onClick={() => onChange("")}
      />
      {CATEGORIES.map((cat) => (
        <FilterPill
          key={cat.code}
          label={cat.name}
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
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={from}
        onChange={(e) => onChangeFrom(e.target.value)}
        className="flex-1 border border-[#EEEEEE] rounded-lg px-2 py-1.5 text-xs focus:border-brand focus:outline-none"
        placeholder="开始日期"
      />
      <span className="text-xs text-[#999999]">至</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onChangeTo(e.target.value)}
        className="flex-1 border border-[#EEEEEE] rounded-lg px-2 py-1.5 text-xs focus:border-brand focus:outline-none"
        placeholder="结束日期"
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
            : "bg-[#333333] text-white"
          : "bg-gray-100 text-[#666666]"
      }`}
      style={active && color ? { backgroundColor: color } : undefined}
    >
      {label}
    </button>
  );
}
