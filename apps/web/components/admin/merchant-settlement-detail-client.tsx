"use client";

import { useState, useMemo } from "react";
import { formatKobo, computeOrderNet } from "@foodo/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronRight, X } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  logistics_default: string | null;
  has_bank_account: boolean;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_code: string | null;
};

type Wallet = {
  pending_balance_kobo: number;
  available_balance_kobo: number;
  total_earned_kobo: number;
  total_withdrawn_kobo: number;
};

type Settlement = {
  id: string;
  amount_kobo: number;
  status: string;
  settlement_type: string;
  bank_reference: string | null;
  receipt_url: string | null;
  period_date: string | null;
  order_count: number;
  gross_total_kobo: number;
  service_fee_total_kobo: number;
  merchant_charge_total_kobo: number;
  delivery_commission_kobo: number;
  paystack_transfer_code: string | null;
  paystack_transfer_ref: string | null;
  monnify_disbursement_reference?: string | null;
  monnify_transaction_reference?: string | null;
  failure_reason: string | null;
  initiated_at: string;
  paid_at: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  order_number: string;
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  service_fee_kobo: number;
  vat_kobo: number;
  total_kobo: number;
  discount_kobo: number;
  /** True when the discount on this order was a merchant-funded loyalty reward. */
  loyalty_redeemed?: boolean;
  settlement_id: string | null;
  dispatch_type: string | null;
  fulfillment_type: string;
  status: string;
  created_at: string;
};

interface Props {
  restaurant: Restaurant;
  wallet: Wallet;
  settlements: Settlement[];
  orders: OrderRow[];
  platformSettings: { merchantChargePct: number; deliveryCommissionPct: number };
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function toWATDate(iso: string): string {
  const d = new Date(iso);
  const wat = new Date(d.getTime() + 60 * 60 * 1000);
  return wat.toISOString().slice(0, 10);
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-dixie-100 text-dixie-600",
  processing: "bg-purple-100 text-purple-600",
  paid: "bg-viridian-100 text-viridian-600",
  failed: "bg-cinnabar-100 text-cinnabar-500",
};

const TYPE_STYLES: Record<string, string> = {
  manual: "bg-blue-100 text-blue-600",
  automatic: "bg-black-100 text-black-500",
};

/* ── Component ─────────────────────────────────────────────────────────────── */

export function MerchantSettlementDetailClient({
  restaurant,
  wallet: _wallet,
  settlements,
  orders,
  platformSettings,
}: Props) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [settlementModal, setSettlementModal] = useState<string | null>(null);
  const [bankRef, setBankRef] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { merchantChargePct, deliveryCommissionPct } = platformSettings;

  /* ── Revenue aggregation ────────────────────────────────────────────────── */

  const totals = useMemo(() => {
    let grossRevenue = 0;
    let totalMerchantCharge = 0;
    let totalCommissions = 0;
    let totalDiscounts = 0;
    let totalLoyalty = 0;
    let unsettledCount = 0;

    const fees = { merchantChargePct, deliveryCommissionPct };
    for (const o of orders) {
      const n = computeOrderNet(o, fees);
      grossRevenue += n.gross;
      totalMerchantCharge += n.merchantCharge;
      totalCommissions += n.deliveryCommission;
      const d = o.discount_kobo ?? 0;
      totalDiscounts += d; // all merchant-funded reductions (promo + loyalty)
      if (o.loyalty_redeemed) totalLoyalty += d; // …of which loyalty rewards
      if (!o.settlement_id) unsettledCount++;
    }

    const totalFoodoFees = totalMerchantCharge + totalCommissions;

    const totalPaid = settlements
      .filter((s) => s.status === "paid")
      .reduce((sum, s) => sum + s.amount_kobo, 0);

    return { grossRevenue, totalFoodoFees, totalPaid, totalDiscounts, totalLoyalty, unsettledCount };
  }, [orders, settlements, merchantChargePct, deliveryCommissionPct]);

  /* ── Daily grouped orders ───────────────────────────────────────────────── */

  const dailyGroups = useMemo(() => {
    const groups: Record<string, OrderRow[]> = {};
    for (const o of orders) {
      const day = toWATDate(o.created_at);
      if (!groups[day]) groups[day] = [];
      groups[day].push(o);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, dayOrders]) => {
        // Sum per-order values so the daily Net Payout equals the sum of the
        // per-order "Merchant Net" column on the parent settlement page.
        // Foodo's revenue is split into two streams for display:
        //   - serviceMerchantCharge: customer service fee + merchant charge
        //   - deliveryFees: dispatch-aware delivery commission
        //     (100% of platform-rider fees, 10% of own/third-party fees)
        const fees = { merchantChargePct, deliveryCommissionPct };
        let gross = 0;
        let merchantCharge = 0;
        let serviceFee = 0;
        let deliveryFees = 0;
        let discount = 0;
        for (const o of dayOrders) {
          const n = computeOrderNet(o, fees);
          gross += n.gross;
          merchantCharge += n.merchantCharge;
          serviceFee += o.service_fee_kobo ?? 0;
          deliveryFees += n.deliveryCommission;
          discount += o.discount_kobo ?? 0;
        }
        const serviceMerchantCharge = serviceFee + merchantCharge;
        const net = gross - merchantCharge - deliveryFees;
        const allSettled = dayOrders.every((o) => o.settlement_id != null);
        const hasUnsettled = dayOrders.some((o) => o.settlement_id == null);

        return {
          date,
          orders: dayOrders,
          orderCount: dayOrders.length,
          gross,
          merchantCharge,
          serviceFee,
          serviceMerchantCharge,
          deliveryFees,
          discount,
          net,
          allSettled,
          hasUnsettled,
        };
      });
  }, [orders, merchantChargePct, deliveryCommissionPct]);

  /* ── Settlement history filter ──────────────────────────────────────────── */

  const filteredSettlements = settlements.filter(
    (s) => statusFilter === "all" || s.status === statusFilter
  );

  /* ── Record settlement ──────────────────────────────────────────────────── */

  async function recordSettlement() {
    if (!settlementModal || !bankRef.trim()) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetch("/api/admin/settlements/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          period_date: settlementModal,
          bank_reference: bankRef.trim(),
          receipt_url: receiptUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitResult({
          ok: true,
          message: `Settlement recorded — ${data.order_count} orders, Net payout: ${formatKobo(data.net_payout_kobo)}`,
        });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setSubmitResult({ ok: false, message: data.error ?? "Failed to record settlement" });
      }
    } catch {
      setSubmitResult({ ok: false, message: "Network error" });
    }
    setSubmitting(false);
  }

  // Get breakdown for modal
  const modalDay = settlementModal
    ? dailyGroups.find((d) => d.date === settlementModal)
    : null;

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Link href="/admin/settlements" className="mt-1 p-2 rounded-xl hover:bg-black-100 transition-colors">
          <ArrowLeft size={18} className="text-black-500" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-black-900">{restaurant.name}</h1>
          <p className="text-black-500 text-sm mt-0.5">
            Settlement details · {orders.length} orders · {settlements.length} payouts
          </p>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card label="Total Gross Revenue" value={formatKobo(totals.grossRevenue)} sublabel="Subtotal + VAT + Delivery" />
        <Card label="Total Foodo Fees" value={formatKobo(totals.totalFoodoFees)} sublabel="Service fees + commissions" />
        <Card
          label="Discounts & Rewards"
          value={formatKobo(totals.totalDiscounts)}
          sublabel={
            totals.totalLoyalty > 0
              ? `Merchant-funded · incl. ${formatKobo(totals.totalLoyalty)} loyalty`
              : "Merchant-funded reductions"
          }
          highlight={totals.totalDiscounts > 0 ? "red" : undefined}
        />
        <Card label="Total Paid Out" value={formatKobo(totals.totalPaid)} sublabel={`${settlements.filter((s) => s.status === "paid").length} payouts`} highlight="green" />
        <Card label="Unsettled Orders" value={String(totals.unsettledCount)} sublabel="Awaiting settlement" highlight={totals.unsettledCount > 0 ? "amber" : undefined} />
      </div>

      {/* ── Bank Account Info ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black-200 px-4 py-3">
        <h2 className="font-bold text-black-900 text-sm mb-2">Bank Account</h2>
        {restaurant.has_bank_account ? (
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs text-black-400">Account Name</p>
              <p className="font-medium text-black-900">{restaurant.bank_account_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-black-400">Account Number</p>
              <p className="font-medium text-black-900">{restaurant.bank_account_number ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-black-400">Bank Code</p>
              <p className="font-medium text-black-900">{restaurant.bank_code ?? "—"}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-viridian-500" />
              <span className="text-xs text-viridian-600 font-medium">Paystack linked</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-cinnabar-500">
            No bank account linked — restaurant cannot receive settlements
          </p>
        )}
      </div>

      {/* ── Daily Settlement Blocks ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200">
          <h2 className="font-bold text-black-900 text-sm">Daily Settlement Blocks</h2>
          <p className="text-xs text-black-400 mt-0.5">
            Orders grouped by date · {dailyGroups.length} days
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black-100 bg-black-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-black-500">Date</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Orders</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Gross Total</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Discounts</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">
                  <span className="block">Service +</span>
                  <span className="block">Merchant Charge</span>
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Delivery Fees</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Net Payout</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-black-500">Status</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-black-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black-50">
              {dailyGroups.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-black-400 text-sm">
                    No completed orders found
                  </td>
                </tr>
              ) : (
                dailyGroups.map((day) => {
                  const dateLabel = new Date(day.date + "T12:00:00").toLocaleDateString("en-NG", {
                    weekday: "short", day: "numeric", month: "short",
                  });
                  return (
                    <tr
                      key={day.date}
                      onClick={() => router.push(`/admin/settlements/${restaurant.id}/${day.date}`)}
                      className="hover:bg-black-25 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-2.5 font-medium text-black-900 whitespace-nowrap">{dateLabel}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-black-700">{day.orderCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-black-700">{formatKobo(day.gross)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-cinnabar-500">
                        {day.discount > 0 ? `−${formatKobo(day.discount)}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-purple-600">{formatKobo(day.serviceMerchantCharge)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-purple-600">{formatKobo(day.deliveryFees)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-black-900">{formatKobo(day.net)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {day.allSettled ? (
                          <CheckCircle2 size={16} className="text-viridian-500 inline" />
                        ) : (
                          <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-dixie-100 text-dixie-600">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {day.hasUnsettled && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSettlementModal(day.date);
                                setBankRef("");
                                setReceiptUrl("");
                                setSubmitResult(null);
                              }}
                              className="text-xs bg-purple-500 hover:bg-purple-400 text-white font-medium px-3 py-1 rounded-lg transition-colors"
                            >
                              Record Settlement
                            </button>
                          )}
                          <ChevronRight size={16} className="text-black-300" />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Payout History ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200 flex flex-wrap gap-2 items-center justify-between">
          <div>
            <h2 className="font-bold text-black-900 text-sm">Payout History</h2>
            <p className="text-xs text-black-400 mt-0.5">
              {settlements.length} total payouts · {formatKobo(totals.totalPaid)} paid
            </p>
          </div>
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

        {filteredSettlements.length === 0 ? (
          <p className="text-black-400 text-sm text-center py-10">No payouts found</p>
        ) : (
          <div className="divide-y divide-black-100">
            {filteredSettlements.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-black-900">{formatKobo(s.amount_kobo)}</p>
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${TYPE_STYLES[s.settlement_type] ?? TYPE_STYLES.automatic}`}>
                      {s.settlement_type}
                    </span>
                  </div>
                  <p className="text-xs text-black-400 mt-0.5">
                    {s.period_date ? `${s.period_date} · ` : ""}
                    {s.order_count > 0 ? `${s.order_count} orders · ` : ""}
                    {new Date(s.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {s.bank_reference ? ` · Ref: ${s.bank_reference}` : ""}
                    {(s.monnify_disbursement_reference ?? s.paystack_transfer_ref)
                      ? ` · ${s.monnify_disbursement_reference ?? s.paystack_transfer_ref}`
                      : ""}
                  </p>
                  {s.gross_total_kobo > 0 && (
                    <p className="text-xs text-black-400 mt-0.5">
                      Gross: {formatKobo(s.gross_total_kobo)} − Merchant charge: {formatKobo(s.merchant_charge_total_kobo ?? s.service_fee_total_kobo)} − Commission: {formatKobo(s.delivery_commission_kobo)}
                    </p>
                  )}
                  {s.failure_reason && <p className="text-xs text-cinnabar-500 mt-0.5">{s.failure_reason}</p>}
                </div>
                <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[s.status] ?? "bg-black-100 text-black-500"}`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Record Manual Settlement Modal ─────────────────────────────────── */}
      {settlementModal && modalDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSettlementModal(null)}>
          <div className="bg-white rounded-2xl border border-black-200 w-full max-w-lg mx-4 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-black-900">Record Manual Settlement</h3>
              <button onClick={() => setSettlementModal(null)} className="p-1 rounded-lg hover:bg-black-100 transition-colors">
                <X size={18} className="text-black-400" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div className="bg-black-50 rounded-xl px-4 py-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-black-600">
                  <span>Orders</span>
                  <span className="tabular-nums font-medium">{modalDay.orderCount}</span>
                </div>
                <div className="flex justify-between text-black-600">
                  <span>Gross Total</span>
                  <span className="tabular-nums font-medium">{formatKobo(modalDay.gross)}</span>
                </div>
                <div className="flex justify-between text-purple-600">
                  <span>− Merchant Charge</span>
                  <span className="tabular-nums">({formatKobo(modalDay.merchantCharge)})</span>
                </div>
                <div className="flex justify-between text-purple-600">
                  <span>− Delivery Fees</span>
                  <span className="tabular-nums">({formatKobo(modalDay.deliveryFees)})</span>
                </div>
                <div className="border-t border-black-200 pt-1.5 flex justify-between font-bold text-black-900">
                  <span>= Net Payout</span>
                  <span className="tabular-nums">{formatKobo(modalDay.net)}</span>
                </div>
                {modalDay.discount > 0 && (
                  <p className="text-[11px] text-cinnabar-500 pt-0.5">
                    Incl. {formatKobo(modalDay.discount)} in merchant-funded discounts (already deducted from gross — borne by the merchant).
                  </p>
                )}
              </div>

              {restaurant.has_bank_account && (
                <div className="bg-viridian-50 border border-viridian-200 rounded-xl px-4 py-2.5 text-xs text-viridian-700">
                  <span className="font-semibold">Pay to:</span> {restaurant.bank_account_name} · {restaurant.bank_account_number} · {restaurant.bank_code}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-black-500 mb-1">Bank Reference *</label>
                <input
                  type="text"
                  value={bankRef}
                  onChange={(e) => setBankRef(e.target.value)}
                  placeholder="e.g. NIP/241025/ABC123"
                  className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-black-500 mb-1">Receipt URL (optional)</label>
                <input
                  type="url"
                  value={receiptUrl}
                  onChange={(e) => setReceiptUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {submitResult && (
              <div className={`text-xs px-3 py-2 rounded-xl mb-3 ${submitResult.ok ? "bg-viridian-50 text-viridian-700 border border-viridian-200" : "bg-cinnabar-50 text-cinnabar-600 border border-cinnabar-200"}`}>
                {submitResult.message}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setSettlementModal(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-black-200 text-sm font-medium text-black-700 hover:bg-black-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={recordSettlement}
                disabled={submitting || !bankRef.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {submitting ? "Recording…" : `Record ${formatKobo(modalDay.net)} Payout`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Card subcomponent ─────────────────────────────────────────────────────── */

function Card({
  label, value, sublabel, highlight,
}: {
  label: string;
  value: string;
  sublabel: string;
  highlight?: "green" | "amber" | "red";
}) {
  const bg = highlight === "green" ? "border-viridian-200 bg-viridian-50" : highlight === "amber" ? "border-dixie-200 bg-dixie-50" : highlight === "red" ? "border-cinnabar-200 bg-cinnabar-100" : "bg-white border-black-200";
  const text = highlight === "green" ? "text-viridian-600" : highlight === "amber" ? "text-dixie-600" : highlight === "red" ? "text-cinnabar-500" : "text-black-900";

  return (
    <div className={`rounded-2xl border px-4 py-4 ${bg}`}>
      <p className="text-xs text-black-500 font-medium">{label}</p>
      <p className={`text-lg font-bold mt-1 ${text}`}>{value}</p>
      <p className="text-[10px] text-black-400 mt-0.5">{sublabel}</p>
    </div>
  );
}
