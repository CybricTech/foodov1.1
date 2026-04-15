"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

interface DeliveryFiltersProps {
  restaurants: Array<{ id: string; name: string }>;
  totalCount: number;
}

export function DeliveryFilters({ restaurants, totalCount }: DeliveryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const restaurant = searchParams.get("restaurant") ?? "";
  const status = searchParams.get("status") ?? "";

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const hasFilters = restaurant || status;

  return (
    <div className="px-5 py-3 border-b border-black-100 flex flex-wrap items-center gap-3">
      {/* Restaurant filter */}
      <select
        value={restaurant}
        onChange={(e) => update("restaurant", e.target.value)}
        className="text-sm border border-black-200 rounded-lg px-3 py-1.5 text-black-700 focus:outline-none focus:border-black-400 bg-white min-w-[160px]"
      >
        <option value="">All restaurants</option>
        {restaurants.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>

      {/* Status filter */}
      <select
        value={status}
        onChange={(e) => update("status", e.target.value)}
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

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("restaurant");
            params.delete("status");
            router.push(`${pathname}?${params.toString()}`);
          }}
          className="text-xs text-black-400 hover:text-black-700 underline transition-colors"
        >
          Clear filters
        </button>
      )}

      <span className="ml-auto text-xs text-black-400 font-medium">
        {totalCount} record{totalCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
