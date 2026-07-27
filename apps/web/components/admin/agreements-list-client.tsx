"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type AgreementRow = {
  id: string;
  restaurant_id: string;
  status: string;
  legal_name: string | null;
  template_version: string;
  created_at: string;
  updated_at: string;
  merchant_signed_at: string | null;
  countersigned_at: string | null;
};

type MerchantRow = {
  restaurant_id: string;
  restaurant_name: string;
  restaurant_slug: string;
  restaurant_active: boolean;
  agreement: AgreementRow | null;
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  none: { label: "No agreement", className: "bg-black-50 text-black-400" },
  draft: { label: "Draft", className: "bg-black-100 text-black-500" },
  sent: { label: "Awaiting merchant", className: "bg-purple-100 text-purple-600" },
  merchant_signed: { label: "Awaiting countersign", className: "bg-dixie-100 text-dixie-600" },
  completed: { label: "Completed", className: "bg-viridian-100 text-viridian-600" },
  declined: { label: "Declined", className: "bg-cinnabar-100 text-cinnabar-600" },
  expired: { label: "Expired", className: "bg-black-100 text-black-400" },
  voided: { label: "Voided", className: "bg-black-100 text-black-400" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "none", label: "No agreement" },
  { key: "sent", label: "Awaiting merchant" },
  { key: "merchant_signed", label: "Awaiting countersign" },
  { key: "completed", label: "Completed" },
  { key: "other", label: "Declined / expired / voided" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function statusKey(agreement: AgreementRow | null): string {
  return agreement?.status ?? "none";
}

function matchesFilter(filter: FilterKey, key: string): boolean {
  if (filter === "all") return true;
  if (filter === "other") return ["declined", "expired", "voided"].includes(key);
  return filter === key;
}

export function AgreementsListClient({ rows }: { rows: MerchantRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const row of rows) {
      const key = statusKey(row.agreement);
      c[key] = (c[key] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(
    () => rows.filter((row) => matchesFilter(filter, statusKey(row.agreement))),
    [rows, filter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === f.key ? "bg-black-900 text-white" : "text-black-500 hover:bg-black-100"
            }`}
          >
            {f.label}
            {f.key !== "all" && f.key !== "other" && counts[f.key] ? (
              <span className="ml-1 opacity-60">{counts[f.key]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black-100 text-left text-xs text-black-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-semibold">Merchant</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Legal name</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const meta = STATUS_META[statusKey(row.agreement)] ?? STATUS_META.none;
              return (
                <tr key={row.restaurant_id} className="border-b border-black-50 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-black-900">{row.restaurant_name}</p>
                    {!row.restaurant_active && (
                      <span className="text-xs text-cinnabar-500">inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${meta.className}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-black-500">{row.agreement?.legal_name ?? "—"}</td>
                  <td className="px-4 py-3 text-black-400 text-xs">
                    {row.agreement ? new Date(row.agreement.updated_at).toLocaleDateString("en-NG") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/merchants/${row.restaurant_id}?tab=agreement`}
                      className="text-purple-500 hover:text-purple-400 font-medium text-xs"
                    >
                      Open &rarr;
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-black-400 text-sm">
                  No merchants match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
