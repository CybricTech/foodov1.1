"use client";

// Admin controls for the automated payout engine, shown on the Settlements page.
//  • PayoutControls — global master switch + shadow/live mode.
//  • MerchantPayoutToggle — per-merchant enrolment switch (Merchant Directory).
//  • MerchantCommissionEditor — per-merchant in-house delivery commission rate.
// All PATCH the admin APIs and reflect state optimistically.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@foodo/ui";
import { formatKobo } from "@foodo/utils";
import { Loader2, AlertTriangle, Wallet, Pencil } from "lucide-react";

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
  balanceKobo,
  enrolledOwedKobo,
}: {
  initialEnabled: boolean;
  initialShadow: boolean;
  /** Live Paystack balance (kobo) transfers draw from; null if unreadable. */
  balanceKobo: number | null;
  /** Sum of pending balances across enrolled merchants — what a live run owes. */
  enrolledOwedKobo: number;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [shadow, setShadow] = useState(initialShadow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = enabled && !shadow;
  const state = !enabled ? "OFF" : shadow ? "SHADOW" : "LIVE";

  // Float guard: transfers are funded from the Paystack balance, but the account
  // auto-settles to the bank daily, so the balance must be kept topped up. Warn
  // when the readable balance can't cover what enrolled merchants are owed.
  const balanceKnown = balanceKobo != null;
  const shortfall = balanceKnown && enrolledOwedKobo > 0 && balanceKobo < enrolledOwedKobo;

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

      {/* Float gauge — transfers draw from this balance; the account auto-settles
          to the bank daily, so it must be kept topped up. */}
      <div className="mt-4 flex items-center justify-between rounded-lg border border-black-100 bg-black-50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-black-400" />
          <div>
            <p className="text-xs font-medium text-black-900">Paystack balance (payout float)</p>
            <p className="text-[11px] text-black-400">
              Owed to enrolled merchants: {formatKobo(enrolledOwedKobo)}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "text-sm font-bold tabular-nums",
            !balanceKnown ? "text-black-400" : shortfall ? "text-cinnabar-500" : "text-viridian-500"
          )}
        >
          {balanceKnown ? formatKobo(balanceKobo) : "—"}
        </span>
      </div>

      {shortfall && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-cinnabar-100 px-3 py-2 text-xs text-cinnabar-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Balance is below what enrolled merchants are owed ({formatKobo(enrolledOwedKobo)}). Top
            up your Paystack balance or the next run will skip the merchants it can&apos;t fund.
          </span>
        </div>
      )}

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

/* ── Per-merchant in-house delivery commission ───────────────────────────── */

/**
 * Inline editor for a merchant's in-house (own_rider/third_party) delivery
 * commission. NULL override = the platform default. Saving re-prices the
 * merchant's UNSETTLED orders (the API recomputes the wallet); settled payouts
 * are frozen — the confirm dialog states this because it moves real money.
 */
export function MerchantCommissionEditor({
  restaurantId,
  restaurantName,
  initialOverridePct,
  platformDefaultPct,
}: {
  restaurantId: string;
  restaurantName: string;
  /** Current override as a fraction (0.15 = 15%); null = inherits the default. */
  initialOverridePct: number | null;
  /** Platform-wide default rate as a fraction. */
  platformDefaultPct: number;
}) {
  const router = useRouter();
  const [overridePct, setOverridePct] = useState<number | null>(initialOverridePct);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePct = overridePct ?? platformDefaultPct;
  const fmt = (pct: number) =>
    `${(pct * 100).toFixed(1).replace(/\.0$/, "")}%`;

  async function save(next: number | null) {
    const label =
      next == null ? `the platform default (${fmt(platformDefaultPct)})` : fmt(next);
    if (
      !window.confirm(
        `Set ${restaurantName}'s in-house delivery commission to ${label}?\n\n` +
          `This re-prices ALL of this merchant's unsettled orders and their next payout. ` +
          `Already-paid settlements are not affected.`
      )
    )
      return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/restaurants/${restaurantId}/commission`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delivery_commission_pct: next }),
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({})))?.error ?? "Update failed");
      }
      setOverridePct(next);
      setEditing(false);
      // Balances on this page were recomputed server-side — pull fresh data.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function submitDraft() {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError("Enter a percentage between 0 and 100");
      return;
    }
    save(Math.round(parsed * 100) / 10000); // percent → fraction, 2dp of a percent
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center justify-center gap-1.5">
        <span
          className={cn(
            "text-xs tabular-nums font-semibold",
            overridePct == null ? "text-black-400" : "text-purple-600"
          )}
          title={
            overridePct == null
              ? `Platform default (${fmt(platformDefaultPct)})`
              : `Custom rate — default is ${fmt(platformDefaultPct)}`
          }
        >
          {fmt(effectivePct)}
          {overridePct == null && <span className="ml-1 font-normal text-[10px]">default</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft((effectivePct * 100).toFixed(1).replace(/\.0$/, ""));
            setError(null);
            setEditing(true);
          }}
          className="text-black-300 hover:text-purple-500 transition-colors"
          title="Edit in-house delivery commission"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitDraft();
            if (e.key === "Escape") setEditing(false);
          }}
          disabled={busy}
          autoFocus
          className="w-16 px-1.5 py-1 text-xs text-right tabular-nums rounded-md border border-purple-300 text-black-900 focus:outline-none focus:border-purple-500"
        />
        <span className="text-xs text-black-400">%</span>
        <button
          type="button"
          onClick={submitDraft}
          disabled={busy}
          className="text-[10px] font-semibold text-white bg-purple-500 hover:bg-purple-400 rounded-md px-2 py-1 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={busy}
          className="text-[10px] font-medium text-black-500 hover:text-black-700 px-1"
        >
          Cancel
        </button>
      </span>
      {overridePct != null && (
        <button
          type="button"
          onClick={() => save(null)}
          disabled={busy}
          className="text-[10px] text-black-400 hover:text-purple-500 underline underline-offset-2"
        >
          Reset to default ({fmt(platformDefaultPct)})
        </button>
      )}
      {error && <span className="text-[10px] text-cinnabar-500 max-w-[140px]">{error}</span>}
    </span>
  );
}
