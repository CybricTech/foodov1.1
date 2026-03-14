"use client";

import { useState } from "react";
import { cn } from "@foodo/ui";

interface SmsLog {
  id: string;
  phone: string;
  event_type: string;
  provider: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  restaurant_id: string;
  restaurants: { name: string } | null;
}

export function SmsLogsClient({ initialLogs }: { initialLogs: SmsLog[] }) {
  const [filter, setFilter] = useState<"all" | "failed" | "sent">("all");
  const [retrying, setRetrying] = useState<string | null>(null);

  const logs = initialLogs.filter((l) => {
    if (filter === "all") return true;
    return l.status === filter;
  });

  async function retryLog(log: SmsLog) {
    setRetrying(log.id);
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-sms`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: log.restaurant_id,
          phone: log.phone,
          eventType: log.event_type,
          orderId: null,
        }),
      }
    );
    setRetrying(null);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">SMS Logs</h1>
        <div className="flex gap-2">
          {(["all", "failed", "sent"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-sm px-4 py-2 rounded-xl capitalize transition-colors",
                filter === f
                  ? "bg-viridian-500 text-white"
                  : "bg-black-900 text-black-400 border border-black-500 hover:text-white"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-black-900 rounded-2xl border border-black-500 overflow-hidden">
        {logs.length === 0 && (
          <div className="py-12 text-center text-black-400">
            <p className="text-sm">No logs found</p>
          </div>
        )}
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex items-center gap-4 px-4 py-3 border-b border-black-500 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium">{log.phone}</p>
              <p className="text-xs text-black-400 mt-0.5">
                {log.event_type} · {log.provider} ·{" "}
                {log.restaurants?.name ?? "—"}
              </p>
              <p className="text-xs text-black-500">
                {new Date(log.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  log.status === "sent"
                    ? "bg-viridian-500/20 text-viridian-500"
                    : log.status === "failed"
                    ? "bg-cinnabar-100/20 text-cinnabar-500"
                    : "bg-dixie-100/20 text-dixie-500"
                )}
              >
                {log.status}
              </span>
              {log.status === "failed" && (
                <button
                  onClick={() => retryLog(log)}
                  disabled={retrying === log.id}
                  className="text-xs text-viridian-500 border border-viridian-500/40 px-2 py-1 rounded-lg hover:bg-viridian-500/10 disabled:opacity-50 transition-colors"
                >
                  {retrying === log.id ? "…" : "Retry"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
