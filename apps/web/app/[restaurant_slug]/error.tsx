"use client";

/**
 * Storefront error boundary. Catches server-component crashes for
 * /[restaurant_slug] and below (e.g. a transient Supabase 525 on the
 * restaurant lookup) and shows a retryable, customer-friendly screen
 * instead of a dead page.
 */
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: "storefront" },
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="mx-auto w-16 h-16 rounded-3xl bg-black-100 flex items-center justify-center">
          <span className="text-3xl" role="img" aria-label="plate">
            🍽️
          </span>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-extrabold text-black-900">
            Something went wrong
          </h1>
          <p className="text-sm text-black-500 leading-relaxed">
            We couldn&apos;t load this page just now. It&apos;s usually
            temporary — give it another try.
          </p>
        </div>
        <button
          onClick={reset}
          className="w-full bg-primary text-white py-3.5 rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity"
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
