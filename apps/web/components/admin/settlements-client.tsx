"use client";

import { useState } from "react";
import { formatKobo } from "@foodo/utils";

type SettlementRow = {
  id: string;
  restaurant_id: string;
  amount_kobo: number;
  status: string;
  paystack_transfer_code: string | null;
  paystack_transfer_ref: string | null;
  failure_reason: string | null;
  initiated_at: string;
  paid_at: string | null;
  created_at: string;
  restaurants: { name: string; slug: string } | null;
};

type WalletRow = {
  restaurant_id: string;
  pending_balance_kobo: number;
  available_balance_kobo: number;
  total_earned_kobo: number;
  total_withdrawn_kobo: number;
  restaurants: { name: string; paystack_recipient_code: string | null } | null;
};

type PlatformSettings = {
  service_charge_pct: number;
  service_charge_fixed_kobo: number;
  settlement_hold_hours: number;
} | null;

interface SettlementsClientProps {
  settlements: SettlementRow[];
  pendingWallets: WalletRow[];
  settings: PlatformSettings;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-dixie-100 text-dixie-600",
  processing: "bg-purple-100 text-purple-600",
  paid: "bg-viridian-100 text-viridian-600",
  failed: "bg-cinnabar-100 text-cinnabar-500",
};

export function SettlementsClient({
  settlements,
  pendingWallets,
  settings,
}: SettlementsClientProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [triggering, setTriggering] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState<Record<string, string>>({});

  // Service charge config form state
  const [pct, setPct] = useState(
    settings ? (Number(settings.service_charge_pct) * 100).toFixed(1) : "3.0"
  );
  const [fixedNgn, setFixedNgn] = useState(
    settings ? (settings.service_charge_fixed_kobo / 100).toFixed(0) : "0"
  );
  const [holdHours, setHoldHours] = useState(
    settings ? String(settings.settlement_hold_hours) : "24"
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  const filtered = settlements.filter(
    (s) => statusFilter === "all" || s.status === statusFilter
  );

  async function triggerSettlement(restaurantId: string) {
    setTriggering(restaurantId);
    try {
      const res = await fetch("/api/admin/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurant_id: restaurantId }),
      });
      const data = await res.json();
      setTriggerResult((prev) => ({
        ...prev,
        [restaurantId]: res.ok ? "Settlement triggered" : (data.error ?? "Failed"),
      }));
    } catch {
      setTriggerResult((prev) => ({ ...prev, [restaurantId]: "Network error" }));
    }
    setTriggering(null);
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError("");
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_charge_pct: parseFloat(pct) / 100,
          service_charge_fixed_kobo: Math.round(parseFloat(fixedNgn) * 100),
          settlement_hold_hours: parseInt(holdHours),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSettingsError(data.error ?? "Failed to save");
      } else {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 3000);
      }
    } catch {
      setSettingsError("Network error");
    }
    setSavingSettings(false);
  }

  return (
    <div className="space-y-8">
      {/* Wallets with available balance */}
      {pendingWallets.length > 0 && (
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-black-200">
            <h2 className="font-bold text-black-900 text-sm">
              Ready to Settle ({pendingWallets.length})
            </h2>
          </div>
          <div className="divide-y divide-black-100">
            {pendingWallets.map((w) => {
              const name = w.restaurants?.name ?? "Unknown";
              const hasRecipient = !!w.restaurants?.paystack_recipient_code;
              const result = triggerResult[w.restaurant_id];
              return (
                <div
                  key={w.restaurant_id}
                  className="flex items-center gap-4 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-black-900 truncate">{name}</p>
                    <p className="text-xs text-black-400 mt-0.5">
                      Available: {formatKobo(w.available_balance_kobo)}
                      {!hasRecipient && (
                        <span className="ml-2 text-cinnabar-500">No bank account</span>
                      )}
                    </p>
                    {result && (
                      <p className="text-xs text-viridian-500 mt-0.5">{result}</p>
                    )}
                  </div>
                  <button
                    onClick={() => triggerSettlement(w.restaurant_id)}
                    disabled={!hasRecipient || triggering === w.restaurant_id}
                    className="text-sm bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white font-medium px-4 py-1.5 rounded-xl transition-colors flex-shrink-0"
                  >
                    {triggering === w.restaurant_id ? "Processing…" : "Trigger"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Settlements history */}
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200 flex flex-wrap gap-2 items-center justify-between">
          <h2 className="font-bold text-black-900 text-sm">Settlement History</h2>
          <div className="flex gap-2 flex-wrap">
            {(["all", "pending", "processing", "paid", "failed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 text-xs rounded-lg font-medium border capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-purple-500 text-white border-purple-500"
                    : "bg-white text-black-500 border-black-200 hover:bg-black-50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-black-400 text-sm text-center py-10">No settlements found</p>
        ) : (
          <div className="divide-y divide-black-100">
            {filtered.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-black-900 truncate">
                    {s.restaurants?.name ?? "Unknown"}
                  </p>
                  <p className="text-xs text-black-400 mt-0.5">
                    {new Date(s.created_at).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {s.paystack_transfer_ref ? ` · ${s.paystack_transfer_ref}` : ""}
                  </p>
                  {s.failure_reason && (
                    <p className="text-xs text-cinnabar-500 mt-0.5">{s.failure_reason}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-black-900">
                    {formatKobo(s.amount_kobo)}
                  </p>
                  <span
                    className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                      STATUS_STYLES[s.status] ?? "bg-black-100 text-black-500"
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Service charge config */}
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200">
          <h2 className="font-bold text-black-900 text-sm">Platform Fee Configuration</h2>
          <p className="text-xs text-black-400 mt-0.5">
            Changes apply to new orders only
          </p>
        </div>
        <form onSubmit={saveSettings} className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">
                Service charge %
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  className="w-full px-4 py-2.5 pr-8 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-black-400">%</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">
                Fixed fee (₦)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={fixedNgn}
                onChange={(e) => setFixedNgn(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">
                Hold period (hours)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={holdHours}
                onChange={(e) => setHoldHours(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          {settingsError && (
            <p className="text-xs text-cinnabar-500">{settingsError}</p>
          )}
          <button
            type="submit"
            disabled={savingSettings}
            className="bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            {savingSettings ? "Saving…" : settingsSaved ? "✓ Saved!" : "Save configuration"}
          </button>
        </form>
      </div>
    </div>
  );
}
