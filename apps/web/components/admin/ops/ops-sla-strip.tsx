"use client";

import { cn } from "@foodo/ui";
import { formatKobo } from "@foodo/utils";
import type { OpsSummary } from "@/lib/admin/ops-types";

/**
 * SLA strip — 4 compact muted metrics from summaryToday.
 *
 * Contract (docs/live-ops-v2-ux.md §4.5):
 * - Grid `grid grid-cols-2 xl:grid-cols-4 gap-3`; same compact card shell as
 *   the secondary row but with a slightly stronger label
 *   (`text-[11px] text-black-500 font-medium`).
 * - null ⇒ value renders "—" in text-black-400 and sub renders "no data".
 *   "—" is the deliberate no-data signal, never "0" or "N/A" (§13.9).
 * - Avg Prep Time is ALWAYS "—": the schema has no confirmed_at/ready_at
 *   column, so a true prep time cannot be measured — never faked client-side.
 *   The card carries an honest native tooltip explaining the permanent
 *   no-data state (the RPC's avg_prep_minutes is always null — migration 104
 *   has no prep timestamps).
 */
export function OpsSlaStrip({
  summary,
}: {
  /** ops_summary(today) — single RPC row. */
  summary: OpsSummary;
}) {
  // avg_prep_minutes is ALWAYS null from the RPC (no confirmed_at/ready_at in
  // the schema) — render the permanent no-data state, never a fake prep time.
  const prepNoData: number | null = null;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <SlaCard
        label="Avg Prep Time"
        value={prepNoData == null ? null : `${Math.round(prepNoData)} min`}
        sub={prepNoData == null ? "no data" : "prep → ready"}
        tooltip="no data — prep timestamps aren't tracked yet"
      />
      <SlaCard
        label="Avg Delivery Time"
        value={
          summary.avg_delivery_minutes == null
            ? null
            : `${Math.round(summary.avg_delivery_minutes)} min`
        }
        sub={
          summary.avg_delivery_minutes == null
            ? "no data"
            : "order → door"
        }
      />
      <SlaCard
        label="Avg Order Value"
        value={
          summary.avg_order_value_kobo == null
            ? null
            : formatKobo(summary.avg_order_value_kobo)
        }
        sub={
          summary.avg_order_value_kobo == null
            ? "no data"
            : "per paid order"
        }
      />
      <SlaCard
        label="Cancellation Rate"
        value={
          summary.cancellation_rate == null
            ? null
            : `${(summary.cancellation_rate * 100).toFixed(1)}%`
        }
        sub={
          summary.cancellation_rate == null ? "no data" : "of orders today"
        }
      />
    </div>
  );
}

function SlaCard({
  label,
  value,
  sub,
  tooltip,
}: {
  label: string;
  /** null → renders "—" + "no data". */
  value: string | null;
  sub: string;
  /** Optional native tooltip (honest explanation for permanent no-data). */
  tooltip?: string;
}) {
  const noData = value == null;
  return (
    <div
      className="bg-white rounded-2xl border border-black-200 px-3.5 py-3"
      title={tooltip ?? (noData ? "no data" : undefined)}
    >
      <p className="text-[11px] text-black-500 font-medium truncate">
        {label}
      </p>
      <p
        className={cn(
          "text-lg font-extrabold mt-1",
          noData ? "text-black-400" : "text-black-900"
        )}
      >
        {noData ? "—" : value}
      </p>
      <p className="text-[11px] text-black-400 mt-0.5 truncate">{sub}</p>
    </div>
  );
}