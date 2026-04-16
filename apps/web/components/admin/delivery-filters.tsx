"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useEffect } from "react";

interface DeliveryFiltersProps {
  restaurants: Array<{ id: string; name: string }>;
  totalCount: number;
}

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "", label: "All time" },
  { value: "custom", label: "Custom" },
];

export function DeliveryFilters({ restaurants, totalCount }: DeliveryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const restaurant = searchParams.get("restaurant") ?? "";
  const status = searchParams.get("status") ?? "";
  const period = searchParams.get("period") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  // Local state for custom date inputs so they don't trigger a fetch on every keystroke
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  // Keep local state in sync if URL changes from outside
  useEffect(() => { setCustomFrom(from); }, [from]);
  useEffect(() => { setCustomTo(to); }, [to]);

  const updateParam = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  function handlePeriodChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("period", value);
    } else {
      params.delete("period");
    }
    // Clear custom dates when switching away from custom
    if (value !== "custom") {
      params.delete("from");
      params.delete("to");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustomRange() {
    if (!customFrom && !customTo) return;
    updateParam({ period: "custom", from: customFrom, to: customTo });
  }

  const hasFilters = restaurant || status || period;

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    ["restaurant", "status", "period", "from", "to"].forEach((k) => params.delete(k));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="border-b border-black-100">
      {/* Period tabs */}
      <div className="px-5 pt-3 pb-0 flex items-center gap-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => handlePeriodChange(p.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              period === p.value
                ? "bg-black-900 text-white"
                : "text-black-500 hover:bg-black-100"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range inputs */}
      {period === "custom" && (
        <div className="px-5 py-2.5 flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="text-sm border border-black-200 rounded-lg px-3 py-1.5 text-black-700 focus:outline-none focus:border-black-400"
          />
          <span className="text-xs text-black-400">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="text-sm border border-black-200 rounded-lg px-3 py-1.5 text-black-700 focus:outline-none focus:border-black-400"
          />
          <button
            onClick={applyCustomRange}
            disabled={!customFrom && !customTo}
            className="text-sm font-semibold bg-black-900 text-white px-4 py-1.5 rounded-lg hover:bg-black-700 disabled:opacity-40 transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {/* Restaurant + status filters */}
      <div className="px-5 py-3 flex flex-wrap items-center gap-3">
        <select
          value={restaurant}
          onChange={(e) => updateParam({ restaurant: e.target.value })}
          className="text-sm border border-black-200 rounded-lg px-3 py-1.5 text-black-700 focus:outline-none focus:border-black-400 bg-white min-w-[160px]"
        >
          <option value="">All restaurants</option>
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => updateParam({ status: e.target.value })}
          className="text-sm border border-black-200 rounded-lg px-3 py-1.5 text-black-700 focus:outline-none focus:border-black-400 bg-white"
        >
          <option value="">All statuses</option>
          <option value="delivered">Delivered</option>
          <option value="in_transit">In transit</option>
          <option value="ready_for_pickup">Ready</option>
          <option value="preparing">Preparing</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-xs text-black-400 hover:text-black-700 underline transition-colors"
          >
            Clear all
          </button>
        )}

        <span className="ml-auto text-xs text-black-400 font-medium">
          {totalCount} record{totalCount !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
