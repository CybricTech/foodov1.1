"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "custom", label: "Custom" },
];

export function FinanceFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // No period param → the server resolves the default 30-day range
  const period = searchParams.get("period") ?? "30d";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  // Local state for custom date inputs so they don't trigger a fetch on every keystroke
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  useEffect(() => { setCustomFrom(from); }, [from]);
  useEffect(() => { setCustomTo(to); }, [to]);

  function handlePeriodChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "30d") {
      params.delete("period");
    } else {
      params.set("period", value);
    }
    if (value !== "custom") {
      params.delete("from");
      params.delete("to");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustomRange() {
    if (!customFrom && !customTo) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", "custom");
    if (customFrom) params.set("from", customFrom); else params.delete("from");
    if (customTo) params.set("to", customTo); else params.delete("to");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
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

      {period === "custom" && (
        <div className="flex items-center gap-2 ml-1">
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
    </div>
  );
}
