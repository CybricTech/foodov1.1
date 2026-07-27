import { createServiceClient } from "@/lib/supabase/server";
import { getNgnBalanceKobo } from "@/lib/paystack";
import { resolveFinanceRange } from "@/lib/finance/date-range";
import { formatKobo } from "@foodo/utils";
import { FinanceTabs } from "@/components/admin/finance-tabs";

export const dynamic = "force-dynamic";

export default async function AdminFinanceCashPage() {
  const supabase = createServiceClient();

  // Keep wallet balances canonical before reading them (same as Settlements).
  await supabase.rpc("recompute_all_restaurant_wallets");

  // Live Paystack balance — best-effort: a Paystack outage must never break
  // this page, so fall back to null (UI shows "—").
  let paystackBalanceKobo: number | null = null;
  try {
    paystackBalanceKobo = await getNgnBalanceKobo();
  } catch {
    paystackBalanceKobo = null;
  }

  const thirtyDaysAgo = resolveFinanceRange({ period: "30d" });

  const [walletsRes, inFlightRes, cashInRes] = await Promise.all([
    supabase
      .from("restaurant_wallets")
      .select("pending_balance_kobo, available_balance_kobo, total_earned_kobo, total_withdrawn_kobo"),
    supabase
      .from("settlements")
      .select("amount_kobo, status")
      .in("status", ["pending", "processing"]),
    supabase.rpc("finance_summary", {
      p_from: thirtyDaysAgo.fromISO,
      p_to: thirtyDaysAgo.toISO,
    }),
  ]);

  if (walletsRes.error) console.error("restaurant_wallets read failed:", walletsRes.error);
  if (inFlightRes.error) console.error("settlements read failed:", inFlightRes.error);
  if (cashInRes.error) console.error("finance_summary failed:", cashInRes.error);

  const wallets = walletsRes.data ?? [];
  const pendingLiability = wallets.reduce((s, w) => s + (w.pending_balance_kobo ?? 0), 0);
  const availableBalance = wallets.reduce((s, w) => s + (w.available_balance_kobo ?? 0), 0);
  const totalEarned = wallets.reduce((s, w) => s + (w.total_earned_kobo ?? 0), 0);
  const totalWithdrawn = wallets.reduce((s, w) => s + (w.total_withdrawn_kobo ?? 0), 0);

  const inFlight = (inFlightRes.data ?? []).reduce((s, r) => s + (r.amount_kobo ?? 0), 0);

  const netCashIn30d = cashInRes.data?.[0]?.foodo_net_kobo ?? null;

  // Float guard (mirrors the Settlements payout float warning): transfers are
  // funded from the Paystack balance, which auto-settles to the bank daily.
  const balanceKnown = paystackBalanceKobo !== null;
  const shortfall =
    paystackBalanceKobo !== null && pendingLiability > 0 && paystackBalanceKobo < pendingLiability;

  return (
    <div className="p-6 pb-24 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-black-900">Finance</h1>
        <p className="text-black-500 text-sm mt-1">Cash position &amp; payout float</p>
      </div>

      <FinanceTabs />

      {shortfall && (
        <div className="rounded-2xl bg-cinnabar-100 border border-cinnabar-200 px-5 py-4">
          <p className="text-sm font-bold text-cinnabar-600">Payout float shortfall</p>
          <p className="text-xs text-cinnabar-500 mt-1">
            Paystack balance ({formatKobo(paystackBalanceKobo ?? 0)}) is below the outstanding
            settlement liability ({formatKobo(pendingLiability)}). Top up the Paystack
            balance or upcoming payouts will be skipped.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Metric
          label="Paystack balance"
          value={balanceKnown ? formatKobo(paystackBalanceKobo ?? 0) : "—"}
          sub={balanceKnown ? "live · payout float" : "unavailable — Paystack lookup failed"}
        />
        <Metric
          label="Outstanding settlement liability"
          value={formatKobo(pendingLiability)}
          sub="pending wallet balances across all merchants"
        />
        <Metric
          label="Settlements in flight"
          value={formatKobo(inFlight)}
          sub="status pending or processing"
        />
        <Metric
          label="Available wallet balance"
          value={formatKobo(availableBalance)}
          sub="cleared, awaiting payout"
        />
        <Metric
          label="Total earned (all time)"
          value={formatKobo(totalEarned)}
        />
        <Metric
          label="Total withdrawn (all time)"
          value={formatKobo(totalWithdrawn)}
        />
      </div>

      <div className="bg-white rounded-2xl border border-black-200 px-5 py-4">
        <p className="text-xs text-black-500 font-semibold uppercase tracking-wide">
          Net cash-in estimate · last 30 days
        </p>
        <p className="text-xl font-extrabold text-black-900 mt-1">
          {netCashIn30d != null ? formatKobo(netCashIn30d) : "—"}
        </p>
        <p className="text-xs text-black-400 mt-0.5">
          Kitchyn net (contribution) over the last 30 days — service fees + merchant
          charge + delivery margin − gateway fees. Paystack-integrated merchants only.
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-black-200 px-4 py-4">
      <p className="text-xs text-black-500 font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-xl font-extrabold text-black-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-black-400 mt-0.5">{sub}</p>}
    </div>
  );
}
