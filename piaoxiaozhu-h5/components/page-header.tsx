interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export default function PageHeader({ title, showBack, onBack, rightAction }: PageHeaderProps) {
  return (
    <div style={{ paddingTop: "calc(var(--safe-top) + 0px)" }}>
      {/* 渐变头部 */}
      <div className="relative overflow-hidden">
        {/* 主渐变背景 */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand via-brand to-brand-dark" />

        {/* 装饰性光晕 */}
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-16 w-40 h-40 bg-brand-dark/20 rounded-full blur-2xl" />
        <div className="absolute top-1/2 right-1/4 w-20 h-20 bg-white/5 rounded-full blur-xl" />

        {/* 内容区 */}
        <div className="relative px-4 pb-4">
          {/* 导航栏 */}
          <div className="flex items-center justify-between h-11">
            {showBack ? (
              <button
                onClick={onBack}
                className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center btn-press transition-all active:bg-white/25"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] text-white">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            ) : (
              <div className="w-9" />
            )}

            <h1 className="text-white text-[17px] font-semibold tracking-wide">{title}</h1>

            {rightAction ? (
              <div>{rightAction}</div>
            ) : (
              <div className="w-9" />
            )}
          </div>
        </div>
      </div>

      {/* 底部圆角过渡 */}
      <div className="relative -mt-px">
        <svg viewBox="0 0 400 16" fill="none" className="w-full block" preserveAspectRatio="none">
          <path d="M0 16V8C60 2 140 0 200 0C260 0 340 2 400 8V16H0Z" fill="#F5F5F5" />
        </svg>
      </div>
    </div>
  );
}
