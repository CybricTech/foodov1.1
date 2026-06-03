"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { formatKobo, computeOrderNet } from "@foodo/utils";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Restaurant = { id: string; name: string; slug: string };

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string | null;
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  service_fee_kobo: number;
  vat_kobo: number;
  total_kobo: number;
  discount_kobo: number;
  discount_code: string | null;
  settlement_id: string | null;
  dispatch_type: string | null;
  fulfillment_type: string;
  status: string;
  created_at: string;
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
  canonical_net_kobo: number | null;
  paystack_transfer_ref: string | null;
  monnify_disbursement_reference: string | null;
  initiated_at: string;
  paid_at: string | null;
  created_at: string;
};

interface Props {
  restaurant: Restaurant;
  date: string;
  orders: OrderRow[];
  settlements: Settlement[];
  platformSettings: { merchantChargePct: number; deliveryCommissionPct: number };
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function paystackTotal(o: OrderRow): number {
  return (
    o.total_kobo ||
    (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0) + (o.service_fee_kobo ?? 0)
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-dixie-100 text-dixie-600",
  processing: "bg-purple-100 text-purple-600",
  paid: "bg-viridian-100 text-viridian-600",
  failed: "bg-cinnabar-100 text-cinnabar-500",
};

/* ── Component ─────────────────────────────────────────────────────────────── */

export function SettlementDayDetailClient({
  restaurant,
  date,
  orders,
  settlements,
  platformSettings,
}: Props) {
  const { merchantChargePct, deliveryCommissionPct } = platformSettings;
  const [orderFilter, setOrderFilter] = useState<"all" | "settled" | "unsettled">("all");
  const [search, setSearch] = useState("");

  /* ── Day aggregate (canonical math) ─────────────────────────────────────── */
  const totals = useMemo(() => {
    const fees = { merchantChargePct, deliveryCommissionPct };
    let gross = 0;
    let merchantCharge = 0;
    let serviceFee = 0;
    let deliveryCommission = 0;
    let discount = 0;
    let collected = 0;
    let net = 0;
    let unsettled = 0;
    for (const o of orders) {
      const n = computeOrderNet(o, fees);
      gross += n.gross;
      merchantCharge += n.merchantCharge;
      serviceFee += o.service_fee_kobo ?? 0;
      deliveryCommission += n.deliveryCommission;
      discount += o.discount_kobo ?? 0;
      collected += paystackTotal(o);
      net += n.net;
      if (!o.settlement_id) unsettled++;
    }
    const foodoRevenue = merchantCharge + deliveryCommission + serviceFee;
    return {
      gross,
      merchantCharge,
      serviceFee,
      serviceMerchantCharge: serviceFee + merchantCharge,
      deliveryCommission,
      discount,
      collected,
      net,
      foodoRevenue,
      unsettled,
    };
  }, [orders, merchantChargePct, deliveryCommissionPct]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (orderFilter === "settled" && !o.settlement_id) return false;
      if (orderFilter === "unsettled" && o.settlement_id) return false;
      if (q) {
        const hay = `${o.order_number ?? ""} ${o.customer_name ?? ""} ${o.discount_code ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, orderFilter, search]);

  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const allSettled = totals.unsettled === 0;

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Link
          href={`/admin/settlements/${restaurant.id}`}
          className="mt-1 p-2 rounded-xl hover:bg-black-100 transition-colors"
        >
          <ArrowLeft size={18} className="text-black-500" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-black-900">{restaurant.name}</h1>
          <p className="text-black-500 text-sm mt-0.5">
            Settlement block · {dateLabel} · {orders.length} order{orders.length === 1 ? "" : "s"}
          </p>
        </div>
        <span
          className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
            allSettled ? "bg-viridian-100 text-viridian-600" : "bg-dixie-100 text-dixie-600"
          }`}
        >
          {allSettled ? <CheckCircle2 size={14} /> : null}
          {allSettled ? "Settled" : `${totals.unsettled} unsettled`}
        </span>
      </div>

      {/* ── Day summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card label="Orders" value={String(orders.length)} sublabel="In this block" />
        <Card label="Gross Total" value={formatKobo(totals.gross)} sublabel="Subtotal + VAT + Delivery" />
        <Card
          label="Discounts"
          value={formatKobo(totals.discount)}
          sublabel="Merchant-funded"
          highlight={totals.discount > 0 ? "red" : undefined}
        />
        <Card
          label="Service + Merchant Charge"
          value={formatKobo(totals.serviceMerchantCharge)}
          sublabel="Foodo fees"
        />
        <Card label="Delivery Fees" value={formatKobo(totals.deliveryCommission)} sublabel="Dispatch commission" />
        <Card label="Net Payout" value={formatKobo(totals.net)} sublabel="Owed to merchant" highlight="green" />
      </div>

      {/* ── Money trail ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black-200 px-4 py-3">
        <h2 className="font-bold text-black-900 text-sm mb-2">Money Trail</h2>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <Trail label="Collected from customers" value={formatKobo(totals.collected)} />
          <Trail label="− Customer service fees" value={formatKobo(totals.serviceFee)} tone="purple" />
          <Trail label="− Merchant charge" value={formatKobo(totals.merchantCharge)} tone="purple" />
          <Trail label="− Delivery commission" value={formatKobo(totals.deliveryCommission)} tone="purple" />
          <Trail label="= Foodo revenue" value={formatKobo(totals.foodoRevenue)} tone="green" />
          <Trail label="= Net payout to merchant" value={formatKobo(totals.net)} bold />
        </div>
        {totals.discount > 0 && (
          <p className="text-[11px] text-cinnabar-500 mt-2">
            Includes {formatKobo(totals.discount)} in merchant-funded discounts — already deducted from the
            amount collected, so the merchant bears the cost.
          </p>
        )}
      </div>

      {/* ── Recorded payout(s) for this day ────────────────────────────────── */}
      {settlements.length > 0 && (
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-black-200">
            <h2 className="font-bold text-black-900 text-sm">Recorded Payout</h2>
          </div>
          <div className="divide-y divide-black-100">
            {settlements.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-black-900">{formatKobo(s.amount_kobo)}</p>
                  <p className="text-xs text-black-400 mt-0.5">
                    {s.order_count > 0 ? `${s.order_count} orders · ` : ""}
                    {new Date(s.created_at).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {s.bank_reference ? ` · Ref: ${s.bank_reference}` : ""}
                    {(s.monnify_disbursement_reference ?? s.paystack_transfer_ref)
                      ? ` · ${s.monnify_disbursement_reference ?? s.paystack_transfer_ref}`
                      : ""}
                  </p>
                  {s.canonical_net_kobo != null && s.canonical_net_kobo !== s.amount_kobo && (
                    <p className="text-xs text-cinnabar-500 mt-0.5">
                      Canonical net: {formatKobo(s.canonical_net_kobo)} (Δ{" "}
                      {formatKobo(s.amount_kobo - s.canonical_net_kobo)})
                    </p>
                  )}
                </div>
                <span
                  className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
                    STATUS_STYLES[s.status] ?? "bg-black-100 text-black-500"
                  }`}
                >
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Per-Order Fee Breakdown ────────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h2 className="font-bold text-black-900">Per-Order Fee Breakdown</h2>
          <p className="text-sm text-black-400">The exact fee components applied to every order in this block</p>
        </div>
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-black-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <p className="text-xs text-black-400">
                {filteredOrders.length} of {orders.length} orders
              </p>
              <div className="flex gap-2 flex-wrap items-center">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search order, customer or code…"
                  className="px-3 py-1.5 text-xs rounded-lg border border-black-200 text-black-900 focus:outline-none focus:border-purple-500 w-56"
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
                  <th className="text-left px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">Order #</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">Customer</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">Time</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">Subtotal</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">Discount</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">VAT</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">Del. Fee</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">Cust. Svc Fee</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-black-900 whitespace-nowrap">Total Paid</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-purple-600 whitespace-nowrap">
                    Merch. Charge ({(merchantChargePct * 100).toFixed(0)}%)
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">Dispatch</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-purple-600 whitespace-nowrap">Del. Commission</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-viridian-600 whitespace-nowrap">Foodo Revenue</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-black-900 whitespace-nowrap">Merchant Net</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-black-500 whitespace-nowrap">Settled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black-50">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="text-center py-8 text-black-400">
                      No orders found
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => {
                    const pTotal = paystackTotal(o);
                    const { merchantCharge, deliveryCommission: delCommission, net: merchantNet } =
                      computeOrderNet(o, { merchantChargePct, deliveryCommissionPct });
                    const foodoRevenue = merchantCharge + delCommission + (o.service_fee_kobo ?? 0);
                    const dispatchLabel =
                      o.fulfillment_type !== "delivery"
                        ? null
                        : o.dispatch_type === "platform_rider"
                        ? { text: "Platform", pct: "100%", style: "bg-purple-100 text-purple-700" }
                        : o.dispatch_type === "own_rider"
                        ? { text: "In-House", pct: `${(deliveryCommissionPct * 100).toFixed(0)}%`, style: "bg-black-100 text-black-700" }
                        : o.dispatch_type === "third_party"
                        ? { text: "3rd Party", pct: `${(deliveryCommissionPct * 100).toFixed(0)}%`, style: "bg-blue-100 text-blue-700" }
                        : { text: "Pending", pct: "", style: "bg-dixie-100 text-dixie-700" };
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
                          {o.customer_name ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-black-500 whitespace-nowrap">{timeLabel}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-black-700">
                          {formatKobo(o.subtotal_kobo)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-cinnabar-500 whitespace-nowrap">
                          {o.discount_kobo > 0 ? (
                            <span title={o.discount_code ?? undefined}>−{formatKobo(o.discount_kobo)}</span>
                          ) : (
                            <span className="text-black-300">—</span>
                          )}
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
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-black-900">
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
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Subcomponents ─────────────────────────────────────────────────────────── */

function Card({
  label,
  value,
  sublabel,
  highlight,
}: {
  label: string;
  value: string;
  sublabel: string;
  highlight?: "green" | "amber" | "red";
}) {
  const bg =
    highlight === "green"
      ? "border-viridian-200 bg-viridian-50"
      : highlight === "amber"
      ? "border-dixie-200 bg-dixie-50"
      : highlight === "red"
      ? "border-cinnabar-200 bg-cinnabar-100"
      : "bg-white border-black-200";
  const text =
    highlight === "green"
      ? "text-viridian-600"
      : highlight === "amber"
      ? "text-dixie-600"
      : highlight === "red"
      ? "text-cinnabar-500"
      : "text-black-900";

  return (
    <div className={`rounded-2xl border px-4 py-4 ${bg}`}>
      <p className="text-xs text-black-500 font-medium">{label}</p>
      <p className={`text-lg font-bold mt-1 ${text}`}>{value}</p>
      <p className="text-[10px] text-black-400 mt-0.5">{sublabel}</p>
    </div>
  );
}

function Trail({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: "purple" | "green";
  bold?: boolean;
}) {
  const color =
    tone === "purple" ? "text-purple-600" : tone === "green" ? "text-viridian-600" : "text-black-700";
  return (
    <div>
      <p className="text-[11px] text-black-400">{label}</p>
      <p className={`tabular-nums ${bold ? "font-bold text-black-900" : `font-medium ${color}`}`}>{value}</p>
    </div>
  );
}
