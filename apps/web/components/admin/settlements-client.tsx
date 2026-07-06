"use client";

import { useState, useMemo, useCallback } from "react";
import { formatKobo, computeOrderNet, gatewayFee } from "@foodo/utils";
import Link from "next/link";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import { PayoutControls, MerchantPayoutToggle, MerchantCommissionEditor } from "./payout-controls";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type OrderRow = {
  id: string;
  order_number: string;
  restaurant_id: string;
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  service_fee_kobo: number;
  vat_kobo: number;
  total_kobo: number;
  delivery_cost_kobo: number | null;
  settlement_id: string | null;
  dispatch_type: string | null;
  fulfillment_type: string;
  status: string;
  created_at: string;
  restaurants: { name: string } | null;
  /** Effective in-house commission for this order's merchant (override or platform default). */
  delivery_commission_pct: number;
  restaurant_has_paystack: boolean;
};

type SettlementRow = {
  id: string;
  restaurant_id: string;
  amount_kobo: number;
  status: string;
  settlement_type: string;
  bank_reference: string | null;
  period_date: string | null;
  order_count: number;
  gross_total_kobo: number;
  service_fee_total_kobo: number;
  delivery_commission_kobo: number;
  paystack_transfer_code: string | null;
  paystack_transfer_ref: string | null;
  monnify_disbursement_reference?: string | null;
  monnify_transaction_reference?: string | null;
  failure_reason: string | null;
  initiated_at: string;
  paid_at: string | null;
  created_at: string;
  restaurants: { name: string; slug: string } | null;
};

type MerchantSummary = {
  restaurant_id: string;
  restaurant_name: string;
  restaurant_slug: string;
  has_bank_account: boolean;
  auto_payout_enabled: boolean;
  /** Raw per-merchant commission override; null = inherits the platform default. */
  delivery_commission_pct_override: number | null;
  pending_balance_kobo: number;
  available_balance_kobo: number;
  total_earned_kobo: number;
  total_withdrawn_kobo: number;
  total_paid_kobo: number;
  total_pending_settlement_kobo: number;
  settlement_count: number;
};

interface SettlementsClientProps {
  orders: OrderRow[];
  settlements: SettlementRow[];
  merchantSummaries: MerchantSummary[];
  platformSettings: { merchantChargePct: number; deliveryCommissionPct: number };
  autoPayout: { enabled: boolean; shadow: boolean };
  /** Live Paystack balance (kobo) that transfers draw from; null if unreadable. */
  paystackBalanceKobo: number | null;
}

/* ── Tabs ──────────────────────────────────────────────────────────────────── */

type TabKey = "payouts" | "merchants" | "history" | "pnl" | "orders";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: "payouts", label: "Daily Payouts", hint: "Record & track per-day merchant payouts" },
  { key: "merchants", label: "Merchants", hint: "Per-merchant balances & bank status" },
  { key: "history", label: "Payout History", hint: "Every transfer, chronological" },
  { key: "pnl", label: "Kitchyn P&L", hint: "Daily revenue & Paystack reconciliation" },
  { key: "orders", label: "Orders", hint: "Per-order fee breakdown" },
];

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function toWATDate(iso: string): string {
  const d = new Date(iso);
  const wat = new Date(d.getTime() + 60 * 60 * 1000);
  return wat.toISOString().slice(0, 10);
}

function paystackTotal(o: OrderRow): number {
  return (
    o.total_kobo ||
    (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0) + (o.service_fee_kobo ?? 0)
  );
}

// Payment-gateway fee model is the canonical Paystack 1.5% + ₦100/txn
// (₦100 waived under ₦2,500, capped at ₦2,000) from @foodo/utils. gatewayFee()
// is applied per order below (line ~262) and summed, so the per-transaction
// ₦100 scales with order count. See the gatewayFee docs in
// packages/utils/src/settlements.ts for the reconciliation evidence.

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

export function SettlementsClient({
  orders,
  settlements,
  merchantSummaries,
  platformSettings,
  autoPayout,
  paystackBalanceKobo,
}: SettlementsClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("payouts");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [merchantSearch, setMerchantSearch] = useState("");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [exportingDate, setExportingDate] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<"all" | "settled" | "unsettled">("all");
  const [orderSearch, setOrderSearch] = useState("");

  const { merchantChargePct, deliveryCommissionPct } = platformSettings;

  // Per-order fee settings: the commission rate is merchant-effective (override
  // or platform default), resolved server-side and carried on each order row.
  const feesFor = useCallback(
    (o: OrderRow) => ({
      merchantChargePct,
      deliveryCommissionPct: o.delivery_commission_pct ?? deliveryCommissionPct,
    }),
    [merchantChargePct, deliveryCommissionPct]
  );

  /* ── Revenue aggregation ────────────────────────────────────────────────── */

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status !== "cancelled" && o.status !== "pending"),
    [orders]
  );

  const revenue = useMemo(() => {
    let grossVolume = 0;
    let totalMerchantCharge = 0;
    let totalCustomerServiceFees = 0;
    let totalCommissions = 0;

    for (const o of completedOrders) {
      const n = computeOrderNet(o, feesFor(o));
      grossVolume += n.gross;
      totalMerchantCharge += n.merchantCharge;
      totalCustomerServiceFees += o.service_fee_kobo ?? 0;
      totalCommissions += n.deliveryCommission;
    }

    const totalFoodoRevenue = totalMerchantCharge + totalCommissions + totalCustomerServiceFees;
    const netSettled = settlements
      .filter((s) => s.status === "paid")
      .reduce((sum, s) => sum + s.amount_kobo, 0);

    return {
      grossVolume,
      totalMerchantCharge,
      totalCommissions,
      totalCustomerServiceFees,
      totalFoodoRevenue,
      netSettled,
    };
  }, [completedOrders, settlements, feesFor]);

  /* ── Daily grouped orders ───────────────────────────────────────────────── */

  const dailyGroups = useMemo(() => {
    const groups: Record<string, OrderRow[]> = {};
    for (const o of completedOrders) {
      const day = toWATDate(o.created_at);
      if (!groups[day]) groups[day] = [];
      groups[day].push(o);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, dayOrders]) => {
        let gross = 0;
        let merchantChargeTotal = 0;
        let commission = 0;
        for (const o of dayOrders) {
          const n = computeOrderNet(o, feesFor(o));
          gross += n.gross;
          merchantChargeTotal += n.merchantCharge;
          commission += n.deliveryCommission;
        }
        const net = gross - merchantChargeTotal - commission;
        const allSettled = dayOrders.every((o) => o.settlement_id != null);

        const merchantMap: Record<string, { name: string; orders: number; gross: number }> = {};
        for (const o of dayOrders) {
          const rid = o.restaurant_id;
          if (!merchantMap[rid]) {
            merchantMap[rid] = { name: o.restaurants?.name ?? "Unknown", orders: 0, gross: 0 };
          }
          merchantMap[rid].orders++;
          merchantMap[rid].gross += computeOrderNet(o, feesFor(o)).gross;
        }

        return {
          date,
          orderCount: dayOrders.length,
          gross,
          merchantChargeTotal,
          commission,
          net,
          allSettled,
          merchants: Object.values(merchantMap),
        };
      });
  }, [completedOrders, feesFor]);

  /* ── Daily Foodo P&L ─────────────────────────────────────────────────────
   * Per-day picture of money flow:
   *   - Customer paid: total_kobo (what hits Paystack)
   *   - Paystack fee:  what Paystack deducts before depositing
   *   - Paystack payout: customer paid − fees (deposited next day)
   *   - Service fees:  100% Foodo
   *   - Merchant charge: 1% × customer total
   *   - Delivery margin: customer-paid delivery fees − rider costs we paid
   *   - Foodo net:     service + merchant_charge + delivery_margin − paystack_fee
   */
  const dailyPnl = useMemo(() => {
    // Only count orders from merchants integrated with Foodo's Paystack.
    // Test/non-Paystack merchants don't generate deposits to our account, so
    // including them would inflate the "Paystack → Us" column and break the
    // reconciliation against your Paystack settlement file.
    const realOrders = completedOrders.filter((o) => o.restaurant_has_paystack);
    const groups: Record<string, OrderRow[]> = {};
    for (const o of realOrders) {
      const day = toWATDate(o.created_at);
      if (!groups[day]) groups[day] = [];
      groups[day].push(o);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, dayOrders]) => {
        let customerTotal = 0;
        let paystackFees = 0;
        let serviceFees = 0;
        let merchantCharge = 0;
        let customerDeliveryFees = 0;
        let riderCosts = 0;
        let ownCommission = 0;
        let pendingPlatformDeliveries = 0;
        for (const o of dayOrders) {
          const pTotal = paystackTotal(o);
          customerTotal += pTotal;
          paystackFees += gatewayFee(pTotal);
          serviceFees += o.service_fee_kobo ?? 0;
          merchantCharge += Math.round(pTotal * merchantChargePct);

          const fee = o.delivery_fee_kobo ?? 0;
          if (o.dispatch_type === "platform_rider") {
            // Only recognise margin once the order is delivered — that's when
            // the rider cost is known. Undelivered orders aren't realised P&L.
            if (o.status === "delivered" && o.delivery_cost_kobo != null) {
              customerDeliveryFees += fee;
              riderCosts += o.delivery_cost_kobo;
            } else {
              pendingPlatformDeliveries++;
            }
          } else if (o.dispatch_type === "own_rider" || o.dispatch_type === "third_party") {
            // Foodo's slice of own/third-party delivery: the merchant's
            // effective commission rate (override or platform default). No
            // rider cost on our side — the merchant pays the rider directly.
            ownCommission += Math.round(fee * (o.delivery_commission_pct ?? deliveryCommissionPct));
          }
        }
        const paystackPayout = customerTotal - paystackFees;
        const deliveryMargin = customerDeliveryFees - riderCosts + ownCommission;
        const foodoNet = serviceFees + merchantCharge + deliveryMargin - paystackFees;
        return {
          date,
          orderCount: dayOrders.length,
          customerTotal,
          paystackFees,
          paystackPayout,
          serviceFees,
          merchantCharge,
          customerDeliveryFees,
          riderCosts,
          ownCommission,
          deliveryMargin,
          pendingPlatformDeliveries,
          foodoNet,
        };
      });
  }, [completedOrders, merchantChargePct, deliveryCommissionPct]);

  /* ── Per-order breakdown filter ─────────────────────────────────────────── */

  const filteredOrderBreakdown = useMemo(() => {
    return completedOrders.filter((o) => {
      const matchesFilter =
        orderFilter === "all" ||
        (orderFilter === "settled" && o.settlement_id != null) ||
        (orderFilter === "unsettled" && o.settlement_id == null);
      const q = orderSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (o.order_number ?? "").toLowerCase().includes(q) ||
        (o.restaurants?.name ?? "").toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [completedOrders, orderFilter, orderSearch]);

  /* ── Settlement history filter ──────────────────────────────────────────── */

  const filteredSettlements = settlements.filter(
    (s) => statusFilter === "all" || s.status === statusFilter
  );

  /* ── Next settlement time ───────────────────────────────────────────────── */

  const nextSettlement = useMemo(() => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(8, 0, 0, 0); // 9 AM WAT
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.toLocaleDateString("en-NG", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  /* ── Export CSV ─────────────────────────────────────────────────────────── */

  async function exportCSV(date: string) {
    setExportingDate(date);
    try {
      const res = await fetch(`/api/admin/settlements/export?date=${date}`);
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foodo-payout-${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Network error");
    }
    setExportingDate(null);
  }

  function toggleDay(date: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-5">

      {/* ── Section 1: Revenue Overview ── persistent KPI header, always visible above the tabs */}
      <section className="space-y-3">
        <SectionHeader
          title="Revenue Overview"
          subtitle="Lifetime totals across the platform"
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard
            label="Gross Volume"
            value={formatKobo(revenue.grossVolume)}
            sublabel="Subtotal + VAT + Delivery"
          />
          <SummaryCard
            label="Merchant Charge"
            value={formatKobo(revenue.totalMerchantCharge)}
            sublabel={`${(merchantChargePct * 100).toFixed(0)}% of Paystack totals`}
          />
          <SummaryCard
            label="Delivery Commission"
            value={formatKobo(revenue.totalCommissions)}
            sublabel={`100% platform · ${(deliveryCommissionPct * 100).toFixed(0)}% in-house default (per-merchant)`}
          />
          <SummaryCard
            label="Customer Svc Fees"
            value={formatKobo(revenue.totalCustomerServiceFees)}
            sublabel="1% + ₦200 per order (customer)"
          />
          <SummaryCard
            label="Total Kitchyn Revenue"
            value={formatKobo(revenue.totalFoodoRevenue)}
            sublabel="Merch charge + commission + svc fees"
            highlight="green"
          />
          <div className="bg-white rounded-2xl border border-black-200 px-4 py-4 flex flex-col justify-between">
            <p className="text-xs text-black-500 font-medium">Net Settled</p>
            <p className="text-lg font-bold text-black-900 mt-1">{formatKobo(revenue.netSettled)}</p>
            <p className="text-[10px] text-black-400 mt-0.5">Next payout: {nextSettlement}</p>
          </div>
        </div>
      </section>

      {/* ── Tab navigation ── keeps the 5 data areas one click apart instead of a long scroll */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-black-25/80 backdrop-blur supports-[backdrop-filter]:bg-black-25/60 border-b border-black-100">
        <div className="flex gap-2 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              title={t.hint}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                activeTab === t.key
                  ? "bg-purple-500 text-white border-purple-500"
                  : "bg-white text-black-600 border-black-200 hover:bg-black-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section 2: Daily Foodo P&L ────────────────────────────────────── */}
      {activeTab === "pnl" && (
      <section className="space-y-3">
        <SectionHeader
          title="Daily Kitchyn P&L"
          subtitle="What we made each day, what Paystack deposits next, and our delivery margin"
        />
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black-100 bg-black-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-black-500">Date</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Orders</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Customer Paid</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Paystack Fee</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Paystack → Us</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Service Fees</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Merchant Chg</th>
                  <th
                    className="text-right px-4 py-2.5 text-xs font-semibold text-black-500"
                    title="Customer-paid delivery fees minus rider costs we paid (platform riders only)"
                  >
                    Delivery Margin
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Kitchyn Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black-50">
                {dailyPnl.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-black-400 text-sm">
                      No completed orders found
                    </td>
                  </tr>
                ) : (
                  dailyPnl.map((d) => (
                    <tr key={d.date} className="hover:bg-black-25">
                      <td className="px-4 py-3 text-black-900 font-medium whitespace-nowrap">
                        {new Date(d.date).toLocaleDateString("en-NG", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-black-700">{d.orderCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-black-900 font-medium">
                        {formatKobo(d.customerTotal)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-cinnabar-500">
                        −{formatKobo(d.paystackFees)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-black-900 font-semibold">
                        {formatKobo(d.paystackPayout)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-purple-600">
                        {formatKobo(d.serviceFees)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-purple-600">
                        {formatKobo(d.merchantCharge)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-medium ${
                          d.deliveryMargin >= 0 ? "text-purple-600" : "text-cinnabar-500"
                        }`}
                        title={`Platform: customer paid ${formatKobo(d.customerDeliveryFees)}, rider cost ${formatKobo(d.riderCosts)} · Own/3rd commission ${formatKobo(d.ownCommission)}${d.pendingPlatformDeliveries > 0 ? ` · ${d.pendingPlatformDeliveries} platform order(s) pending delivery` : ""}`}
                      >
                        <span>
                          {d.deliveryMargin >= 0 ? "" : "−"}
                          {formatKobo(Math.abs(d.deliveryMargin))}
                        </span>
                        {d.pendingPlatformDeliveries > 0 && (
                          <span className="ml-1 text-[9px] text-dixie-500 font-normal">
                            +{d.pendingPlatformDeliveries} pending
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-bold ${
                          d.foodoNet >= 0 ? "text-viridian-600" : "text-cinnabar-500"
                        }`}
                      >
                        {d.foodoNet >= 0 ? "" : "−"}
                        {formatKobo(Math.abs(d.foodoNet))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-black-100 bg-black-50 text-[11px] text-black-400">
            Only includes orders from merchants integrated with Kitchyn&rsquo;s Paystack (test merchants excluded). Paystack fee: 1.5% + ₦100/order (₦100 waived under ₦2,500, capped at ₦2,000). Delivery margin uses rider costs from delivered platform-rider orders only.
          </div>
        </div>
      </section>
      )}

      {/* ── Section 3: Daily Payout Summary ───────────────────────────────── */}
      {activeTab === "payouts" && (
      <section className="space-y-3">
        <PayoutControls
          initialEnabled={autoPayout.enabled}
          initialShadow={autoPayout.shadow}
          balanceKobo={paystackBalanceKobo}
          enrolledOwedKobo={merchantSummaries
            .filter((m) => m.auto_payout_enabled)
            .reduce((sum, m) => sum + (m.pending_balance_kobo || 0), 0)}
        />
        <SectionHeader
          title="Daily Payout Summary"
          subtitle="Per-day breakdown of merchant payouts · click any row to expand by merchant"
        />
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200">
          <p className="text-xs text-black-400">{dailyGroups.length} days</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black-100 bg-black-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-black-500 w-8" />
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-black-500">Date</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Orders</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Gross Total</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Merchant Charge</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">
                  Delivery Commission
                </th>
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
                  const expanded = expandedDays.has(day.date);
                  return (
                    <DailyRow
                      key={day.date}
                      day={day}
                      expanded={expanded}
                      onToggle={() => toggleDay(day.date)}
                      onExport={() => exportCSV(day.date)}
                      exporting={exportingDate === day.date}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </section>
      )}

      {/* ── Section 4: Merchant Directory ─────────────────────────────────── */}
      {activeTab === "merchants" && (
      <section className="space-y-3">
        <SectionHeader
          title="Merchant Directory"
          subtitle="Per-merchant balances, paid-out totals, and bank-account status"
        />
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <p className="text-xs text-black-400">
                {merchantSummaries.length} restaurants · Click to view details
              </p>
            </div>
            <input
              type="text"
              value={merchantSearch}
              onChange={(e) => setMerchantSearch(e.target.value)}
              placeholder="Search restaurant…"
              className="px-3 py-1.5 text-xs rounded-lg border border-black-200 text-black-900 focus:outline-none focus:border-purple-500 w-48"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black-100 bg-black-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-black-500">
                  Restaurant
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">
                  Total Earned
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">
                  Total Paid
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">
                  Outstanding
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-black-500">Bank</th>
                <th
                  className="text-center px-4 py-2.5 text-xs font-semibold text-black-500"
                  title="Kitchyn's commission on this merchant's own/third-party delivery fees"
                >
                  In-house %
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-black-500">
                  Auto-pay
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-black-500">
                  Payouts
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-black-500" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black-50">
              {merchantSummaries
                .filter(
                  (m) =>
                    !merchantSearch.trim() ||
                    m.restaurant_name.toLowerCase().includes(merchantSearch.toLowerCase())
                )
                .map((m) => {
                  const outstanding = m.available_balance_kobo + m.pending_balance_kobo;
                  return (
                    <tr
                      key={m.restaurant_id}
                      className="hover:bg-black-25 transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-black-900 truncate max-w-[200px]">
                          {m.restaurant_name}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-black-700">
                        {formatKobo(m.total_earned_kobo)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-viridian-600 font-medium">
                        {formatKobo(m.total_paid_kobo)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-black-900">
                        {formatKobo(outstanding)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            m.has_bank_account ? "bg-viridian-500" : "bg-cinnabar-400"
                          }`}
                          title={m.has_bank_account ? "Bank account linked" : "No bank account"}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <MerchantCommissionEditor
                          restaurantId={m.restaurant_id}
                          restaurantName={m.restaurant_name}
                          initialOverridePct={m.delivery_commission_pct_override}
                          platformDefaultPct={deliveryCommissionPct}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <MerchantPayoutToggle
                          restaurantId={m.restaurant_id}
                          initialEnabled={m.auto_payout_enabled}
                          hasBankAccount={m.has_bank_account}
                        />
                      </td>
                      <td className="px-4 py-3 text-center text-black-500 tabular-nums">
                        {m.settlement_count}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/admin/settlements/${m.restaurant_id}`}
                          className="text-xs text-purple-500 hover:text-purple-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              {merchantSummaries.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-black-400 text-sm">
                    No merchants found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </section>
      )}

      {/* ── Section 5: Settlement History ─────────────────────────────────── */}
      {activeTab === "history" && (
      <section className="space-y-3">
        <SectionHeader
          title="Settlement History"
          subtitle="Chronological log of every payout transfer to merchants"
        />
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200 flex flex-wrap gap-2 items-center justify-between">
          <div>
            <p className="text-xs text-black-400">Recorded payouts to restaurants</p>
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
          <p className="text-black-400 text-sm text-center py-10">No settlements found</p>
        ) : (
          <div className="divide-y divide-black-100">
            {filteredSettlements.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-black-900 truncate">
                      {s.restaurants?.name ?? "Unknown"}
                    </p>
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                        TYPE_STYLES[s.settlement_type] ?? TYPE_STYLES.automatic
                      }`}
                    >
                      {s.settlement_type}
                    </span>
                  </div>
                  <p className="text-xs text-black-400 mt-0.5">
                    {s.period_date ? `Period: ${s.period_date} · ` : ""}
                    {s.order_count > 0 ? `${s.order_count} orders · ` : ""}
                    {new Date(s.created_at).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {s.bank_reference ? ` · Ref: ${s.bank_reference}` : ""}
                    {(s.monnify_disbursement_reference ?? s.paystack_transfer_ref)
                      ? ` · ${s.monnify_disbursement_reference ?? s.paystack_transfer_ref}`
                      : ""}
                  </p>
                  {s.failure_reason && (
                    <p className="text-xs text-cinnabar-500 mt-0.5">{s.failure_reason}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-black-900 tabular-nums">
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
      </section>
      )}

      {/* ── Section 6: Per-Order Fee Breakdown ────────────────────────────── */}
      {activeTab === "orders" && (
      <section className="space-y-3">
        <SectionHeader
          title="Per-Order Fee Breakdown"
          subtitle="Drill into every order and the exact fee components applied"
        />
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <p className="text-xs text-black-400">
                {filteredOrderBreakdown.length} of {completedOrders.length} orders
              </p>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search order or restaurant…"
                className="px-3 py-1.5 text-xs rounded-lg border border-black-200 text-black-900 focus:outline-none focus:border-purple-500 w-52"
              />
              {(["all", "settled", "unsettled"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setOrderFilter(f)}
                  className={`px-3 py-1 text-xs rounded-lg font-medium border capitalize transition-colors ${
                    orderFilter === f
                      ? "bg-purple-500 text-white border-purple-500"
                      : "bg-white text-black-500 border-black-200 hover:bg-black-50"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black-100 bg-black-50">
                <th className="text-left px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">
                  Order #
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">
                  Restaurant
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">
                  Date
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">
                  Subtotal
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">
                  VAT
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">
                  Del. Fee
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">
                  Cust. Svc Fee
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-black-900 whitespace-nowrap">
                  Paystack Total
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-purple-600 whitespace-nowrap">
                  Merch. Charge ({(merchantChargePct * 100).toFixed(0)}%)
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">
                  Dispatch
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-purple-600 whitespace-nowrap">
                  Del. Commission
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-viridian-600 whitespace-nowrap">
                  Kitchyn Revenue
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">
                  Merchant Net
                </th>
                <th className="text-center px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">
                  Settled
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black-50">
              {filteredOrderBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-8 text-black-400">
                    No orders found
                  </td>
                </tr>
              ) : (
                filteredOrderBreakdown.slice(0, 200).map((o) => {
                  const pTotal = paystackTotal(o);
                  const { merchantCharge, deliveryCommission: delCommission, net: merchantNet } =
                    computeOrderNet(o, feesFor(o));
                  const orderCommissionPct = o.delivery_commission_pct ?? deliveryCommissionPct;
                  const foodoRevenue = merchantCharge + delCommission + (o.service_fee_kobo ?? 0);
                  const dispatchLabel =
                    o.fulfillment_type !== "delivery"
                      ? null
                      : o.dispatch_type === "platform_rider"
                      ? { text: "Platform", pct: "100%", style: "bg-purple-100 text-purple-700" }
                      : o.dispatch_type === "own_rider"
                      ? { text: "In-House", pct: `${(orderCommissionPct * 100).toFixed(0)}%`, style: "bg-black-100 text-black-700" }
                      : o.dispatch_type === "third_party"
                      ? { text: "3rd Party", pct: `${(orderCommissionPct * 100).toFixed(0)}%`, style: "bg-blue-100 text-blue-700" }
                      : { text: "Pending", pct: "", style: "bg-dixie-100 text-dixie-700" };
                  const dateLabel = new Date(o.created_at).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                  });
                  const timeLabel = new Date(o.created_at).toLocaleTimeString("en-NG", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <tr key={o.id} className="hover:bg-black-25 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-black-700 whitespace-nowrap">
                        {o.order_number ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-black-700 max-w-[140px] truncate">
                        {o.restaurants?.name ?? "Unknown"}
                      </td>
                      <td className="px-3 py-2.5 text-black-500 whitespace-nowrap">
                        {dateLabel} {timeLabel}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-black-700">
                        {formatKobo(o.subtotal_kobo)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-black-500">
                        {formatKobo(o.vat_kobo)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-black-700">
                        {formatKobo(o.delivery_fee_kobo)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-black-500">
                        {formatKobo(o.service_fee_kobo)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-black-900">
                        {formatKobo(pTotal)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-purple-600">
                        {formatKobo(merchantCharge)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {dispatchLabel ? (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${dispatchLabel.style}`}>
                            {dispatchLabel.text}
                            {dispatchLabel.pct && <span className="opacity-70">· {dispatchLabel.pct}</span>}
                          </span>
                        ) : (
                          <span className="text-[10px] text-black-300">Pickup</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-purple-600">
                        {formatKobo(delCommission)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-viridian-600">
                        {formatKobo(foodoRevenue)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-black-700">
                        {formatKobo(merchantNet)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            o.settlement_id
                              ? "bg-viridian-100 text-viridian-600"
                              : "bg-dixie-100 text-dixie-600"
                          }`}
                        >
                          {o.settlement_id ? "Yes" : "No"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {filteredOrderBreakdown.length > 200 && (
            <p className="text-xs text-black-400 text-center py-3 border-t border-black-100">
              Showing 200 of {filteredOrderBreakdown.length} orders
            </p>
          )}
        </div>
      </div>
      </section>
      )}
    </div>
  );
}

/* ── Daily row subcomponent ────────────────────────────────────────────────── */

function DailyRow({
  day,
  expanded,
  onToggle,
  onExport,
  exporting,
}: {
  day: {
    date: string;
    orderCount: number;
    gross: number;
    merchantChargeTotal: number;
    commission: number;
    net: number;
    allSettled: boolean;
    merchants: { name: string; orders: number; gross: number }[];
  };
  expanded: boolean;
  onToggle: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const dateLabel = new Date(day.date + "T12:00:00").toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <>
      <tr className="hover:bg-black-25 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2.5">
          {expanded ? (
            <ChevronDown size={14} className="text-black-400" />
          ) : (
            <ChevronRight size={14} className="text-black-400" />
          )}
        </td>
        <td className="px-4 py-2.5 font-medium text-black-900 whitespace-nowrap">{dateLabel}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-black-700">{day.orderCount}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-black-700">
          {formatKobo(day.gross)}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-purple-600">
          {formatKobo(day.merchantChargeTotal)}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-purple-600">
          {formatKobo(day.commission)}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-black-900">
          {formatKobo(day.net)}
        </td>
        <td className="px-4 py-2.5 text-center">
          <span
            className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              day.allSettled
                ? "bg-viridian-100 text-viridian-600"
                : "bg-dixie-100 text-dixie-600"
            }`}
          >
            {day.allSettled ? "Settled" : "Pending"}
          </span>
        </td>
        <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
          {!day.allSettled && (
            <button
              onClick={onExport}
              disabled={exporting}
              className="inline-flex items-center gap-1 text-xs text-purple-500 hover:text-purple-400 font-medium disabled:opacity-50"
            >
              <Download size={12} />
              {exporting ? "…" : "CSV"}
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} className="bg-black-25 px-8 py-3">
            <div className="text-xs space-y-1">
              <p className="font-semibold text-black-600 mb-1.5">Merchant Breakdown</p>
              {day.merchants.map((m, i) => (
                <div key={i} className="flex justify-between text-black-600">
                  <span>
                    {m.name} ({m.orders} orders)
                  </span>
                  <span className="tabular-nums">{formatKobo(m.gross)}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Summary card subcomponent ─────────────────────────────────────────────── */

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-base font-extrabold text-black-900">{title}</h2>
      {subtitle && <p className="text-xs text-black-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sublabel,
  highlight,
}: {
  label: string;
  value: string;
  sublabel: string;
  highlight?: "green";
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-4 ${
        highlight === "green"
          ? "border-viridian-200 bg-viridian-50"
          : "bg-white border-black-200"
      }`}
    >
      <p className="text-xs text-black-500 font-medium">{label}</p>
      <p
        className={`text-lg font-bold mt-1 ${
          highlight === "green" ? "text-viridian-600" : "text-black-900"
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] text-black-400 mt-0.5">{sublabel}</p>
    </div>
  );
}
