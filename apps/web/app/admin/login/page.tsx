"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { createBrowserClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}

function AdminLoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/admin";
  const supabase = createBrowserClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [factorId, setFactorId] = useState("");

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Check if MFA is required
    if (data.session?.user) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totpFactor = factors?.totp?.[0];

      if (totpFactor?.status === "verified") {
        setFactorId(totpFactor.id);
        setStep("totp");
        setLoading(false);
        return;
      }
    }

    // No MFA configured — check role
    await verifyAdminAndRedirect(redirect);
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: totpCode.trim(),
    });

    if (verifyError) {
      setError("Invalid code. Try again.");
      setLoading(false);
      return;
    }

    await verifyAdminAndRedirect(redirect);
  }

  async function verifyAdminAndRedirect(redirectTo: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Session error");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super_admin") {
      await supabase.auth.signOut();
      setError("Access denied: not a super admin");
      setLoading(false);
      return;
    }

    // Use a full page navigation so the browser sends the new session
    // cookies in a fresh HTTP request, bypassing Next.js's client-side
    // router cache which can replay the pre-login redirect to /admin/login.
    window.location.href = redirectTo;
  }

  return (
    <div className="min-h-screen bg-purple-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Kitchyn" width={120} height={40} className="h-10 w-auto mx-auto mb-6 brightness-0 invert" />
          <h1 className="text-2xl font-bold text-white">Admin Access</h1>
          <p className="text-sm text-purple-300 mt-1">
            {step === "credentials"
              ? "Enter your credentials"
              : "Enter your 6-digit TOTP code"}
          </p>
        </div>

        <form
          onSubmit={step === "credentials" ? handleCredentials : handleTotp}
          className="bg-purple-800 rounded-2xl border border-purple-700 p-6 space-y-4"
        >
          {step === "credentials" && (
            <>
              <div>
                <label className="block text-sm font-medium text-purple-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-purple-900 border border-purple-700 text-white text-sm focus:outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-purple-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-purple-900 border border-purple-700 text-white text-sm focus:outline-none focus:border-purple-400"
                />
              </div>
            </>
          )}

          {step === "totp" && (
            <div>
              <label className="block text-sm font-medium text-purple-300 mb-1">
                Authenticator code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                required
                autoFocus
                placeholder="000000"
                className="w-full px-4 py-3 rounded-xl bg-purple-900 border border-purple-700 text-white text-sm text-center tracking-widest focus:outline-none focus:border-purple-400"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-cinnabar-500 bg-cinnabar-100/10 px-4 py-2 rounded-xl">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? "…" : step === "credentials" ? "Continue" : "Verify"}
          </button>
        </form>
      </div>
    </div>
  );
}
