"use client";

import Link from "next/link";
import { formatKobo } from "@foodo/utils";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface FinanceSummary {
  order_count: number;
  gmv_kobo: number;
  avg_order_value_kobo: number;
  service_fees_kobo: number;
  merchant_charge_kobo: number;
  delivery_margin_kobo: number;
  own_commission_kobo: number;
  platform_delivery_margin_kobo: number;
  delivery_fees_realised_kobo: number;
  rider_costs_kobo: number;
  pending_platform_deliveries: number;
  gateway_fees_kobo: number;
  net_revenue_kobo: number;
  foodo_net_kobo: number;
  take_rate: number;
  vat_collected_kobo: number;
  discounts_kobo: number;
  refund_count: number;
  refunds_kobo: number;
}

interface FinanceDailyRow {
  day: string;
  order_count: number;
  gmv_kobo: number;
  service_fees_kobo: number;
  merchant_charge_kobo: number;
  delivery_margin_kobo: number;
  gateway_fees_kobo: number;
  net_revenue_kobo: number;
  foodo_net_kobo: number;
  pending_platform_deliveries: number;
}

interface FinanceMerchantRow {
  restaurant_id: string;
  restaurant_name: string;
  order_count: number;
  gmv_kobo: number;
  service_fees_kobo: number;
  merchant_charge_kobo: number;
  delivery_margin_kobo: number;
  gateway_fees_kobo: number;
  net_revenue_kobo: number;
  foodo_net_kobo: number;
}

interface FinanceOverviewClientProps {
  summary: FinanceSummary | null;
  daily: FinanceDailyRow[];
  topMerchants: FinanceMerchantRow[];
  rangeLabel: string;
}

function formatChartKobo(kobo: number): string {
  const ngn = kobo / 100;
  if (Math.abs(ngn) >= 1_000_000) return `₦${(ngn / 1_000_000).toFixed(1)}M`;
  if (Math.abs(ngn) >= 1_000) return `₦${(ngn / 1_000).toFixed(0)}k`;
  return `₦${ngn.toFixed(0)}`;
}

export function FinanceOverviewClient({
  summary,
  daily,
  topMerchants,
  rangeLabel,
}: FinanceOverviewClientProps) {
  const chartData = daily.map((d) => ({
    day: new Date(`${d.day}T00:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    }),
    gmv: d.gmv_kobo,
    netRevenue: d.net_revenue_kobo,
    kitchynNet: d.foodo_net_kobo,
    orders: d.order_count,
  }));

  if (!summary) {
    return (
      <div className="bg-white rounded-2xl border border-black-200 px-5 py-10 text-center">
        <p className="text-sm text-black-400">
          No finance data for this range. If this persists, check that the finance
          RPCs are deployed (migration 098).
        </p>
      </div>
    );
  }

  return (
    <>
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="GMV" value={formatKobo(summary.gmv_kobo)} sub="what customers paid" />
        <Metric
          label="Net revenue"
          value={formatKobo(summary.net_revenue_kobo)}
          sub="service fees + merchant charge + delivery margin"
        />
        <Metric
          label="Kitchyn net (contribution)"
          value={formatKobo(summary.foodo_net_kobo)}
          sub="net revenue − gateway fees"
        />
        <Metric
          label="Take rate"
          value={`${(summary.take_rate * 100).toFixed(1)}%`}
          sub="net revenue ÷ GMV"
        />
        <Metric label="Avg order value" value={formatKobo(summary.avg_order_value_kobo)} />
        <Metric label="Orders" value={summary.order_count.toLocaleString()} />
        <Metric
          label="Refunds"
          value={summary.refund_count.toLocaleString()}
          sub={formatKobo(summary.refunds_kobo)}
        />
        <Metric
          label="Gateway fees"
          value={formatKobo(summary.gateway_fees_kobo)}
          sub="Paystack processing cost"
        />
      </div>

      {/* Passthrough / merchant-funded context */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-black-400">
        <span>
          VAT collected (passthrough):{" "}
          <span className="font-semibold text-black-600">{formatKobo(summary.vat_collected_kobo)}</span>
        </span>
        <span>
          Merchant-funded discounts:{" "}
          <span className="font-semibold text-black-600">{formatKobo(summary.discounts_kobo)}</span>
        </span>
        <span>
          Pending platform deliveries:{" "}
          <span className="font-semibold text-black-600">{summary.pending_platform_deliveries}</span>
        </span>
      </div>

      {/* Daily revenue trend */}
      <section>
        <h2 className="text-base font-bold text-black-900 mb-3">Daily revenue trend</h2>
        <div className="bg-white rounded-2xl border border-black-200 p-5">
          {chartData.length === 0 ? (
            <p className="text-black-400 text-sm py-10 text-center">No data in this range</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F2F2F2" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "#9E9E9E" }}
                    axisLine={{ stroke: "#E0E0E0" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9E9E9E" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => formatChartKobo(v)}
                    width={60}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      formatKobo(Number(value)),
                      String(name),
                    ]}
                  />
                  <Line type="monotone" dataKey="gmv" name="GMV" stroke="#9E9E9E" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="netRevenue" name="Net revenue" stroke="#7B2CBF" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="kitchynNet" name="Kitchyn net" stroke="#0E9F6E" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-black-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#9E9E9E]" /> GMV</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#7B2CBF]" /> Net revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#0E9F6E]" /> Kitchyn net</span>
          </div>
        </div>
      </section>

      {/* Daily order volume */}
      <section>
        <h2 className="text-base font-bold text-black-900 mb-3">Daily orders</h2>
        <div className="bg-white rounded-2xl border border-black-200 p-5">
          {chartData.length === 0 ? (
            <p className="text-black-400 text-sm py-10 text-center">No data in this range</p>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F2F2F2" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "#9E9E9E" }}
                    axisLine={{ stroke: "#E0E0E0" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9E9E9E" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={40}
                  />
                  <Tooltip formatter={(value) => [String(value), "Orders"]} />
                  <Bar dataKey="orders" name="Orders" fill="#7B2CBF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Top merchants by platform revenue */}
      <section>
        <h2 className="text-base font-bold text-black-900 mb-3">
          Top merchants by platform revenue
        </h2>
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          {topMerchants.length === 0 ? (
            <p className="text-black-400 text-sm px-5 py-10 text-center">No revenue data in this range</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black-100 bg-black-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Merchant</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">Orders</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">GMV</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">Net revenue</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">Kitchyn net</th>
                  </tr>
                </thead>
                <tbody>
                  {topMerchants.map((m) => (
                    <tr key={m.restaurant_id} className="border-b border-black-100 last:border-0 hover:bg-black-50 transition-colors">
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/merchants/${m.restaurant_id}`}
                          className="font-semibold text-black-900 hover:text-purple-500 transition-colors"
                        >
                          {m.restaurant_name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-right text-black-700 whitespace-nowrap">
                        {m.order_count.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right text-black-700 whitespace-nowrap">
                        {formatKobo(m.gmv_kobo)}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-black-900 whitespace-nowrap">
                        {formatKobo(m.net_revenue_kobo)}
                      </td>
                      <td className="px-5 py-3 text-right text-black-700 whitespace-nowrap">
                        {formatKobo(m.foodo_net_kobo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <p className="text-xs text-black-400">
        Figures cover Paystack-integrated merchants only — the same scope as the
        Settlements “Kitchyn P&amp;L” tab — and reconcile with it. Range: {rangeLabel}.
      </p>
    </>
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
