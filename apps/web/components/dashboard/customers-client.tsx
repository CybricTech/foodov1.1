"use client";

import { useState } from "react";
import { formatKobo } from "@foodo/utils";
import type { Database } from "@foodo/database";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

interface CustomersClientProps {
  restaurantId: string;
  initialCustomers: CustomerRow[];
}

type SortKey = "total_spent_kobo" | "total_orders" | "last_order_at" | "first_order_at";

export function CustomersClient({
  restaurantId,
  initialCustomers,
}: CustomersClientProps) {
  const [customers] = useState(initialCustomers);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_spent_kobo");
  const [exporting, setExporting] = useState(false);

  const filtered = customers
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.full_name?.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return bv.localeCompare(av);
      }
      return (bv as number) - (av as number);
    });

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/merchant/customers/export?restaurantId=${restaurantId}`
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "customers.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="md:p-6 pb-24">
      <div className="bg-white md:rounded-2xl border-b md:border border-black-100 px-4 py-4 flex flex-wrap gap-3 items-center justify-between">
        <h1 className="font-bold text-black-900 text-lg">
          Customers ({customers.length})
        </h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="text-sm text-viridian-500 border border-viridian-500 px-4 py-2 rounded-xl hover:bg-viridian-500/10 disabled:opacity-60 transition-colors font-medium"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <div className="px-4 md:px-0 mt-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          className="flex-1 min-w-48 px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-viridian-500"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="px-4 py-2.5 rounded-xl border border-black-200 text-sm bg-white focus:outline-none focus:border-viridian-500"
        >
          <option value="total_spent_kobo">Sort: Total spent</option>
          <option value="total_orders">Sort: Total orders</option>
          <option value="last_order_at">Sort: Last order</option>
          <option value="first_order_at">Sort: First order</option>
        </select>
      </div>

      <div className="mt-4 px-4 md:px-0 bg-white md:rounded-2xl md:border border-black-100 overflow-hidden">
        {filtered.length === 0 && (
          <div className="py-12 text-center text-black-400">
            <p className="text-2xl mb-2">👥</p>
            <p className="text-sm">No customers yet</p>
          </div>
        )}
        {filtered.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-4 px-4 py-3 border-b border-black-50 last:border-0"
          >
            <div className="w-8 h-8 rounded-full bg-viridian-100 text-viridian-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {(c.full_name ?? c.phone)[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black-900">
                {c.full_name ?? "—"}
              </p>
              <p className="text-xs text-black-400">{c.phone}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-black-900">
                {formatKobo(c.total_spent_kobo)}
              </p>
              <p className="text-xs text-black-400">
                {c.total_orders} order{c.total_orders !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
