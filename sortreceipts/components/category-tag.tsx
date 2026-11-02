import { CATEGORY_MAP, categoryLabel, resolveCategoryCode } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";

interface CategoryTagProps {
  code: string;
  name?: string;
}

export default function CategoryTag({ code, name }: CategoryTagProps) {
  const { t } = useI18n();
  // code 可能是内置分类码，也可能是历史记录里的中文名，统一解析一次
  const resolved = resolveCategoryCode(code);
  const cat = resolved ? CATEGORY_MAP[resolved] : undefined;
  // 命中内置分类时一律用当前语言的标签。后端 category_l1 固定存中文，
  // 优先显示它会让英文界面冒出中文分类名。未知分类才回落到后端名字。
  const displayName = cat ? categoryLabel(code, t) : name || t("cat.other");
  const color = cat?.color || "#64748B";

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {displayName}
    </span>
  );
}
