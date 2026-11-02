export default function Loading() {
  return (
    <div className="pb-16">
      <div className="h-12 bg-gray-100 animate-pulse" />
      <div className="px-4 pt-1 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-md p-5 shadow-card animate-pulse">
            <div className="flex items-center justify-between mb-3">
              <div className="h-5 w-20 bg-gray-100 rounded" />
              <div className="h-6 w-16 bg-gray-100 rounded" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-3/4 bg-gray-100 rounded" />
              <div className="h-3 w-1/2 bg-gray-100 rounded" />
            </div>
            <div className="h-10 w-full bg-gray-100 rounded-xl mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
