interface OcrProgressProps {
  progress: number;
  status: string;
}

export default function OcrProgress({ progress, status }: OcrProgressProps) {
  return (
    <div className="bg-white rounded-md p-4 shadow-card animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[#666666]">{status}</span>
        <span className="text-sm text-brand font-medium">{progress}%</span>
      </div>
      <div className="w-full h-2 bg-[#EEEEEE] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand to-brand-light rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      {progress < 100 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" />
          <span className="text-xs text-[#999999]">正在处理中，请稍候...</span>
        </div>
      )}
    </div>
  );
}
