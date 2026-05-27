export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <div className="text-center animate-fade-in">
        <div className="w-10 h-10 border-[3px] border-brand/20 border-t-brand rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-[#999999]">加载中...</p>
      </div>
    </div>
  );
}
