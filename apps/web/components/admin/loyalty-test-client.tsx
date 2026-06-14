"use client";

/**
 * Admin loyalty test panel — look up a phone's stamp balance for a restaurant's
 * program and reset it, so the earn→redeem loop can be re-run while testing
 * (e.g. on The Copper Pot). Talks to /api/admin/loyalty/test (super-admin only).
 */
import { useState } from "react";
import { Stamp, Search, RotateCcw } from "lucide-react";

type Restaurant = { id: string; name: string; isTest: boolean; active: boolean };
type LedgerRow = {
  id: string;
  delta: number;
  reason: string;
  order_id: string | null;
  created_at: string;
};
type Result = {
  programActive: boolean;
  rewardLabel: string;
  balance: number;
  required: number;
  remaining: number;
  redeemable: boolean;
  ledger: LedgerRow[];
};

export function LoyaltyTestClient({ restaurants }: { restaurants: Restaurant[] }) {
  const [restaurantId, setRestaurantId] = useState(restaurants[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function call(action: "lookup" | "reset") {
    if (!restaurantId || !phone.trim()) {
      setError("Pick a restaurant and enter a phone.");
      return;
    }
    if (action === "reset" && !confirm("Reset this customer's stamps to zero?")) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/loyalty/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, restaurantId, phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Request failed");
        setResult(null);
      } else {
        setResult(data as Result);
      }
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <Stamp size={20} className="text-purple-500" />
        <h1 className="text-2xl font-bold text-black-900">Loyalty test</h1>
      </div>
      <p className="text-black-500 text-sm mb-6">
        Inspect or reset a customer&rsquo;s stamp balance for a restaurant&rsquo;s program. Test
        merchants are listed first.
      </p>

      <div className="bg-white border border-black-100 rounded-2xl p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">
              Restaurant
            </label>
            <select
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm bg-white focus:outline-none focus:border-purple-500"
            >
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.isTest ? " (test)" : ""}
                  {r.active ? "" : " — program off"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">
              Customer phone
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+2348012345678"
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => call("lookup")}
            disabled={loading}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            <Search size={15} /> Look up
          </button>
          <button
            onClick={() => call("reset")}
            disabled={loading}
            className="flex items-center gap-1.5 border border-cinnabar-200 text-cinnabar-600 hover:bg-cinnabar-50 disabled:opacity-60 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            <RotateCcw size={15} /> Reset stamps
          </button>
        </div>

        {error && <p className="text-sm text-cinnabar-600">{error}</p>}
      </div>

      {result && (
        <div className="mt-5 bg-white border border-black-100 rounded-2xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-black-400 uppercase tracking-wide font-semibold">Balance</p>
              <p className="text-3xl font-extrabold text-black-900">
                {result.balance}
                <span className="text-lg text-black-400 font-bold"> / {result.required}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-black-900">{result.rewardLabel}</p>
              <p className="text-xs mt-0.5">
                {result.redeemable ? (
                  <span className="text-viridian-600 font-semibold">Reward ready to redeem</span>
                ) : (
                  <span className="text-black-500">{result.remaining} more to unlock</span>
                )}
                {!result.programActive && <span className="text-cinnabar-500"> · program inactive</span>}
              </p>
            </div>
          </div>

          <p className="text-[11px] font-bold text-black-400 uppercase tracking-wide mt-5 mb-2">
            Ledger ({result.ledger.length})
          </p>
          {result.ledger.length === 0 ? (
            <p className="text-sm text-black-400">No stamp activity yet.</p>
          ) : (
            <div className="divide-y divide-black-50">
              {result.ledger.map((row) => (
                <div key={row.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-black-700 capitalize">{row.reason}</span>
                    <span className="text-black-400">
                      {" · "}
                      {new Date(row.created_at).toLocaleString("en-NG", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <span
                    className={`font-bold tabular-nums ${
                      row.delta >= 0 ? "text-viridian-600" : "text-cinnabar-500"
                    }`}
                  >
                    {row.delta >= 0 ? `+${row.delta}` : row.delta}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
