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
        <div className="flex gap-2">
          <div className="flex-1 h-10 bg-gray-100 rounded-xl animate-pulse" />
          <div className="flex-1 h-10 bg-gray-100 rounded-xl animate-pulse" />
        </div>
        <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white rounded-md p-4 shadow-card animate-pulse">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-32 bg-gray-100 rounded" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
              </div>
              <div className="h-5 w-16 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
