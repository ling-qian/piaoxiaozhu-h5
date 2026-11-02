"use client";

import { useI18n } from "@/lib/i18n";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
}

/** 搜索栏 — 商户/金额/日期搜索 */
export default function SearchBar({ value, onChange }: SearchBarProps) {
  const { t } = useI18n();
  return (
    <div className="animate-fade-in-up">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("project.searchPlaceholder")}
          className="w-full bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 pl-8 text-sm focus:border-brand focus:outline-none"
        />
        <svg
          className="absolute left-2.5 top-2.5 text-[#94A3B8]"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        {value && (
          <button
            onClick={() => onChange("")}
            className="absolute right-2.5 top-2.5 text-[#64748B] text-xs"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
