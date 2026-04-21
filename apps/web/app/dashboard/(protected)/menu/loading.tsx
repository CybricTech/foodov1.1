export default function MenuLoading() {
  return (
    <div className="md:p-6 pb-24 animate-pulse">
      {/* Header */}
      <div className="bg-white md:rounded-2xl border-b md:border border-black-100 px-4 py-4 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-5 w-16 bg-black-100 rounded-lg" />
          <div className="h-3 w-28 bg-black-100 rounded-lg" />
        </div>
        <div className="h-9 w-24 bg-black-100 rounded-xl" />
      </div>

      {/* Two-column layout */}
      <div className="flex mt-0 md:mt-4">
        {/* Category sidebar */}
        <div className="w-44 flex-shrink-0 border-r border-black-100 bg-white md:rounded-l-2xl md:border md:border-r-0 py-2 space-y-0.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-3">
              <div className="flex-1 space-y-1.5">
                <div className={`h-3.5 bg-black-100 rounded-lg ${i === 1 ? "w-16" : i === 2 ? "w-20" : i === 3 ? "w-14" : "w-18"}`} />
                <div className="h-2.5 w-10 bg-black-50 rounded-lg" />
              </div>
            </div>
          ))}
        </div>

        {/* Items panel */}
        <div className="flex-1 bg-white md:rounded-r-2xl md:border md:border-l-0 border-black-100 overflow-hidden">
          {/* Panel sub-header */}
          <div className="px-4 py-3 border-b border-black-50">
            <div className="h-4 w-24 bg-black-100 rounded-lg" />
          </div>
          {/* Item rows */}
          <div className="divide-y divide-black-50">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-14 h-14 bg-black-100 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-black-100 rounded-lg" />
                  <div className="h-3 w-48 bg-black-50 rounded-lg" />
                  <div className="h-3 w-16 bg-black-100 rounded-lg" />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-10 h-5 bg-black-100 rounded-full" />
                  <div className="w-8 h-8 bg-black-50 rounded-lg" />
                  <div className="w-8 h-8 bg-black-50 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
