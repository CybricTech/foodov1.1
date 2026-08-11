export default function AdminLiveOpsLoading() {
  return (
    <div className="animate-pulse p-4 md:p-6 pb-24 space-y-6">
      {/* Header — title + LIVE badge + subtitle + search/notifier slot */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-7 w-44 bg-black-100 rounded-xl" />
            <div className="h-5 w-14 bg-black-100 rounded-full" />
          </div>
          <div className="h-3.5 w-72 bg-black-50 rounded-lg" />
        </div>
        <div className="h-10 w-56 bg-black-100 rounded-xl" />
      </div>

      {/* System health strip — single thin card */}
      <div className="bg-white rounded-2xl border border-black-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-black-100" />
              <div className="h-3 w-16 bg-black-100 rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      {/* PRIMARY KPI row — 4 cards, grid-cols-2 xl:grid-cols-4 */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-black-200 px-3.5 py-3"
          >
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-black-100" />
              <div className="h-2.5 w-14 bg-black-100 rounded-lg" />
            </div>
            <div className="h-5 w-16 bg-black-100 rounded-lg mt-1.5" />
            <div className="h-2.5 w-20 bg-black-50 rounded-lg mt-1" />
          </div>
        ))}
      </div>

      {/* SECONDARY KPI row — 3 compact cards, grid-cols-2 md:grid-cols-3 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-black-200 px-3.5 py-3"
          >
            <div className="h-2.5 w-16 bg-black-100 rounded-lg" />
            <div className="h-4 w-12 bg-black-100 rounded-lg mt-1.5" />
            <div className="h-2.5 w-20 bg-black-50 rounded-lg mt-1" />
          </div>
        ))}
      </div>

      {/* SLA strip — 4 compact muted cards, grid-cols-2 xl:grid-cols-4 */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-black-200 px-3.5 py-3"
          >
            <div className="h-2.5 w-16 bg-black-100 rounded-lg" />
            <div className="h-4 w-12 bg-black-100 rounded-lg mt-1.5" />
            <div className="h-2.5 w-20 bg-black-50 rounded-lg mt-1" />
          </div>
        ))}
      </div>

      {/* Hourly throughput — full-width card, collapsed: header + sparkline bar */}
      <div className="bg-white rounded-2xl border border-black-200 p-4">
        <div className="flex items-center justify-between">
          <div className="h-3 w-32 bg-black-100 rounded-lg" />
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-20 bg-black-50 rounded-lg" />
            <div className="h-10 w-10 rounded-full bg-black-50" />
          </div>
        </div>
        <div className="flex items-end gap-1 mt-3">
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              className="flex-1 bg-black-50 rounded-sm"
              style={{ height: `${18 + ((i * 37) % 22)}px` }}
            />
          ))}
        </div>
      </div>

      {/* Order pipeline chips */}
      <div className="bg-white rounded-2xl border border-black-200 p-4">
        <div className="h-3 w-24 bg-black-100 rounded-lg" />
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="h-8 w-24 bg-black-50 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Merchant board + live feed */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Board — 2-col card grid: logo square + 3 row bars each */}
        <div className="xl:col-span-2 space-y-4">
          <div className="h-3 w-36 bg-black-100 rounded-lg" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-black-200">
                <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                  <div className="h-10 w-10 rounded-xl bg-black-100" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3.5 w-24 bg-black-100 rounded-lg" />
                    <div className="h-2.5 w-32 bg-black-50 rounded-lg" />
                  </div>
                  <div className="h-5 w-7 bg-black-100 rounded-lg" />
                </div>
                <div className="divide-y divide-black-100 border-t border-black-100">
                  {Array.from({ length: 3 }, (_, j) => (
                    <div key={j} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="h-2 w-2 rounded-full bg-black-100" />
                      <div className="h-3 w-24 bg-black-50 rounded-lg" />
                      <div className="h-3 w-10 ml-auto rounded-full bg-black-100" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feed rail */}
        <div className="space-y-3">
          <div className="h-3 w-24 bg-black-100 rounded-lg" />
          <div className="bg-white rounded-2xl border border-black-200 divide-y divide-black-100">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-black-100" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-28 bg-black-50 rounded-lg" />
                  <div className="h-2.5 w-20 bg-black-50 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}