"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Where the reset email sends people. /auth/confirm verifies the token_hash
 * server-side, so the link works on any device — not just the browser that
 * asked for it. Absolute and on the apex, because the request may come from a
 * storefront host or localhost while the email is opened elsewhere.
 */
// Built from the serving origin: this app runs on dashboard.kitchyn.app, while
// the apex (apexOrigin) is the separate marketing site and would 404.
const RESET_CONFIRM_PATH = "/auth/confirm?next=/reset-password";

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const linkExpired = searchParams.get("error") === "link_expired";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: resetError } = await createBrowserClient().auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}${RESET_CONFIRM_PATH}` }
    );

    setLoading(false);

    // Never reveal whether an account exists: Supabase answers success for
    // unknown addresses, and we only surface errors that aren't about the
    // address itself.
    if (resetError && resetError.status === 429) {
      setError("Too many attempts. Please wait a few minutes and try again.");
      return;
    }
    if (resetError && (resetError.status ?? 500) >= 500) {
      setError("Something went wrong on our side. Please try again shortly.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-black-900 bg-purple-100/60 px-4 py-3 rounded-xl" role="status">
          If an account exists for <strong className="font-semibold break-all">{email.trim()}</strong>,
          we&apos;ve emailed a link to reset your password. The link can only be used once.
        </p>
        <p className="text-xs text-black-400">
          Didn&apos;t get it? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-semibold text-purple-500 hover:underline"
          >
            try again
          </button>
          .
        </p>
        <Link href="/dashboard/login" className="inline-block text-sm font-semibold text-purple-500 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {linkExpired && (
        <p className="text-sm text-cinnabar-500 bg-cinnabar-100 px-4 py-2 rounded-xl" role="alert">
          That reset link has expired or has already been used. Request a new one below.
        </p>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-black-500 mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          className="w-full px-4 py-3 rounded-xl border border-black-200 text-base sm:text-sm text-black-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
          placeholder="you@restaurant.com"
        />
      </div>

      {error && (
        <p className="text-sm text-cinnabar-500 bg-cinnabar-100 px-4 py-2 rounded-xl" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-black-400">
        Remembered it?{" "}
        <Link href="/dashboard/login" className="font-semibold text-purple-500 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
