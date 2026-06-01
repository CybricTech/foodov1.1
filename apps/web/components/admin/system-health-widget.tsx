"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, CheckCircle2, AlertTriangle, XCircle, type LucideIcon } from "lucide-react";
import type { HealthResponse, ServiceResult } from "@/lib/admin/health-checks";

type ServiceStatus = "healthy" | "degraded" | "down";

const STATUS_CONFIG: Record<
  ServiceStatus,
  { color: string; dot: string; label: string; Icon: LucideIcon }
> = {
  healthy: {
    Icon: CheckCircle2,
    color: "text-viridian-600",
    dot: "bg-viridian-500",
    label: "All systems operational",
  },
  degraded: {
    Icon: AlertTriangle,
    color: "text-dixie-600",
    dot: "bg-dixie-400",
    label: "Degraded performance",
  },
  down: {
    Icon: XCircle,
    color: "text-cinnabar-600",
    dot: "bg-cinnabar-500",
    label: "Service disruption",
  },
};

function ServiceDot({ service }: { service: ServiceResult }) {
  const cfg = STATUS_CONFIG[service.status];
  return (
    <div className="flex items-center gap-1.5" title={`${service.name}: ${service.status} (${service.latencyMs}ms)`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className="text-xs text-black-500">{service.name}</span>
    </div>
  );
}

export function SystemHealthWidget() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  async function fetchHealth() {
    try {
      const res = await fetch("/api/admin/system-health", { cache: "no-store" });
      if (res.ok) {
        const json: HealthResponse = await res.json();
        setData(json);
        setLastFetched(new Date());
      }
    } catch {
      // widget degrades silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, []);

  const overall: ServiceStatus = data?.overall ?? "healthy";
  const cfg = STATUS_CONFIG[overall];
  const Icon = cfg.Icon;

  return (
    <div className="bg-white rounded-2xl border border-black-200 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-black-400" />
          <p className="text-xs font-semibold text-black-500 uppercase tracking-wide">
            System Health
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastFetched && (
            <span className="text-xs text-black-400">
              Updated {lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Link
            href="/admin/system-health"
            className="text-xs font-medium text-purple-500 hover:text-purple-700 transition-colors"
          >
            View details →
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-black-200 animate-pulse" />
          <span className="text-sm text-black-400">Checking services…</span>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className={`flex items-center gap-1.5 ${cfg.color}`}>
            <Icon size={15} />
            <span className="text-sm font-semibold">{cfg.label}</span>
          </div>
          {data && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {data.services.map((s) => (
                <ServiceDot key={s.key} service={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
