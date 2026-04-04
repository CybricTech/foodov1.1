export default function DashboardLoading() {
  return (
    <div className="md:p-6 p-4 space-y-4 animate-pulse">
      <div className="bg-white md:rounded-2xl border border-black-100 px-4 py-4">
        <div className="h-5 w-32 bg-black-100 rounded-lg" />
        <div className="h-3 w-20 bg-black-100 rounded-lg mt-2" />
      </div>
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 w-24 bg-black-100 rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-black-100 p-4 space-y-3">
            <div className="flex justify-between">
              <div className="h-4 w-24 bg-black-100 rounded-lg" />
              <div className="h-4 w-16 bg-black-100 rounded-full" />
            </div>
            <div className="h-3 w-40 bg-black-100 rounded-lg" />
            <div className="h-3 w-32 bg-black-100 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
