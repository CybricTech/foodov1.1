export default function MenuLoading() {
  return (
    <div className="md:p-6 p-4 space-y-4 animate-pulse">
      <div className="bg-white md:rounded-2xl border border-black-100 px-4 py-4">
        <div className="h-5 w-20 bg-black-100 rounded-lg" />
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-24 bg-black-100 rounded-xl flex-shrink-0" />
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-black-100 p-4 flex gap-3">
            <div className="w-16 h-16 bg-black-100 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-black-100 rounded-lg" />
              <div className="h-3 w-48 bg-black-100 rounded-lg" />
              <div className="h-3 w-16 bg-black-100 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
