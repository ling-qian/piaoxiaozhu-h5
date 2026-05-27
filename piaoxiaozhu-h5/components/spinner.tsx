export default function Spinner({ size = "md", text }: { size?: "sm" | "md" | "lg"; text?: string }) {
  const sizeMap = { sm: "w-5 h-5", md: "w-8 h-8", lg: "w-12 h-12" };
  const borderMap = { sm: "border-2", md: "border-[3px]", lg: "border-4" };

  return (
    <div className="flex flex-col items-center justify-center gap-3" role="status" aria-label={text || "加载中"}>
      <div
        className={`${sizeMap[size]} ${borderMap[size]} border-brand/20 border-t-brand rounded-full animate-spin`}
        aria-hidden="true"
      />
      {text && <p className="text-sm text-[#999999]">{text}</p>}
    </div>
  );
}

export function PageSpinner({ text = "加载中" }: { text?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="md" text={text} />
    </div>
  );
}

export function InlineSpinner() {
  return (
    <div className="inline-flex items-center gap-2" role="status" aria-label="加载中">
      <div className="w-4 h-4 border-2 border-brand/20 border-t-brand rounded-full animate-spin" aria-hidden="true" />
    </div>
  );
}
