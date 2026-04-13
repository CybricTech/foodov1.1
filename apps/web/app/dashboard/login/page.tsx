"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createBrowserClient } from "@/lib/supabase/client";

export default function MerchantLoginPage() {
  return (
    <Suspense>
      <MerchantLoginForm />
    </Suspense>
  );
}

function MerchantLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const supabase = createBrowserClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.replace(redirect);
  }

  return (
    <div className="min-h-screen bg-black-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Kitchyn" width={120} height={40} className="h-10 w-auto mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-black-900">Merchant Login</h1>
          <p className="text-sm text-black-400 mt-1">
            Sign in to manage your restaurant
          </p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl border border-black-100 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              placeholder="you@restaurant.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-cinnabar-500 bg-cinnabar-100 px-4 py-2 rounded-xl">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
