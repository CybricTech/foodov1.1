"use client";

import { useMemo, useState } from "react";
import { cn } from "@foodo/ui";
import { formatKobo } from "@foodo/utils";
import { ChevronDown } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OpsHourlyRow } from "@/lib/admin/ops-types";

/**
 * Collapsible hourly throughput — today vs yesterday overlay.
 *
 * Contract (docs/live-ops-v2-ux.md §5):
 * - Card `bg-white rounded-2xl border border-black-200 p-4`, collapsed by
 *   default (useState(false)); expand button ≥ 40×40px with aria-expanded.
 * - ComposedChart exactly per the finance-overview precedent — raw hex
 *   literals are the existing chart language:
 *   today = purple #7B2CBF bars + solid green #0E9F6E line; yesterday =
 *   light purple #E0AAFF bars (behind today's) + dashed gray #9E9E9E line.
 * - All-zero day ⇒ "No orders yet today" empty state, no chart, no legend.
 */

interface OpsHourlyChartProps {
  /** ops_hourly(today) — 24 rows, hour 0–23. */
  hourlyToday: OpsHourlyRow[];
  /** ops_hourly(yesterday) — 24 rows, hour 0–23. */
  hourlyYesterday: OpsHourlyRow[];
}

// Copy of formatChartKobo from finance-overview-client.tsx (spec: copy, do
// not import) — compact kobo tick labels: ₦1.2M / ₦1.5k / ₦300.
function formatChartKobo(kobo: number): string {
  const ngn = kobo / 100;
  if (Math.abs(ngn) >= 1_000_000) return `₦${(ngn / 1_000_000).toFixed(1)}M`;
  if (Math.abs(ngn) >= 1_000) return `₦${(ngn / 1_000).toFixed(0)}k`;
  return `₦${ngn.toFixed(0)}`;
}

export function OpsHourlyChart({
  hourlyToday,
  hourlyYesterday,
}: OpsHourlyChartProps) {
  const [open, setOpen] = useState(false);

  // Merge the two 24-row series by hour (0–23, Africa/Lagos) — missing hours
  // fill as 0 so the axis is always a full day.
  const chartData = useMemo(() => {
    const byHour = (rows: OpsHourlyRow[]) => {
      const map = new Map<number, OpsHourlyRow>();
      for (const row of rows) map.set(row.hour, row);
      return map;
    };
    const today = byHour(hourlyToday);
    const yesterday = byHour(hourlyYesterday);
    return Array.from({ length: 24 }, (_, h) => {
      const t = today.get(h);
      const y = yesterday.get(h);
      return {
        hour: `${String(h).padStart(2, "0")}:00`,
        ordersToday: t?.orders_count ?? 0,
        ordersYesterday: y?.orders_count ?? 0,
        gmvToday: t?.gmv_kobo ?? 0,
        gmvYesterday: y?.gmv_kobo ?? 0,
      };
    });
  }, [hourlyToday, hourlyYesterday]);

  // Empty day: both series empty OR every point across both series is zero.
  const isEmptyDay = useMemo(() => {
    const rows = [...hourlyToday, ...hourlyYesterday];
    return (
      rows.length === 0 ||
      rows.every((r) => r.orders_count === 0 && r.gmv_kobo === 0)
    );
  }, [hourlyToday, hourlyYesterday]);

  return (
    <div className="bg-white rounded-2xl border border-black-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-black-500 uppercase tracking-widest">
          Hourly Throughput
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-black-400">
            today vs yesterday
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={
              open
                ? "Collapse hourly throughput chart"
                : "Expand hourly throughput chart"
            }
            className="h-10 w-10 rounded-full flex items-center justify-center text-black-500 hover:bg-black-50 transition-colors"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                open && "rotate-180"
              )}
            />
          </button>
        </div>
      </div>

      {open &&
        (isEmptyDay ? (
          <p className="text-black-400 text-sm py-10 text-center">
            No orders yet today
          </p>
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#F2F2F2"
                  />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 11, fill: "#9E9E9E" }}
                    axisLine={{ stroke: "#E0E0E0" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="orders"
                    allowDecimals={false}
                    width={36}
                    tick={{ fontSize: 11, fill: "#9E9E9E" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="gmv"
                    orientation="right"
                    width={52}
                    tick={{ fontSize: 11, fill: "#9E9E9E" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => formatChartKobo(v)}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "GMV today" || name === "GMV yesterday"
                        ? [formatKobo(Number(value)), String(name)]
                        : [String(value), String(name)]
                    }
                  />
                  <Bar
                    dataKey="ordersToday"
                    name="Orders today"
                    fill="#7B2CBF"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={14}
                  />
                  <Bar
                    dataKey="ordersYesterday"
                    name="Orders yesterday"
                    fill="#E0AAFF"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={14}
                  />
                  <Line
                    type="monotone"
                    dataKey="gmvToday"
                    name="GMV today"
                    stroke="#0E9F6E"
                    strokeWidth={2}
                    dot={false}
                    yAxisId="gmv"
                  />
                  <Line
                    type="monotone"
                    dataKey="gmvYesterday"
                    name="GMV yesterday"
                    stroke="#9E9E9E"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    yAxisId="gmv"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-black-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#7B2CBF]" /> Orders
                today
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#E0AAFF]" /> Orders
                yesterday
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#0E9F6E]" /> GMV today
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#9E9E9E]" /> GMV yesterday
              </span>
            </div>
          </>
        ))}
    </div>
  );
}