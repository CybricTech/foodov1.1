"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

type SessionState = "checking" | "ready" | "missing";

/**
 * Relies on the recovery session that /auth/confirm established (via
 * verifyOtp) in this browser's cookies. Without it — link opened twice, expired,
 * or someone navigating here directly — updateUser would fail, so we check up
 * front and point them back to /forgot-password.
 */
export function ResetPasswordForm() {
  const [session, setSession] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setSession(data.user ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setSession("missing");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setLoading(false);
      setError(updateError.message || "Could not update your password. Please try again.");
      return;
    }

    // End the recovery session in THIS browser only (scope: local) — the reset
    // link is often opened in a phone's mail app or a shared browser, and a
    // global sign-out would also log the merchant out of the app on the tablet
    // running their orders.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    setLoading(false);
    setDone(true);
  }

  if (session === "checking") {
    return <p className="text-center text-sm text-black-400" role="status">Checking your reset link…</p>;
  }

  if (done) {
    return (
      <div className="space-y-4 text-center" role="status">
        <p className="text-sm font-semibold text-black-900">Your password has been updated.</p>
        <p className="text-sm text-black-500">
          You can now sign in on the Kitchyn Merchant app or the web dashboard.
        </p>
        <Link
          href="/dashboard/login"
          className="block w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  if (session === "missing") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-cinnabar-500 bg-cinnabar-100 px-4 py-3 rounded-xl" role="alert">
          This reset link has expired or has already been used.
        </p>
        <Link
          href="/forgot-password"
          className="block w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-black-500 mb-1">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoFocus
          className="w-full px-4 py-3 rounded-xl border border-black-200 text-base sm:text-sm text-black-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
        />
      </div>

      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-black-500 mb-1">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          className="w-full px-4 py-3 rounded-xl border border-black-200 text-base sm:text-sm text-black-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
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
        {loading ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
