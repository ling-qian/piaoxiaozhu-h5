"use client";

/** 报表页面骨架屏 — 替代 PageSpinner 提供结构化占位 */
export default function ReportSkeleton() {
  return (
    <div className="pb-16">
      {/* 顶部骨架 */}
      <div className="h-12 bg-white mx-4 mt-4 rounded-md shadow-card animate-pulse" />

      <div className="px-4 -mt-4 space-y-4">
        {/* 项目选择骨架 */}
        <SkeletonCard className="h-12" />

        {/* 统计卡片骨架 */}
        <div className="flex gap-2">
          <SkeletonCard className="flex-1 h-16" />
          <SkeletonCard className="flex-1 h-16" />
          <SkeletonCard className="flex-1 h-16" />
        </div>

        {/* 毛利率骨架 */}
        <SkeletonCard className="h-16" />

        {/* 搜索筛选骨架 */}
        <SkeletonCard className="h-28" />

        {/* 月份筛选骨架 */}
        <SkeletonCard className="h-16" />

        {/* 导出按钮骨架 */}
        <SkeletonCard className="h-12" />

        {/* 成本图表骨架 */}
        <SkeletonCard className="h-48" />

        {/* 月度趋势骨架 */}
        <SkeletonCard className="h-36" />

        {/* 明细表骨架 */}
        <SkeletonCard className="h-40">
          <div className="px-4 pb-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-3 bg-[#F5F5F5] rounded w-16 animate-pulse" />
                <div className="h-3 bg-[#F5F5F5] rounded w-24 animate-pulse" />
                <div className="h-3 bg-[#F5F5F5] rounded w-12 animate-pulse" />
                <div className="h-3 bg-[#F5F5F5] rounded w-16 animate-pulse" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </div>
  );
}

/** 通用骨架卡片 */
function SkeletonCard({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-md shadow-card animate-pulse ${className}`}>
      {children}
    </div>
  );
}
