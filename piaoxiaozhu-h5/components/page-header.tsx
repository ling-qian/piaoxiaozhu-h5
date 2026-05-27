interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export default function PageHeader({ title, showBack, onBack, rightAction }: PageHeaderProps) {
  return (
    <div
      className="bg-gradient-to-r from-brand to-brand-light px-4 pb-6 relative"
      style={{ paddingTop: "calc(var(--safe-top) + 48px)" }}
    >
      {showBack && (
        <button
          onClick={onBack}
          className="absolute left-4 text-white text-lg btn-press"
          style={{ top: "calc(var(--safe-top) + 14px)" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      <h1 className="text-white text-lg font-semibold text-center">{title}</h1>
      {rightAction && (
        <div
          className="absolute right-4"
          style={{ top: "calc(var(--safe-top) + 14px)" }}
        >
          {rightAction}
        </div>
      )}
    </div>
  );
}
