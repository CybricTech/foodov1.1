"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Radio,
  type LucideIcon,
} from "lucide-react";
import type { HealthResponse, ServiceResult } from "@/lib/admin/health-checks";
import type { MapsTestResult } from "@/app/api/admin/system-health/test-maps/route";

type ServiceStatus = "healthy" | "degraded" | "down";

interface CheckRecord {
  timestamp: string;
  overall: ServiceStatus;
  services: ServiceResult[];
}

const STATUS_CONFIG: Record<
  ServiceStatus,
  {
    label: string;
    Icon: LucideIcon;
    rowBg: string;
    badgeBg: string;
    badgeText: string;
    dot: string;
    headerBg: string;
    headerText: string;
  }
> = {
  healthy: {
    label: "Healthy",
    Icon: CheckCircle2,
    rowBg: "",
    badgeBg: "bg-viridian-50",
    badgeText: "text-viridian-700",
    dot: "bg-viridian-500",
    headerBg: "bg-viridian-500",
    headerText: "text-white",
  },
  degraded: {
    label: "Degraded",
    Icon: AlertTriangle,
    rowBg: "bg-dixie-50",
    badgeBg: "bg-dixie-50",
    badgeText: "text-dixie-700",
    dot: "bg-dixie-400",
    headerBg: "bg-dixie-400",
    headerText: "text-white",
  },
  down: {
    label: "Down",
    Icon: XCircle,
    rowBg: "bg-cinnabar-50",
    badgeBg: "bg-cinnabar-50",
    badgeText: "text-cinnabar-700",
    dot: "bg-cinnabar-500",
    headerBg: "bg-cinnabar-500",
    headerText: "text-white",
  },
};

function StatusBadge({ status }: { status: ServiceStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function LatencyBar({ ms }: { ms: number }) {
  const max = 5000;
  const pct = Math.min(100, (ms / max) * 100);
  const color =
    ms < 2000 ? "bg-viridian-500" : ms < 5000 ? "bg-dixie-400" : "bg-cinnabar-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-black-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-black-500 w-14">{ms}ms</span>
    </div>
  );
}

function OverallBanner({ overall }: { overall: ServiceStatus }) {
  const cfg = STATUS_CONFIG[overall];
  const Icon = cfg.Icon;
  return (
    <div
      className={`rounded-2xl px-6 py-5 flex items-center gap-4 ${cfg.headerBg} ${cfg.headerText}`}
    >
      <Icon size={32} />
      <div>
        <p className="text-lg font-bold">
          {overall === "healthy"
            ? "All systems operational"
            : overall === "degraded"
              ? "Degraded performance detected"
              : "Service disruption detected"}
        </p>
        <p className="text-sm opacity-80 mt-0.5">
          {overall === "healthy"
            ? "All API services are responding normally."
            : overall === "degraded"
              ? "Some services are responding slower than expected."
              : "One or more services are unavailable."}
        </p>
      </div>
    </div>
  );
}

function ServiceRow({ service }: { service: ServiceResult }) {
  const cfg = STATUS_CONFIG[service.status];
  return (
    <tr className={`border-b border-black-100 last:border-0 ${cfg.rowBg}`}>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
          <span className="text-sm font-medium text-black-900">{service.name}</span>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <StatusBadge status={service.status} />
      </td>
      <td className="px-5 py-3.5">
        <LatencyBar ms={service.latencyMs} />
      </td>
      <td className="px-5 py-3.5 text-xs text-black-500 max-w-xs truncate">
        {service.detail ?? "—"}
      </td>
    </tr>
  );
}

function ServiceTable({
  title,
  subtitle,
  services,
  footer,
}: {
  title: string;
  subtitle?: string;
  services: ServiceResult[];
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-black-100">
        <h2 className="font-bold text-black-900 text-sm">{title}</h2>
        {subtitle && <p className="text-xs text-black-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black-100 bg-black-50">
              <th className="px-5 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Service</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Status</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Latency</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Detail</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <ServiceRow key={s.key} service={s} />
            ))}
          </tbody>
        </table>
      </div>
      {footer && (
        <div className="px-5 py-3 border-t border-black-100 bg-black-50">{footer}</div>
      )}
    </div>
  );
}

function HistoryRow({ record, index }: { record: CheckRecord; index: number }) {
  const cfg = STATUS_CONFIG[record.overall];
  const time = new Date(record.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-black-100 last:border-0 hover:bg-black-50 transition-colors">
      <span className="text-xs text-black-400 w-6 text-right flex-shrink-0">
        {index + 1}
      </span>
      <span className="text-xs text-black-500 font-mono w-20 flex-shrink-0">{time}</span>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className="text-xs font-medium text-black-700">{cfg.label}</span>
      <div className="flex items-center gap-2 ml-auto">
        {record.services.map((s) => {
          const sCfg = STATUS_CONFIG[s.status];
          return (
            <div
              key={s.key}
              className="flex items-center gap-1"
              title={`${s.name}: ${s.latencyMs}ms`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${sCfg.dot}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

type StreamState = "connecting" | "live" | "reconnecting" | "error";

function MapsTestCard() {
  const [result, setResult] = useState<MapsTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  async function runTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/system-health/test-maps", {
        method: "POST",
        cache: "no-store",
      });
      if (res.ok) {
        const data: MapsTestResult = await res.json();
        setResult(data);
      }
    } catch {
      // silently preserve previous result
    } finally {
      setTesting(false);
    }
  }

  const statusCfg = result ? STATUS_CONFIG[result.status] : null;
  const Icon = statusCfg?.Icon;

  return (
    <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-black-100 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-black-900 text-sm">Google Maps API</h2>
          <p className="text-xs text-black-400 mt-0.5">
            Manual test only — each run makes one billable geocode call (~$0.005)
          </p>
        </div>
        <button
          onClick={runTest}
          disabled={testing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black-50 border border-black-200 text-xs font-medium text-black-700 hover:bg-black-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={testing ? "animate-spin" : ""} />
          {testing ? "Testing…" : "Test now"}
        </button>
      </div>

      <div className="px-5 py-4">
        {!result && !testing ? (
          <p className="text-sm text-black-400">
            Not tested yet. Click &quot;Test now&quot; to validate your API key and connectivity.
          </p>
        ) : testing ? (
          <div className="flex items-center gap-2">
            <RefreshCw size={14} className="animate-spin text-black-400" />
            <span className="text-sm text-black-500">Running geocode test…</span>
          </div>
        ) : result && statusCfg && Icon ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
              <div>
                <div className={`flex items-center gap-1.5`}>
                  <span className={`text-sm font-semibold ${
                    result.status === "healthy" ? "text-viridian-700"
                      : result.status === "degraded" ? "text-dixie-700"
                        : "text-cinnabar-700"
                  }`}>{statusCfg.label}</span>
                  <span className="text-xs text-black-400">· {result.latencyMs}ms</span>
                </div>
                <p className="text-xs text-black-500 mt-0.5">{result.detail}</p>
              </div>
            </div>
            <p className="text-xs text-black-400 text-right">
              Last tested<br />
              {new Date(result.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function SystemHealthPage() {
  const [current, setCurrent] = useState<CheckRecord | null>(null);
  const [history, setHistory] = useState<CheckRecord[]>([]);
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const esRef = useRef<EventSource | null>(null);

  function connect() {
    if (esRef.current) {
      esRef.current.close();
    }

    setStreamState("connecting");
    const es = new EventSource("/api/admin/system-health/stream");
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: HealthResponse = JSON.parse(event.data);
        const record: CheckRecord = {
          timestamp: data.timestamp,
          overall: data.overall,
          services: data.services,
        };
        setCurrent(record);
        setHistory((prev) => [record, ...prev].slice(0, 20));
        setLastUpdated(new Date());
        setStreamState("live");
      } catch {
        // malformed event — ignore
      }
    };

    es.onerror = () => {
      // EventSource will automatically try to reconnect;
      // we just reflect the in-between state visually.
      setStreamState("reconnecting");
    };

    es.onopen = () => {
      setStreamState("live");
    };
  }

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isConnecting = streamState === "connecting";

  return (
    <div className="p-6 pb-24 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-black-900">System Health</h1>
          <p className="text-black-500 text-sm mt-1">
            Real-time API and service monitoring
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Live / reconnecting indicator */}
          <div className="flex items-center gap-1.5">
            {streamState === "live" ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-viridian-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-viridian-500" />
                </span>
                <span className="text-xs font-medium text-viridian-600">Live</span>
              </>
            ) : streamState === "reconnecting" ? (
              <>
                <RefreshCw size={12} className="animate-spin text-dixie-500" />
                <span className="text-xs font-medium text-dixie-600">Reconnecting…</span>
              </>
            ) : (
              <>
                <Radio size={12} className="text-black-400 animate-pulse" />
                <span className="text-xs font-medium text-black-400">Connecting…</span>
              </>
            )}
          </div>
          {lastUpdated && (
            <span className="text-xs text-black-400">
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {isConnecting && !current ? (
        <div className="bg-white rounded-2xl border border-black-200 px-6 py-12 flex items-center justify-center gap-3">
          <RefreshCw size={18} className="animate-spin text-black-400" />
          <span className="text-black-500 text-sm">Connecting to live feed…</span>
        </div>
      ) : current ? (
        <>
          <OverallBanner overall={current.overall} />

          {/* Internal services */}
          <ServiceTable
            title="Internal Services"
            subtitle="Supabase database, auth, and platform data — updates every 10s"
            services={current.services.filter((s) => s.group === "internal")}
            footer={
              <p className="text-xs text-black-400">
                Last checked:{" "}
                {new Date(current.timestamp).toLocaleString([], {
                  dateStyle: "medium",
                  timeStyle: "medium",
                })}
              </p>
            }
          />

          {/* External services */}
          <ServiceTable
            title="External APIs"
            subtitle="Third-party services checked live on every cycle"
            services={current.services.filter((s) => s.group === "external")}
          />

          {/* Google Maps — manual test only */}
          <MapsTestCard />

          {/* Check history */}
          {history.length > 1 && (
            <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-black-100">
                <h2 className="font-bold text-black-900 text-sm">Check History</h2>
                <p className="text-xs text-black-400 mt-0.5">
                  Last {history.length} checks this session
                </p>
              </div>
              <div>
                {history.map((record, i) => (
                  <HistoryRow key={record.timestamp} record={record} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="bg-white rounded-2xl border border-black-200 px-5 py-4">
            <h3 className="text-xs font-semibold text-black-500 uppercase tracking-wide mb-3">
              Status Guide
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {(["healthy", "degraded", "down"] as ServiceStatus[]).map((s) => {
                const cfg = STATUS_CONFIG[s];
                const Icon = cfg.Icon;
                const iconColor =
                  s === "healthy"
                    ? "text-viridian-600"
                    : s === "degraded"
                      ? "text-dixie-600"
                      : "text-cinnabar-600";
                return (
                  <div key={s} className="flex items-start gap-2">
                    <Icon size={14} className={`mt-0.5 flex-shrink-0 ${iconColor}`} />
                    <div>
                      <p className="text-xs font-semibold text-black-900">{cfg.label}</p>
                      <p className="text-xs text-black-400">
                        {s === "healthy"
                          ? "Response < 2s"
                          : s === "degraded"
                            ? "Response 2s–5s"
                            : "Query error or timeout"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-black-200 px-6 py-12 text-center">
          <Activity size={24} className="mx-auto text-black-300 mb-2" />
          <p className="text-black-500 text-sm">Could not connect to health stream</p>
        </div>
      )}
    </div>
  );
}
