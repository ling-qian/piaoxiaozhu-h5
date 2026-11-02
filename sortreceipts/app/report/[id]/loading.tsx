export default function Loading() {
  return (
    <div className="pb-16">
      <div className="h-12 bg-gray-100 animate-pulse" />
      <div className="px-4 pt-1 space-y-4">
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-1 h-16 bg-gray-100 rounded-md animate-pulse" />
          ))}
        </div>
        <div className="h-40 bg-gray-100 rounded-md animate-pulse" />
        <div className="h-52 bg-gray-100 rounded-md animate-pulse" />
      </div>
    </div>
  );
}
