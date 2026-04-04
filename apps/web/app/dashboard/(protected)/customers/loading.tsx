export default function CustomersLoading() {
  return (
    <div className="md:p-6 p-4 space-y-4 animate-pulse">
      <div className="bg-white md:rounded-2xl border border-black-100 px-4 py-4 flex justify-between items-center">
        <div className="h-5 w-24 bg-black-100 rounded-lg" />
        <div className="h-9 w-28 bg-black-100 rounded-xl" />
      </div>
      <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-100 flex gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-3 w-20 bg-black-100 rounded-lg" />
          ))}
        </div>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="px-4 py-3 border-b border-black-50 flex gap-4">
            <div className="h-4 w-32 bg-black-100 rounded-lg" />
            <div className="h-4 w-28 bg-black-100 rounded-lg" />
            <div className="h-4 w-16 bg-black-100 rounded-lg" />
            <div className="h-4 w-20 bg-black-100 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
