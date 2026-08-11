"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@foodo/ui";
import type { ServiceStatus } from "@/lib/admin/health-checks";
import type { OpsHourlyRow } from "@/lib/admin/ops-types";

interface SystemHealthStripProps {
  /** ops_hourly(yesterday) — the strip computes "next expected peak" from it. */
  hourlyYesterday: OpsHourlyRow[];
}

// /api/admin/system-health service keys → strip labels and order
// (docs/live-ops-v2-ux.md §4.2 / §13.11 — remapping needs a data-agent
// change plus the doc's approval).
const HEALTH_SERVICES: { key: string; label: string }[] = [
  { key: "paystack", label: "Payments" },
  { key: "database", label: "Supabase" },
  { key: "bolt", label: "Webhooks" },
];

const UNAVAILABLE: Record<string, ServiceStatus | null> = Object.fromEntries(
  HEALTH_SERVICES.map((s) => [s.key, null])
);

/**
 * Compact system-health row under the header (docs/live-ops-v2-ux.md §4.2).
 *
 * Self-fetches /api/admin/system-health on mount and every 60 s. Any fetch
 * failure (or missing service key) lands that dot on "unavailable" (null) —
 * gray dot + gray suffix, never an error boundary (§12 states table).
 */
export function SystemHealthStrip({ hourlyYesterday }: SystemHealthStripProps) {
  const [statuses, setStatuses] =
    useState<Record<string, ServiceStatus | null>>(UNAVAILABLE);

  useEffect(() => {
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch("/api/admin/system-health", {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setStatuses(UNAVAILABLE);
          return;
        }
        const data = (await res.json()) as {
          services: { key: string; status: ServiceStatus }[];
        };
        if (controller.signal.aborted) return;
        const next: Record<string, ServiceStatus | null> = {
          ...UNAVAILABLE,
        };
        for (const service of data.services) {
          if (service.key in next) next[service.key] = service.status;
        }
        setStatuses(next);
      } catch {
        if (!controller.signal.aborted) setStatuses(UNAVAILABLE);
      }
    };
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => {
      controller?.abort();
      clearInterval(t);
    };
  }, []);

  const items = HEALTH_SERVICES.map((s) => ({
    label: s.label,
    state: statuses[s.key] ?? null,
  }));

  const peak = nextExpectedPeak(hourlyYesterday);
  const peakLabel = peak
    ? `${String(peak.hour).padStart(2, "0")}:00`
    : "—";

  return (
    <div className="bg-white rounded-2xl border border-black-200 px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
      {items.map((item) => (
        <HealthItem key={item.label} label={item.label} state={item.state} />
      ))}
      <span className="flex items-center gap-1.5">
        <Clock className="h-3 w-3 text-black-400" />
        <span className="text-xs text-black-500">Next peak</span>
        <span
          className={cn(
            "text-xs font-semibold",
            peak ? "text-black-900" : "text-black-400"
          )}
        >
          {peakLabel}
        </span>
      </span>
    </div>
  );
}

function HealthItem({
  label,
  state,
}: {
  label: string;
  state: ServiceStatus | null;
}) {
  const dotClass =
    state === "healthy"
      ? "bg-viridian-500"
      : state === "degraded"
        ? "bg-dixie-500"
        : state === "down"
          ? "bg-cinnabar-500"
          : "bg-black-200";
  const suffix =
    state === "healthy" ? null : state === "degraded" ? (
      <span className="text-xs font-semibold text-dixie-500">degraded</span>
    ) : state === "down" ? (
      <span className="text-xs font-semibold text-cinnabar-500">down</span>
    ) : (
      <span className="text-xs font-semibold text-black-400">unavailable</span>
    );
  return (
    <span
      className="flex items-center gap-1.5"
      title={`${label}: ${state ?? "unavailable"}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      <span className="text-xs text-black-500">{label}</span>
      {suffix}
    </span>
  );
}

/**
 * The hour bucket with the highest orders_count among hour > current Lagos
 * hour in yesterday's series. Null when nothing qualifies (day over, or all
 * remaining buckets empty) — the value then renders "—".
 */
function nextExpectedPeak(hourlyYesterday: OpsHourlyRow[]): OpsHourlyRow | null {
  const lagosNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" })
  );
  const currentHour = lagosNow.getHours();
  let peak: OpsHourlyRow | null = null;
  for (const row of hourlyYesterday) {
    if (row.hour <= currentHour || row.orders_count <= 0) continue;
    if (!peak || row.orders_count > peak.orders_count) peak = row;
  }
  return peak;
}