"use client";

import { useState } from "react";
import { cn } from "@foodo/ui";

interface SmsLog {
  id: string;
  recipient_phone: string;
  message_body: string;
  event_type: string;
  provider: string;
  provider_ref: string | null;
  status: string;
  channel: string | null;
  created_at: string;
  sent_at: string | null;
  order_id: string | null;
  restaurant_id: string;
  restaurants: { name: string } | null;
}

const EVENT_LABELS: Record<string, string> = {
  order_confirmed: "Order confirmed",
  order_ready: "Ready for pickup",
  order_in_transit: "On its way",
  order_preparing: "Preparing",
  order_delivered: "Delivered",
  order_cancelled: "Cancelled",
  new_order_merchant: "New order (merchant)",
};

export function SmsLogsClient({ initialLogs }: { initialLogs: SmsLog[] }) {
  const [filter, setFilter] = useState<"all" | "failed" | "sent" | "queued">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [statusResults, setStatusResults] = useState<Record<string, string>>({});

  const logs = initialLogs.filter((l) => {
    if (filter === "all") return true;
    return l.status === filter;
  });

  const counts = {
    all: initialLogs.length,
    sent: initialLogs.filter((l) => l.status === "sent").length,
    failed: initialLogs.filter((l) => l.status === "failed").length,
    queued: initialLogs.filter((l) => l.status === "queued").length,
  };

  async function checkStatus(log: SmsLog) {
    setChecking(log.id);
    const res = await fetch("/api/admin/sms-logs/check-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logId: log.id }),
    });
    const data = await res.json().catch(() => ({}));
    setStatusResults((prev) => ({
      ...prev,
      [log.id]: data.status ? `${data.rawStatus} → ${data.status}${data.changed ? " ✓" : " (no change)"}` : data.error ?? "Error",
    }));
    setChecking(null);
  }

  async function retryLog(log: SmsLog) {
    setRetrying(log.id);
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-sms`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          restaurantId: log.restaurant_id,
          phone: log.recipient_phone,
          eventType: log.event_type,
          orderId: log.order_id ?? "00000000-0000-0000-0000-000000000000",
        }),
      }
    );
    setRetrying(null);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-black-900">SMS Logs</h1>
        <div className="flex gap-2">
          {(["all", "sent", "failed", "queued"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-sm px-4 py-2 rounded-xl capitalize transition-colors",
                filter === f
                  ? "bg-purple-500 text-white"
                  : "bg-white text-black-500 border border-black-200 hover:text-black-900"
              )}
            >
              {f}
              <span className={cn(
                "ml-1.5 text-xs font-medium",
                filter === f ? "opacity-75" : "text-black-400"
              )}>
                {counts[f]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        {logs.length === 0 && (
          <div className="py-12 text-center text-black-400">
            <p className="text-sm">No logs found</p>
          </div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="border-b border-black-200 last:border-0">
            <div
              className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-black-50 transition-colors"
              onClick={() => setExpanded(expanded === log.id ? null : log.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-black-900 font-medium">{log.recipient_phone}</p>
                  <span className="text-xs text-black-400">
                    {log.restaurants?.name ?? "—"}
                  </span>
                </div>
                <p className="text-xs text-black-500 mt-0.5">
                  {EVENT_LABELS[log.event_type] ?? log.event_type}
                  {" · "}
                  {log.provider}
                  {log.channel ? ` (${log.channel})` : ""}
                </p>
                <p className="text-xs text-black-400">
                  {new Date(log.created_at).toLocaleString("en-NG")}
                  {log.sent_at && (
                    <span className="ml-2 text-black-300">
                      · sent {new Date(log.sent_at).toLocaleString("en-NG")}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    log.status === "sent" || log.status === "delivered"
                      ? "bg-green-100 text-green-700"
                      : log.status === "failed"
                      ? "bg-cinnabar-100 text-cinnabar-500"
                      : "bg-jasmine-100 text-jasmine-600"
                  )}
                >
                  {log.status}
                </span>
                {log.status === "failed" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); retryLog(log); }}
                    disabled={retrying === log.id}
                    className="text-xs text-purple-500 border border-purple-500/40 px-2 py-1 rounded-lg hover:bg-purple-500/10 disabled:opacity-50 transition-colors"
                  >
                    {retrying === log.id ? "…" : "Retry"}
                  </button>
                )}
              </div>
            </div>

            {/* Expanded detail row */}
            {expanded === log.id && (
              <div className="px-4 pb-4 bg-black-50 text-xs space-y-2">
                <p className="text-black-700 bg-white border border-black-100 rounded-lg p-3 leading-relaxed">
                  {log.message_body}
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-black-500">
                  {log.provider_ref && (
                    <span>Message ID: <span className="font-mono text-black-700">{log.provider_ref}</span></span>
                  )}
                  {log.order_id && (
                    <span>Order ID: <span className="font-mono text-black-700">{log.order_id}</span></span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {log.provider === "sendchamp" && log.provider_ref && (
                    <button
                      onClick={() => checkStatus(log)}
                      disabled={checking === log.id}
                      className="text-xs text-purple-500 border border-purple-500/40 px-2 py-1 rounded-lg hover:bg-purple-500/10 disabled:opacity-50 transition-colors"
                    >
                      {checking === log.id ? "Checking…" : "Check delivery"}
                    </button>
                  )}
                  {statusResults[log.id] && (
                    <span className="text-xs text-black-600">{statusResults[log.id]}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
