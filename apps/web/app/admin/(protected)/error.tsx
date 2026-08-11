"use client";

/**
 * Admin Live Operations error boundary. Catches server-component crashes
 * (e.g. a transient Supabase failure on the page's data fetch) and shows a
 * retryable screen inside the admin shell instead of the bare Next.js error
 * page. Operator-facing only — no stack traces are ever rendered.
 */
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle } from "lucide-react";

export default function AdminLiveOpsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: "admin-live-ops" },
    });
  }, [error]);

  return (
    <div className="flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-2xl border border-black-200 max-w-sm w-full p-6 text-center space-y-5">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-cinnabar-100 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-cinnabar-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-extrabold text-black-900">
            Live Operations failed to load
          </h1>
          <p className="text-sm text-black-500 leading-relaxed break-words">
            {error.message
              ? error.message
              : "An unexpected error occurred. It's usually temporary — try again in a moment."}
          </p>
        </div>
        <button
          onClick={reset}
          className="w-full bg-purple-600 text-white py-3.5 rounded-2xl font-bold text-sm hover:bg-purple-700 transition-colors"
        >
          Try again
        </button>
        {error.digest && (
          <p className="text-[11px] text-black-400">Ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}