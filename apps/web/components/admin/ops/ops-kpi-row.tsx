"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@foodo/ui";
import { formatKobo } from "@foodo/utils";
import { AlertTriangle, Clock, Flame, Zap } from "lucide-react";
import type { OpsSummary } from "@/lib/admin/ops-types";
import { KpiDelta } from "./kpi-delta";

/**
 * PRIMARY KPI row — Active Orders · Late Orders · Unconfirmed · GMV Today.
 *
 * Contract (docs/live-ops-v2-ux.md §4.3):
 * - Grid `grid grid-cols-2 xl:grid-cols-4 gap-3`.
 * - Values stay realtime-derived (fresher than the RPC summary); OpsSummary
 *   feeds ONLY the GMV delta — never on-card values.
 * - Delta rule (§3 / §13.10): t = summaryToday.gmv_kobo, b =
 *   summaryLastWeek.gmv_kobo / 7 (trailing-7-day daily mean);
 *   deltaPct = (b <= 0 || t == null) ? null : ((t - b) / b) * 100.
 *   Computed only when BOTH summaries are present (RPC available at request
 *   time); either null → badge hidden.
 *   Only GMV carries a delta this wave — the other cards stay delta-less
 *   until ops_summary gains late/unconfirmed columns (§13.10).
 * - Card shell mirrors the existing `Kpi` pattern (tone: purple/red/amber,
 *   href wrapping, border-cinnabar-200 for red) with the delta slot rendered
 *   in the sub-line before `sub`, exactly per §4.3.
 */
export function OpsKpiRow({
  activeOrders,
  lateCount,
  staleCount,
  gmvTodayKobo,
  summaryToday,
  summaryLastWeek,
}: {
  /** derived.activeOrders.length — realtime. */
  activeOrders: number;
  /** derived.lateCount — realtime. */
  lateCount: number;
  /** derived.staleCount — realtime. */
  staleCount: number;
  /** GMV KPI value — RPC exact when available, realtime-derived otherwise. */
  gmvTodayKobo: number;
  /** ops_summary(today) — delta "today" value source (GMV only). null = RPC unavailable at request time. */
  summaryToday: OpsSummary | null;
  /** ops_summary(trailing 7 days) — the ONLY historical baseline. null = RPC unavailable at request time. */
  summaryLastWeek: OpsSummary | null;
}) {
  const gmvDeltaPct = useMemo(() => {
    // Delta needs both RPC summaries — either null (unavailable at request
    // time) or a non-positive baseline hides the badge (§3).
    if (!summaryToday || !summaryLastWeek) return null;
    const t = summaryToday.gmv_kobo;
    const b = summaryLastWeek.gmv_kobo / 7;
    if (b <= 0 || t == null) return null;
    const pct = ((t - b) / b) * 100;
    return Number.isFinite(pct) ? pct : null;
  }, [summaryToday, summaryLastWeek]);

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <PrimaryKpi
        label="Active Orders"
        value={activeOrders.toLocaleString()}
        icon={<Zap className="h-4 w-4" />}
      />
      <PrimaryKpi
        label="Late Orders"
        value={lateCount.toLocaleString()}
        icon={<AlertTriangle className="h-4 w-4" />}
        tone={lateCount > 0 ? "red" : undefined}
        href="/admin/late-orders"
        sub={lateCount > 0 ? "past ETA — review" : "all on time"}
      />
      <PrimaryKpi
        label="Unconfirmed"
        value={staleCount.toLocaleString()}
        icon={<Clock className="h-4 w-4" />}
        tone={staleCount > 0 ? "amber" : undefined}
        sub="pending > 10m"
      />
      <PrimaryKpi
        label="GMV Today"
        value={formatKobo(gmvTodayKobo)}
        icon={<Flame className="h-4 w-4" />}
        sub="paid orders"
        deltaPct={gmvDeltaPct}
      />
    </div>
  );
}

/**
 * Existing `Kpi` card shell (live-ops-client.tsx), extended with the delta
 * slot from §4.3: sub-line becomes `mt-0.5 flex items-center gap-1.5`
 * containing <KpiDelta /> (when non-null) before the unchanged `sub` text.
 */
function PrimaryKpi({
  label,
  value,
  sub,
  icon,
  tone,
  href,
  deltaPct,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  tone?: "purple" | "red" | "amber";
  href?: string;
  deltaPct?: number | null;
}) {
  const valueColor =
    tone === "purple"
      ? "text-purple-600"
      : tone === "red"
        ? "text-cinnabar-500"
        : tone === "amber"
          ? "text-gold-600"
          : "text-black-900";

  const body = (
    <div
      className={cn(
        "bg-white rounded-2xl border px-3.5 py-3 h-full",
        tone === "red" ? "border-cinnabar-200" : "border-black-200",
        href && "hover:shadow-card transition-shadow"
      )}
    >
      <div className="flex items-center gap-1.5 text-black-400">
        {icon}
        <p className="text-[11px] text-black-500 font-medium truncate">
          {label}
        </p>
      </div>
      <p className={cn("text-xl font-extrabold mt-1", valueColor)}>{value}</p>
      {(deltaPct != null || sub) && (
        <div className="mt-0.5 flex items-center gap-1.5">
          <KpiDelta deltaPct={deltaPct ?? null} />
          {sub && (
            <p className="text-[11px] text-black-400 mt-0.5 truncate">{sub}</p>
          )}
        </div>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}