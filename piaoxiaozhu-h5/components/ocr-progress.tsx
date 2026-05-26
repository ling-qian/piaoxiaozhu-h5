interface OcrProgressProps {
  progress: number;
  status: string;
}

export default function OcrProgress({ progress, status }: OcrProgressProps) {
  return (
    <div className="bg-white rounded-md p-4 shadow-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[#666666]">{status}</span>
        <span className="text-sm text-brand font-medium">{progress}%</span>
      </div>
      <div className="w-full h-2 bg-[#EEEEEE] rounded-full overflow-hidden">
        <div
          className="h-full bg-brand rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
