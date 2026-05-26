import { CATEGORY_MAP } from "@/lib/constants";

interface CategoryTagProps {
  code: string;
  name?: string;
}

export default function CategoryTag({ code, name }: CategoryTagProps) {
  const cat = CATEGORY_MAP[code];
  const displayName = name || cat?.name || "其他";
  const color = cat?.color || "#999999";

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {displayName}
    </span>
  );
}
