export default function SettingsLoading() {
  return (
    <div className="md:p-6 p-4 space-y-4 animate-pulse">
      <div className="bg-white md:rounded-2xl border border-black-100 px-4 py-4">
        <div className="h-5 w-20 bg-black-100 rounded-lg" />
      </div>
      {[1, 2, 3].map((section) => (
        <div key={section} className="bg-white rounded-2xl border border-black-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-black-100">
            <div className="h-4 w-28 bg-black-100 rounded-lg" />
          </div>
          <div className="px-4 py-4 space-y-4">
            {[1, 2, 3].map((field) => (
              <div key={field} className="space-y-1.5">
                <div className="h-3 w-20 bg-black-100 rounded-lg" />
                <div className="h-10 w-full bg-black-100 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
