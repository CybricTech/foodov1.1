"use client";

import { useState, useMemo } from "react";
import { formatKobo } from "@foodo/utils";
import Link from "next/link";
import { Download, ChevronDown, ChevronRight } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type OrderRow = {
  id: string;
  order_number: string;
  restaurant_id: string;
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  service_fee_kobo: number;
  vat_kobo: number;
  settlement_id: string | null;
  dispatch_type: string | null;
  fulfillment_type: string;
  status: string;
  created_at: string;
  restaurants: { name: string } | null;
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
  platformSettings: { serviceFeeFixedKobo: number; deliveryCommissionPct: number };
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

export function SettlementsClient({
  orders,
  settlements,
  merchantSummaries,
  platformSettings,
}: SettlementsClientProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [merchantSearch, setMerchantSearch] = useState("");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [exportingDate, setExportingDate] = useState<string | null>(null);

  const { serviceFeeFixedKobo, deliveryCommissionPct } = platformSettings;

  /* ── Revenue aggregation ────────────────────────────────────────────────── */

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status !== "cancelled" && o.status !== "pending"),
    [orders]
  );

  const revenue = useMemo(() => {
    let grossVolume = 0;
    let totalDeliveryFees = 0;

    for (const o of completedOrders) {
      grossVolume += (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0);
      totalDeliveryFees += o.delivery_fee_kobo ?? 0;
    }

    const totalServiceFees = completedOrders.length * serviceFeeFixedKobo;
    const totalCommissions = Math.round(totalDeliveryFees * deliveryCommissionPct);
    const netSettled = settlements
      .filter((s) => s.status === "paid")
      .reduce((sum, s) => sum + s.amount_kobo, 0);

    return { grossVolume, totalServiceFees, totalCommissions, netSettled };
  }, [completedOrders, settlements, serviceFeeFixedKobo, deliveryCommissionPct]);

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
        let deliveryTotal = 0;
        for (const o of dayOrders) {
          gross += (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0);
          deliveryTotal += o.delivery_fee_kobo ?? 0;
        }
        const serviceFees = dayOrders.length * serviceFeeFixedKobo;
        const commission = Math.round(deliveryTotal * deliveryCommissionPct);
        const net = gross - serviceFees - commission;
        const allSettled = dayOrders.every((o) => o.settlement_id != null);

        // Build merchant breakdown for expanded view
        const merchantMap: Record<string, { name: string; orders: number; gross: number }> = {};
        for (const o of dayOrders) {
          const rid = o.restaurant_id;
          if (!merchantMap[rid]) {
            merchantMap[rid] = { name: o.restaurants?.name ?? "Unknown", orders: 0, gross: 0 };
          }
          merchantMap[rid].orders++;
          merchantMap[rid].gross += (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0);
        }

        return {
          date,
          orderCount: dayOrders.length,
          gross,
          serviceFees,
          commission,
          net,
          allSettled,
          merchants: Object.values(merchantMap),
        };
      });
  }, [completedOrders, serviceFeeFixedKobo, deliveryCommissionPct]);

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
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
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

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard label="Gross Volume" value={formatKobo(revenue.grossVolume)} sublabel="All completed orders" />
        <SummaryCard label="Total Service Fees" value={formatKobo(revenue.totalServiceFees)} sublabel={`₦${(serviceFeeFixedKobo / 100).toFixed(0)} × ${completedOrders.length} orders`} />
        <SummaryCard label="Total Commissions" value={formatKobo(revenue.totalCommissions)} sublabel={`${(deliveryCommissionPct * 100).toFixed(0)}% delivery commission`} />
        <SummaryCard label="Net Settled Amount" value={formatKobo(revenue.netSettled)} sublabel="Paid to merchants" highlight="green" />
        <div className="bg-white rounded-2xl border border-black-200 px-4 py-4 flex flex-col justify-between">
          <p className="text-xs text-black-500 font-medium">Payout Window</p>
          <p className="text-sm font-bold text-black-900 mt-1">9 AM – 12 PM WAT</p>
          <p className="text-[10px] text-black-400 mt-0.5">Next: {nextSettlement}</p>
        </div>
      </div>

      {/* ── Daily Payout Summary ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200">
          <h2 className="font-bold text-black-900 text-sm">Daily Payout Summary</h2>
          <p className="text-xs text-black-400 mt-0.5">
            {dailyGroups.length} days · Click to expand merchant breakdown
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black-100 bg-black-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-black-500 w-8" />
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-black-500">Date</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Orders</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Gross Total</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Service Fees</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Delivery Commission</th>
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

      {/* ── Merchant Settlements ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-black-900 text-sm">Merchant Settlements</h2>
              <p className="text-xs text-black-400 mt-0.5">
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
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-black-500">Restaurant</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Total Earned</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Total Paid</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-black-500">Outstanding</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-black-500">Bank</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-black-500">Payouts</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-black-500" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black-50">
              {merchantSummaries
                .filter((m) =>
                  !merchantSearch.trim() ||
                  m.restaurant_name.toLowerCase().includes(merchantSearch.toLowerCase())
                )
                .map((m) => {
                  const outstanding = m.available_balance_kobo + m.pending_balance_kobo;
                  return (
                    <tr key={m.restaurant_id} className="hover:bg-black-25 transition-colors group">
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
                  <td colSpan={7} className="text-center py-10 text-black-400 text-sm">
                    No merchants found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Settlement History ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200 flex flex-wrap gap-2 items-center justify-between">
          <div>
            <h2 className="font-bold text-black-900 text-sm">Settlement History</h2>
            <p className="text-xs text-black-400 mt-0.5">
              Recorded payouts to restaurants
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
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${TYPE_STYLES[s.settlement_type] ?? TYPE_STYLES.automatic}`}>
                      {s.settlement_type}
                    </span>
                  </div>
                  <p className="text-xs text-black-400 mt-0.5">
                    {s.period_date ? `Period: ${s.period_date} · ` : ""}
                    {s.order_count > 0 ? `${s.order_count} orders · ` : ""}
                    {new Date(s.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    {s.bank_reference ? ` · Ref: ${s.bank_reference}` : ""}
                    {s.paystack_transfer_ref ? ` · ${s.paystack_transfer_ref}` : ""}
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
    serviceFees: number;
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
    weekday: "short", day: "numeric", month: "short",
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
        <td className="px-4 py-2.5 text-right tabular-nums text-black-700">{formatKobo(day.gross)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-purple-600">{formatKobo(day.serviceFees)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-purple-600">{formatKobo(day.commission)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-black-900">{formatKobo(day.net)}</td>
        <td className="px-4 py-2.5 text-center">
          <span
            className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              day.allSettled ? "bg-viridian-100 text-viridian-600" : "bg-dixie-100 text-dixie-600"
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
                  <span>{m.name} ({m.orders} orders)</span>
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
      <p className={`text-lg font-bold mt-1 ${highlight === "green" ? "text-viridian-600" : "text-black-900"}`}>
        {value}
      </p>
      <p className="text-[10px] text-black-400 mt-0.5">{sublabel}</p>
    </div>
  );
}
