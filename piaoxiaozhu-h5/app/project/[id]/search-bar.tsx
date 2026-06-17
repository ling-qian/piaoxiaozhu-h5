"use client";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
}

/** 搜索栏 — 商户/金额/日期搜索 */
export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="animate-fade-in-up">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="搜索商户、金额、日期..."
          className="w-full bg-white border border-[#EEEEEE] rounded-lg px-3 py-2 pl-8 text-sm focus:border-brand focus:outline-none"
        />
        <svg
          className="absolute left-2.5 top-2.5 text-[#BBBBBB]"
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
            className="absolute right-2.5 top-2.5 text-[#999999] text-xs"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
