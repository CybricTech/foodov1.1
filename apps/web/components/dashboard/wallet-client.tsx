"use client";

import { useState, useMemo } from "react";
import { formatKobo } from "@foodo/utils";
import { Clock, X, ChevronRight } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type TxnRow = {
  id: string;
  type: string;
  direction: string;
  amount_kobo: number;
  status: string;
  description: string | null;
  available_at: string | null;
  created_at: string;
  order_id: string | null;
};

type SettlementRow = {
  id: string;
  amount_kobo: number;
  status: string;
  settlement_type: string;
  bank_reference: string | null;
  receipt_url: string | null;
  period_date: string | null;
  order_count: number;
  gross_total_kobo: number;
  paystack_transfer_code: string | null;
  paystack_transfer_ref: string | null;
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
  settlement_id: string | null;
  dispatch_type: string | null;
  fulfillment_type: string;
  status: string;
  created_at: string;
};

type ActiveTab = "activity" | "payouts";

interface WalletClientProps {
  restaurantId: string;
  transactions: TxnRow[];
  settlements: SettlementRow[];
  orders: OrderRow[];
  platformSettings: { merchantChargePct: number; deliveryCommissionPct: number };
}

/* ------------------------------------------------------------------ */
/*  Fee helpers — mirrors merchant-settlement-detail-client exactly     */
/* ------------------------------------------------------------------ */

function deliveryCommissionFor(o: OrderRow, defaultPct: number): number {
  const fee = o.delivery_fee_kobo ?? 0;
  if (fee === 0) return 0;
  if (o.dispatch_type === "platform_rider") return fee;
  if (o.dispatch_type === "own_rider" || o.dispatch_type === "third_party") {
    return Math.round(fee * defaultPct);
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function groupByDate<T extends { created_at: string }>(items: T[]): Array<{ label: string; items: T[] }> {
  const groups: Map<string, T[]> = new Map();
  for (const item of items) {
    const label = formatDateGroup(item.created_at);
    const existing = groups.get(label);
    if (existing) existing.push(item);
    else groups.set(label, [item]);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function extractOrderNumber(description: string | null, fallback: string | null): string {
  if (description) {
    const match = description.match(/#([A-Z0-9-]+)/);
    if (match) return `Order #${match[1]}`;
  }
  if (fallback) return `Order #${fallback}`;
  return "Order";
}

function extractBankRef(bankRef: string | null, paystackRef: string | null): string | null {
  return bankRef ?? paystackRef ?? null;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function WalletClient({
  restaurantId: _restaurantId,
  transactions,
  settlements,
  orders,
  platformSettings,
}: WalletClientProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("activity");
  const [exporting, setExporting] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<SettlementRow | null>(null);

  const { merchantChargePct, deliveryCommissionPct } = platformSettings;

  // Compute all monetary stats from orders using the same formula as the admin settlement page.
  // This guarantees wallet and admin are always consistent, regardless of what was stored in
  // wallet_transactions or settlements.amount_kobo at the time of recording.
  const { netBySettlement, pendingBalance, totalWithdrawn, totalOrders, avgOrderNet } = useMemo(() => {
    const map: Record<string, number> = {};
    let totalEarned = 0;
    let pendingBalance = 0;

    for (const o of orders) {
      const gross = (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0);
      const merchantCharge = Math.round(gross * merchantChargePct);
      const deliveryFees = deliveryCommissionFor(o, deliveryCommissionPct);
      const net = gross - merchantCharge - deliveryFees;

      totalEarned += net;
      if (!o.settlement_id) pendingBalance += net;
      else map[o.settlement_id] = (map[o.settlement_id] ?? 0) + net;
    }

    // Use the stored settlement amount (what was actually transferred), not the
    // amount re-derived from orders with today's fee rates. The two diverge
    // whenever fee percentages change between when a settlement was recorded and
    // now — and using stored amounts keeps this number consistent with admin.
    const totalWithdrawn = settlements
      .filter((s) => s.status === "paid")
      .reduce((sum, s) => sum + s.amount_kobo, 0);

    const avgOrderNet = orders.length > 0 ? Math.round(totalEarned / orders.length) : 0;
    return { netBySettlement: map, pendingBalance, totalWithdrawn, totalOrders: orders.length, avgOrderNet };
  }, [orders, settlements, merchantChargePct, deliveryCommissionPct]);

  // Group orders by settlement_id for the detail modal
  const ordersBySettlement = useMemo(() => {
    const map: Record<string, OrderRow[]> = {};
    for (const o of orders) {
      if (!o.settlement_id) continue;
      if (!map[o.settlement_id]) map[o.settlement_id] = [];
      map[o.settlement_id].push(o);
    }
    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return map;
  }, [orders]);

  const activityItems = transactions.filter((t) => t.type === "order_credit");
  const activityGroups = groupByDate(activityItems);
  const payoutGroups = groupByDate(settlements);

  async function handleExport() {
    setExporting(true);
    try {
      const rows = [
        ["Date", "Order", "Amount", "Status"],
        ...activityItems.map((t) => [
          new Date(t.created_at).toLocaleDateString("en-NG"),
          extractOrderNumber(t.description, t.order_id),
          (t.amount_kobo / 100).toFixed(2),
          t.status,
        ]),
      ];
      const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wallet-activity-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="md:p-6 pb-24">
      <style>{`
        @keyframes walletFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blobFloat {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50%       { transform: translate(-10px, -12px) scale(1.04); }
        }
        @keyframes blobFloat2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50%       { transform: translate(8px, -8px) scale(1.06); }
        }
        @keyframes statFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Page label */}
      <div className="px-4 md:px-0 pt-4 md:pt-0 mb-3">
        <p className="text-xs font-semibold text-black-400 uppercase tracking-widest">Wallet</p>
      </div>

      {/* Balance card — full-bleed on mobile, rounded on desktop */}
      <div
        className="mx-4 md:mx-0 mb-4 rounded-3xl overflow-hidden relative"
        style={{
          background: "linear-gradient(140deg, #10002B 0%, #3C096C 55%, #7B2CBF 100%)",
          animation: "walletFadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        {/* Decorative blobs */}
        <div
          className="absolute -top-12 -right-12 w-52 h-52 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.06)", animation: "blobFloat 7s ease-in-out infinite" }}
        />
        <div
          className="absolute -bottom-14 -right-8 w-60 h-60 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.04)", animation: "blobFloat2 9s ease-in-out infinite" }}
        />
        <div
          className="absolute top-1/2 -left-16 w-36 h-36 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.03)", animation: "blobFloat 11s ease-in-out infinite reverse" }}
        />

        <div className="relative px-6 pt-8 pb-7">
          {/* Label */}
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>
            Expected Payout
          </p>

          {/* Balance — hero */}
          <p className="text-5xl font-black text-white tracking-tight leading-none">
            {formatKobo(pendingBalance)}
          </p>
          <p className="text-xs mt-2.5" style={{ color: "rgba(255,255,255,0.38)" }}>
            Earnings awaiting your next settlement
          </p>

          {/* Footer row */}
          <div
            className="mt-7 pt-4 flex items-center justify-between"
            style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 flex-shrink-0" style={{ color: "rgba(255,255,255,0.35)" }} />
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                {totalOrders.toLocaleString()} orders processed
              </span>
            </div>
            <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.25)" }}>
              KITCHYN
            </span>
          </div>
        </div>
      </div>

      {/* Secondary stats — 3 equal columns */}
      <div className="grid grid-cols-3 gap-2.5 px-4 md:px-0 mb-6">
        {[
          { label: "Total Paid Out", value: formatKobo(totalWithdrawn), sub: "Lifetime" },
          { label: "Total Orders",   value: totalOrders.toLocaleString(), sub: "All time" },
          { label: "Avg Order",      value: formatKobo(avgOrderNet),      sub: "Net per order" },
        ].map(({ label, value, sub }, i) => (
          <div
            key={label}
            className="bg-white rounded-2xl border border-black-100 px-3 py-3 text-center"
            style={{ animation: `statFadeUp 0.35s cubic-bezier(0.22,1,0.36,1) ${0.1 + i * 0.06}s both` }}
          >
            <p className="text-[10px] font-semibold text-black-400 uppercase tracking-wide leading-none mb-1.5 truncate">
              {label}
            </p>
            <p className="text-sm font-extrabold text-black-900 leading-none truncate">{value}</p>
            <p className="text-[10px] text-black-400 mt-1 truncate">{sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs + content */}
      <div className="px-4 md:px-0">
        <div className="flex gap-1 bg-black-100 rounded-xl p-1 w-fit mb-4">
          {(["activity", "payouts"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
                activeTab === tab
                  ? "bg-white text-black-900 shadow-sm"
                  : "text-black-500 hover:text-black-700"
              }`}
            >
              {tab === "activity" ? "Activity" : "Payouts"}
            </button>
          ))}
        </div>

        {/* Activity tab */}
        {activeTab === "activity" && (
          <>
            <div className="flex items-center justify-end mb-3">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="text-sm text-purple-500 border border-purple-500 px-4 py-1.5 rounded-xl hover:bg-purple-50 disabled:opacity-60 transition-colors font-medium"
              >
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
              {activityItems.length === 0 ? (
                <p className="text-black-400 text-sm text-center py-10">No earnings yet</p>
              ) : (
                <div>
                  {activityGroups.map(({ label, items }) => (
                    <div key={label}>
                      <div className="px-4 py-2 bg-black-50 border-b border-black-100">
                        <p className="text-xs font-semibold text-black-400 uppercase tracking-wide">{label}</p>
                      </div>
                      <div className="divide-y divide-black-100">
                        {items.map((t) => <ActivityRow key={t.id} txn={t} />)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Payouts tab — settlements table, net computed from orders */}
        {activeTab === "payouts" && (
          <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
            {settlements.length === 0 ? (
              <p className="text-black-400 text-sm text-center py-10">No payouts yet</p>
            ) : (
              <div>
                {payoutGroups.map(({ label, items }) => (
                  <div key={label}>
                    <div className="px-4 py-2 bg-black-50 border-b border-black-100">
                      <p className="text-xs font-semibold text-black-400 uppercase tracking-wide">{label}</p>
                    </div>
                    <div className="divide-y divide-black-100">
                      {items.map((s) => (
                        <SettlementPayoutRow
                          key={s.id}
                          settlement={s}
                          computedNet={netBySettlement[s.id] ?? s.amount_kobo}
                          onClick={() => setSelectedSettlement(s)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedSettlement && (
        <PayoutDetailModal
          settlement={selectedSettlement}
          computedNet={netBySettlement[selectedSettlement.id] ?? selectedSettlement.amount_kobo}
          orders={ordersBySettlement[selectedSettlement.id] ?? []}
          merchantChargePct={merchantChargePct}
          deliveryCommissionPct={deliveryCommissionPct}
          onClose={() => setSelectedSettlement(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Row components                                                      */
/* ------------------------------------------------------------------ */

function ActivityRow({ txn }: { txn: TxnRow }) {
  const orderLabel = extractOrderNumber(txn.description, txn.order_id);
  const date = new Date(txn.created_at).toLocaleDateString("en-NG", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-9 rounded-full bg-viridian-50 flex items-center justify-center flex-shrink-0">
        <span className="text-viridian-600 text-sm font-bold">₦</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-black-900">{orderLabel}</p>
        <p className="text-xs text-black-400 mt-0.5">{date}</p>
      </div>
      <div className="text-right flex-shrink-0 space-y-1">
        <p className="text-sm font-bold text-viridian-600">+{formatKobo(txn.amount_kobo)}</p>
        <TxnStatusBadge status={txn.status} />
      </div>
    </div>
  );
}

function SettlementPayoutRow({
  settlement,
  computedNet,
  onClick,
}: {
  settlement: SettlementRow;
  computedNet: number;
  onClick?: () => void;
}) {
  const ref = extractBankRef(settlement.bank_reference, settlement.paystack_transfer_ref);
  const date = new Date(settlement.initiated_at || settlement.created_at).toLocaleDateString("en-NG", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black-25 transition-colors"
    >
      <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
        <BankIcon />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-black-900">Payout</p>
        <p className="text-xs text-black-400 mt-0.5">
          {date}
          {settlement.order_count ? ` · ${settlement.order_count} orders` : ""}
          {settlement.period_date ? ` · ${settlement.period_date}` : ""}
          {ref ? ` · ${ref}` : ""}
        </p>
        {settlement.failure_reason && (
          <p className="text-xs text-cinnabar-500 mt-0.5">{settlement.failure_reason}</p>
        )}
      </div>
      <div className="text-right flex-shrink-0 space-y-1">
        <p className="text-sm font-bold text-black-900">-{formatKobo(computedNet)}</p>
        <SettlementStatusBadge status={settlement.status} />
      </div>
      <ChevronRight size={16} className="text-black-300 flex-shrink-0" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Payout Detail Modal                                                 */
/* ------------------------------------------------------------------ */

function PayoutDetailModal({
  settlement,
  computedNet,
  orders,
  merchantChargePct,
  deliveryCommissionPct,
  onClose,
}: {
  settlement: SettlementRow;
  computedNet: number;
  orders: OrderRow[];
  merchantChargePct: number;
  deliveryCommissionPct: number;
  onClose: () => void;
}) {
  // Recompute totals from orders for the breakdown
  let gross = 0;
  let merchantChargeTotal = 0;
  let deliveryFeesTotal = 0;
  for (const o of orders) {
    const oGrossLocal = (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0);
    gross += oGrossLocal;
    merchantChargeTotal += Math.round(oGrossLocal * merchantChargePct);
    deliveryFeesTotal += deliveryCommissionFor(o, deliveryCommissionPct);
  }
  // Fall back to settlement's stored gross if orders aren't available
  if (orders.length === 0) gross = settlement.gross_total_kobo;

  const dateLabel = new Date(settlement.created_at).toLocaleDateString("en-NG", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl md:rounded-2xl border border-black-200 w-full md:max-w-lg md:mx-4 max-h-[85vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black-100 flex-shrink-0">
          <div>
            <h3 className="font-bold text-black-900">Payout Details</h3>
            <p className="text-xs text-black-400 mt-0.5">{dateLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black-100 transition-colors">
            <X size={18} className="text-black-400" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {/* Amount + status */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-black-400">Net Payout</p>
              <p className="text-2xl font-extrabold text-black-900">{formatKobo(computedNet)}</p>
            </div>
            <SettlementStatusBadge status={settlement.status} />
          </div>

          {/* Breakdown */}
          {orders.length > 0 && (
            <div className="bg-black-50 rounded-xl px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between text-black-600">
                <span>Gross Total</span>
                <span className="tabular-nums font-medium">{formatKobo(gross)}</span>
              </div>
              <div className="flex justify-between text-purple-600">
                <span>− Merchant Charge</span>
                <span className="tabular-nums">({formatKobo(merchantChargeTotal)})</span>
              </div>
              <div className="flex justify-between text-purple-600">
                <span>− Delivery Fees</span>
                <span className="tabular-nums">({formatKobo(deliveryFeesTotal)})</span>
              </div>
              <div className="border-t border-black-200 pt-2 flex justify-between font-bold text-black-900">
                <span>= Net Payout</span>
                <span className="tabular-nums">{formatKobo(computedNet)}</span>
              </div>
            </div>
          )}

          {/* Reference */}
          {(settlement.bank_reference || settlement.paystack_transfer_ref) && (
            <div className="text-sm text-black-500">
              Ref: <span className="font-medium text-black-700">{settlement.bank_reference ?? settlement.paystack_transfer_ref}</span>
            </div>
          )}

          {/* Orders list */}
          <div>
            <p className="text-xs font-semibold text-black-400 uppercase tracking-wide mb-2">
              Orders in this payout ({orders.length})
            </p>
            {orders.length === 0 ? (
              <p className="text-sm text-black-400">No order details available.</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => {
                  const oGross = (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0);
                  const oMC = Math.round(oGross * merchantChargePct);
                  const oDC = deliveryCommissionFor(o, deliveryCommissionPct);
                  const oNet = oGross - oMC - oDC;
                  return (
                    <div
                      key={o.id}
                      className="flex items-center justify-between bg-white border border-black-100 rounded-xl px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-black-900">{o.order_number}</p>
                        <p className="text-xs text-black-400">
                          {new Date(o.created_at).toLocaleDateString("en-NG", {
                            day: "numeric", month: "short",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-black-900">{formatKobo(oNet)}</p>
                        <p className="text-[10px] text-black-400">of {formatKobo(oGross)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function TxnStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-dixie-100 text-dixie-600",
    available: "bg-viridian-100 text-viridian-600",
    settled: "bg-black-100 text-black-400",
  };
  const labels: Record<string, string> = { pending: "Pending", available: "Available", settled: "Paid" };
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? "bg-black-100 text-black-400"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function SettlementStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-dixie-100 text-dixie-600",
    processing: "bg-purple-100 text-purple-600",
    paid: "bg-viridian-100 text-viridian-600",
    failed: "bg-cinnabar-100 text-cinnabar-500",
  };
  const labels: Record<string, string> = {
    pending: "Pending", processing: "Processing", paid: "Paid", failed: "Failed",
  };
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${styles[status] ?? "bg-black-100 text-black-400"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function BankIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-purple-500"
      aria-hidden="true"
    >
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </svg>
  );
}
