"use client";

import { useMemo, useState } from "react";
import { formatKobo } from "@foodo/utils";

interface FinanceSummary {
  order_count: number;
  gmv_kobo: number;
  avg_order_value_kobo: number;
  net_revenue_kobo: number;
  delivery_margin_kobo: number;
  gateway_fees_kobo: number;
  foodo_net_kobo: number;
}

interface OrderEconomicsRow {
  order_id: string;
  restaurant_id: string;
  restaurant_name: string;
  created_at: string;
  wat_date: string;
  status: string;
  payment_status: string;
  dispatch_type: string | null;
  fulfillment_type: string | null;
  order_total_kobo: number;
  service_fee_kobo: number;
  merchant_charge_kobo: number;
  delivery_margin_kobo: number;
  gateway_fee_kobo: number;
  foodo_net_kobo: number;
  platform_delivery_pending: boolean;
}

interface FinanceUnitEconomicsClientProps {
  summary: FinanceSummary | null;
  orders: OrderEconomicsRow[];
  rangeLabel: string;
}

const PAGE_SIZE = 50;

function avg(total: number, count: number): number {
  return count > 0 ? Math.round(total / count) : 0;
}

export function FinanceUnitEconomicsClient({
  summary,
  orders,
  rangeLabel,
}: FinanceUnitEconomicsClientProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.restaurant_name.toLowerCase().includes(q) ||
        o.order_id.toLowerCase().startsWith(q)
    );
  }, [orders, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    clampedPage * PAGE_SIZE,
    (clampedPage + 1) * PAGE_SIZE
  );

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

  const orderCount = summary.order_count;

  return (
    <>
      {/* Average-per-order strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Metric
          label="Avg order value"
          value={formatKobo(avg(summary.gmv_kobo, orderCount))}
          sub="what the customer paid"
        />
        <Metric
          label="Avg revenue / order"
          value={formatKobo(avg(summary.net_revenue_kobo, orderCount))}
          sub="service + charge + delivery margin"
        />
        <Metric
          label="Avg gateway fee / order"
          value={formatKobo(avg(summary.gateway_fees_kobo, orderCount))}
          sub="Paystack cost"
        />
        <Metric
          label="Avg delivery margin / order"
          value={formatKobo(avg(summary.delivery_margin_kobo, orderCount))}
        />
        <Metric
          label="Avg contribution / order"
          value={formatKobo(avg(summary.foodo_net_kobo, orderCount))}
          sub="Kitchyn net per order"
        />
      </div>

      {/* Per-order table */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-base font-bold text-black-900">
            Per-order economics · {rangeLabel}
          </h2>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search merchant or order id…"
            className="text-sm border border-black-200 rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:border-black-400"
          />
        </div>

        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-black-400 border-b border-black-100">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Merchant</th>
                  <th className="px-4 py-3 font-medium text-right">Order total</th>
                  <th className="px-4 py-3 font-medium text-right">Service fee</th>
                  <th className="px-4 py-3 font-medium text-right">Merchant charge</th>
                  <th className="px-4 py-3 font-medium text-right">Delivery margin</th>
                  <th className="px-4 py-3 font-medium text-right">Gateway fee</th>
                  <th className="px-4 py-3 font-medium text-right">Kitchyn net</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-black-400">
                      No orders match.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((o) => (
                    <tr key={o.order_id} className="border-b border-black-100 last:border-0">
                      <td className="px-4 py-2.5 whitespace-nowrap text-black-500">
                        {o.wat_date}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-black-900">
                        {o.restaurant_name}
                      </td>
                      <td className="px-4 py-2.5 text-right">{formatKobo(o.order_total_kobo)}</td>
                      <td className="px-4 py-2.5 text-right">{formatKobo(o.service_fee_kobo)}</td>
                      <td className="px-4 py-2.5 text-right">{formatKobo(o.merchant_charge_kobo)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {formatKobo(o.delivery_margin_kobo)}
                        {o.platform_delivery_pending && (
                          <span className="ml-1.5 inline-block text-[10px] font-semibold bg-dixie-100 text-dixie-600 rounded px-1 py-0.5 align-middle">
                            pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-black-500">
                        −{formatKobo(o.gateway_fee_kobo)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-semibold ${
                          o.foodo_net_kobo >= 0 ? "text-viridian-600" : "text-cinnabar-500"
                        }`}
                      >
                        {formatKobo(o.foodo_net_kobo)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-black-400 whitespace-nowrap">
                        {o.status}
                        {o.payment_status === "refunded" && " · refunded"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-black-100 text-xs text-black-400">
            <span>
              {filtered.length.toLocaleString()} orders · page {clampedPage + 1} of {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={clampedPage === 0}
                className="px-3 py-1 rounded border border-black-200 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={clampedPage >= pageCount - 1}
                className="px-3 py-1 rounded border border-black-200 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-black-200 p-4">
      <p className="text-xs text-black-400">{label}</p>
      <p className="text-lg font-extrabold text-black-900 mt-1">{value}</p>
      {sub && <p className="text-[11px] text-black-400 mt-0.5">{sub}</p>}
    </div>
  );
}
