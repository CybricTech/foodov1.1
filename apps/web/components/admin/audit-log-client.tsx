"use client";

import { useState } from "react";
import { cn } from "@foodo/ui";
import { ChevronDown, ChevronUp, LogIn, LogOut, RefreshCw } from "lucide-react";

export interface AuditRow {
  id: string;
  source: "activity" | "auth";
  created_at: string;
  table_name: string; // activity_log.table_name, or "sign_in"/"sign_out" for auth rows
  operation: "INSERT" | "UPDATE" | "DELETE" | null;
  restaurant_id: string | null;
  restaurant_name: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_role_label: string | null;
  detail: Record<string, unknown>;
}

const OP_STYLES: Record<string, string> = {
  INSERT: "bg-viridian-100 text-viridian-700",
  UPDATE: "bg-purple-100 text-purple-700",
  DELETE: "bg-cinnabar-100 text-cinnabar-700",
  sign_in: "bg-viridian-100 text-viridian-700",
  sign_out: "bg-black-100 text-black-600",
};

const TABLE_LABELS: Record<string, string> = {
  user_profiles: "User profile",
  orders: "Order",
  menu_items: "Menu item",
  restaurants: "Restaurant",
  discounts: "Discount",
  loyalty_programs: "Loyalty program",
  settlements: "Settlement",
  wallet_transactions: "Wallet transaction",
  sign_in: "Sign in",
  sign_out: "Sign out",
};

function summary(row: AuditRow): string {
  const label = TABLE_LABELS[row.table_name] ?? row.table_name;
  if (row.source === "auth") return label;
  return `${row.operation ?? "?"} · ${label}`;
}

/**
 * One field-level change, e.g. { old: 200000, new: 200100 } -> "200000 → 200100".
 * Objects/arrays are rare in the watched columns but rendered as JSON as a fallback.
 */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function DetailBody({ row }: { row: AuditRow }) {
  if (row.source === "auth") {
    const ip = row.detail.ip as string | undefined;
    const ua = row.detail.user_agent as string | undefined;
    return (
      <div className="text-xs text-black-600 space-y-1">
        <div><span className="text-black-400">IP:</span> {ip ?? "—"}</div>
        <div><span className="text-black-400">Device:</span> {ua ?? "—"}</div>
      </div>
    );
  }

  const entries = Object.entries(row.detail);
  if (entries.length === 0) {
    return <p className="text-xs text-black-400">No column changes recorded.</p>;
  }

  return (
    <div className="space-y-1.5">
      {entries.map(([col, change]) => {
        const c = change as { old?: unknown; new?: unknown };
        const hasOld = "old" in c;
        const hasNew = "new" in c;
        return (
          <div key={col} className="text-xs">
            <span className="font-mono text-black-500">{col}</span>{" "}
            {hasOld && hasNew ? (
              <>
                <span className="text-cinnabar-600 line-through">{formatValue(c.old)}</span>
                {" → "}
                <span className="text-viridian-700 font-medium">{formatValue(c.new)}</span>
              </>
            ) : hasNew ? (
              <span className="text-viridian-700 font-medium">{formatValue(c.new)}</span>
            ) : (
              <span className="text-cinnabar-600 line-through">{formatValue(c.old)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AuditLogClient({
  initialRows,
  restaurantId,
}: {
  initialRows: AuditRow[];
  /** When set, this view is embedded (e.g. the merchant detail Activity tab) — the
   * restaurant column is hidden and "load more" stays scoped to this restaurant. */
  restaurantId?: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [sourceFilter, setSourceFilter] = useState<"all" | "activity" | "auth">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(initialRows.length === 0);

  const visible = rows.filter((r) => sourceFilter === "all" || r.source === sourceFilter);

  async function loadMore() {
    const oldest = rows[rows.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ before: oldest.created_at, limit: "100" });
      if (restaurantId) params.set("restaurantId", restaurantId);
      const res = await fetch(`/api/admin/audit?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { rows?: AuditRow[] };
      const more = data.rows ?? [];
      setRows((prev) => [...prev, ...more]);
      if (more.length < 100) setExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {(["all", "activity", "auth"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setSourceFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
              sourceFilter === f
                ? "bg-purple-500 text-white"
                : "text-black-500 hover:bg-black-50 bg-black-50/60"
            )}
          >
            {f === "all" ? "All" : f === "activity" ? "Data changes" : "Sign-ins"}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-black-400 py-8 text-center">No activity recorded yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          {visible.map((row) => {
            const isOpen = expanded === row.id;
            const badgeKey = row.source === "auth" ? row.table_name : (row.operation ?? "");
            return (
              <div key={row.id} className="border-b border-black-100 last:border-0">
                <button
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black-50/50 transition-colors cursor-pointer"
                >
                  {row.source === "auth" ? (
                    row.table_name === "sign_in" ? (
                      <LogIn size={14} className="text-viridian-600 flex-shrink-0" />
                    ) : (
                      <LogOut size={14} className="text-black-400 flex-shrink-0" />
                    )
                  ) : (
                    <RefreshCw size={14} className="text-purple-500 flex-shrink-0" />
                  )}

                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0",
                      OP_STYLES[badgeKey] ?? "bg-black-100 text-black-600"
                    )}
                  >
                    {summary(row)}
                  </span>

                  <span className="flex-1 min-w-0 text-sm text-black-900 truncate">
                    {row.actor_name || row.actor_email || (
                      <span className="text-black-400 italic">system</span>
                    )}
                    {!restaurantId && row.restaurant_name && (
                      <span className="text-black-400"> · {row.restaurant_name}</span>
                    )}
                  </span>

                  <span className="text-xs text-black-400 flex-shrink-0">
                    {new Date(row.created_at).toLocaleString("en-NG")}
                  </span>

                  {isOpen ? (
                    <ChevronUp size={14} className="text-black-300 flex-shrink-0" />
                  ) : (
                    <ChevronDown size={14} className="text-black-300 flex-shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-3 pl-11 bg-black-50/30">
                    <DetailBody row={row} />
                    {row.actor_email && (
                      <p className="text-[11px] text-black-400 mt-2">
                        {row.actor_email}
                        {row.actor_role_label ? ` · ${row.actor_role_label}` : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!exhausted && rows.length > 0 && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-2 rounded-xl text-sm font-medium text-black-500 hover:bg-black-50 disabled:opacity-60 transition-colors cursor-pointer"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
