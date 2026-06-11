"use client";

/**
 * Root error boundary. Catches crashes in segments without their own
 * error.tsx (landing page, segment layouts) and offers a retry instead
 * of the bare Next.js error screen.
 */
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: "root" },
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="space-y-2">
          <h1 className="text-xl font-extrabold text-black-900">
            Something went wrong
          </h1>
          <p className="text-sm text-black-500 leading-relaxed">
            An unexpected error occurred. It&apos;s usually temporary — try
            again in a moment.
          </p>
        </div>
        <button
          onClick={reset}
          className="w-full bg-black-900 text-white py-3.5 rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity"
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
