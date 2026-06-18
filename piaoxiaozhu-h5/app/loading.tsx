export default function Loading() {
  return (
    <div className="pb-16">
      {/* Header skeleton */}
      <div className="h-12" />

      <div className="px-4 pt-1 space-y-3">
        {/* Quick action buttons skeleton */}
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-28 bg-gray-100 rounded-xl animate-pulse" />
        </div>

        {/* Section title skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-5 w-24 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 w-16 bg-gray-100 rounded-xl animate-pulse" />
        </div>

        {/* Project cards skeleton */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-md p-4 shadow-card animate-pulse">
            <div className="flex items-center justify-between">
              <div className="h-5 w-28 bg-gray-100 rounded" />
              <div className="h-4 w-16 bg-gray-100 rounded" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="h-4 w-12 bg-gray-100 rounded" />
              <div className="h-4 w-20 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}