"use client";

// Admin controls for the automated payout engine, shown on the Settlements page.
//  • PayoutControls — global master switch + shadow/live mode.
//  • MerchantPayoutToggle — per-merchant enrolment switch (Merchant Directory).
// Both PATCH the admin APIs and reflect state optimistically.

import { useState } from "react";
import { cn } from "@foodo/ui";
import { Loader2, AlertTriangle } from "lucide-react";

async function patchPlatform(body: Record<string, boolean>) {
  const res = await fetch("/api/admin/platform-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Update failed");
}

async function patchMerchant(restaurantId: string, enabled: boolean) {
  const res = await fetch(`/api/admin/restaurants/${restaurantId}/payout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auto_payout_enabled: enabled }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Update failed");
}

/* ── A small switch ──────────────────────────────────────────────────────── */
function Switch({
  on,
  onClick,
  disabled,
  tone = "purple",
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  tone?: "purple" | "cinnabar";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        disabled && "opacity-40 cursor-not-allowed",
        on ? (tone === "cinnabar" ? "bg-cinnabar-500" : "bg-purple-500") : "bg-black-200"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
          on ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/* ── Global engine controls ──────────────────────────────────────────────── */
export function PayoutControls({
  initialEnabled,
  initialShadow,
}: {
  initialEnabled: boolean;
  initialShadow: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [shadow, setShadow] = useState(initialShadow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = enabled && !shadow;
  const state = !enabled ? "OFF" : shadow ? "SHADOW" : "LIVE";

  async function apply(patch: Record<string, boolean>, optimistic: () => void, revert: () => void) {
    setBusy(true);
    setError(null);
    optimistic();
    try {
      await patchPlatform(patch);
    } catch (e) {
      revert();
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleEngine() {
    const next = !enabled;
    apply({ auto_payout_enabled: next }, () => setEnabled(next), () => setEnabled(!next));
  }

  function toggleMode() {
    if (shadow) {
      // shadow → live: real money. Make it deliberate.
      if (
        !window.confirm(
          "Turn OFF shadow mode?\n\nThe next nightly run (02:00 UTC) will send REAL Paystack transfers to every enrolled merchant. Continue?"
        )
      )
        return;
      apply({ auto_payout_shadow: false }, () => setShadow(false), () => setShadow(true));
    } else {
      apply({ auto_payout_shadow: true }, () => setShadow(true), () => setShadow(false));
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-black-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-black-900">Automated Payouts</h3>
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                state === "LIVE" && "bg-cinnabar-50 text-cinnabar-600",
                state === "SHADOW" && "bg-purple-50 text-purple-600",
                state === "OFF" && "bg-black-100 text-black-500"
              )}
            >
              {state}
            </span>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-black-400" />}
          </div>
          <p className="text-xs text-black-400 mt-1">
            Runs nightly at 02:00 UTC (03:00 WAT). Only enrolled merchants with a saved bank
            account and ≥24h-old orders are paid.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {/* Master switch */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-black-800">Engine</p>
            <p className="text-xs text-black-400">Master switch for the nightly run</p>
          </div>
          <Switch on={enabled} onClick={toggleEngine} disabled={busy} />
        </div>

        {/* Mode (only relevant when the engine is on) */}
        <div className={cn("flex items-center justify-between", !enabled && "opacity-50")}>
          <div>
            <p className="text-sm font-medium text-black-800">
              {live ? "Live transfers" : "Shadow mode"}
            </p>
            <p className="text-xs text-black-400">
              {live
                ? "Sending real money to enrolled merchants"
                : "Logs “would pay” only — no money moves"}
            </p>
          </div>
          {/* on = live (shadow off). cinnabar tone signals real money. */}
          <Switch on={live} onClick={toggleMode} disabled={busy || !enabled} tone="cinnabar" />
        </div>
      </div>

      {live && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-cinnabar-50 px-3 py-2 text-xs text-cinnabar-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Live — the next run sends real Paystack transfers. Make sure Transfers is enabled & funded on your Paystack account.</span>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-cinnabar-50 px-3 py-2 text-xs text-cinnabar-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/* ── Per-merchant enrolment toggle ───────────────────────────────────────── */
export function MerchantPayoutToggle({
  restaurantId,
  initialEnabled,
  hasBankAccount,
}: {
  restaurantId: string;
  initialEnabled: boolean;
  hasBankAccount: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);

  // Can't enrol a merchant with no payout destination; disabling is always allowed.
  const blocked = !hasBankAccount && !enabled;

  async function toggle() {
    if (blocked) return;
    const next = !enabled;
    setBusy(true);
    setEnabled(next);
    try {
      await patchMerchant(restaurantId, next);
    } catch {
      setEnabled(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span
      className="inline-flex items-center justify-center"
      title={blocked ? "Add a bank account first" : enabled ? "Auto-payout on" : "Auto-payout off"}
    >
      <Switch on={enabled} onClick={toggle} disabled={busy || blocked} />
    </span>
  );
}
