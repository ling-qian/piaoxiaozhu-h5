interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
}

export default function PageHeader({ title, showBack, onBack }: PageHeaderProps) {
  return (
    <div className="bg-gradient-to-r from-brand to-brand-light px-4 pt-12 pb-6 relative">
      {showBack && (
        <button
          onClick={onBack}
          className="absolute left-4 top-12 text-white text-lg"
        >
          ←
        </button>
      )}
      <h1 className="text-white text-lg font-semibold text-center">{title}</h1>
    </div>
  );
}
