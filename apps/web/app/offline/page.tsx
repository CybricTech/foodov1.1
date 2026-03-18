export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6">
      <div className="text-center max-w-xs">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">📡</span>
        </div>
        <h1 className="text-2xl font-extrabold text-brand-text">No connection</h1>
        <p className="text-brand-muted text-sm mt-2">
          Check your internet connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary mt-8 w-full"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
