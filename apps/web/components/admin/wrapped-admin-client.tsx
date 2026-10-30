"use client";

import { useState } from "react";
import Link from "next/link";
import { Gift, Play, Radio } from "lucide-react";
import { wrappedNaira, wrappedPeriodLabel, type WrappedEdition } from "@foodo/utils";
import { WrappedStory } from "@/components/dashboard/wrapped/wrapped-story";

export type AdminWrappedRow = {
  id: string;
  name: string;
  isTest: boolean;
  editions: WrappedEdition[];
};

export function WrappedAdminClient({ rows, live }: { rows: AdminWrappedRow[]; live: WrappedEdition | null }) {
  const [playing, setPlaying] = useState<WrappedEdition | null>(live);
  const withEditions = rows.filter((r) => r.editions.length > 0).length;

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="flex items-center gap-2">
        <Gift size={20} className="text-purple-600" />
        <h1 className="text-xl font-extrabold text-black-900">Kitchyn Wrapped</h1>
      </div>
      <p className="mt-1 text-sm text-black-500">
        Published on the last day of every month (09:00 Lagos). A merchant&rsquo;s first edition covers everything since
        they joined. {withEditions} of {rows.length} merchants have an edition.
      </p>

      <div className="mt-6 bg-white rounded-2xl border border-black-100 divide-y divide-black-100">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-black-900 truncate">
                {r.name}
                {r.isTest && <span className="ml-2 text-[11px] font-bold text-black-400">TEST</span>}
              </p>
              {r.editions[0] && (
                <p className="text-xs text-black-400">
                  {r.editions[0].stats.orders.toLocaleString("en-NG")} orders · {wrappedNaira(r.editions[0].stats.revenue_kobo)}
                </p>
              )}
            </div>
            {r.editions.map((e) => (
              <button
                key={e.period_key}
                onClick={() => setPlaying(e)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 cursor-pointer"
              >
                <Play size={12} fill="currentColor" />
                {e.scope === "all_time" ? "All-time" : wrappedPeriodLabel(e.period_key)}
              </button>
            ))}
            <Link
              href={`/admin/wrapped?live=${r.id}`}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-black-200 text-black-500 hover:bg-black-50"
              title="Build an unpublished all-time story up to right now"
            >
              <Radio size={12} />
              Live preview
            </Link>
          </div>
        ))}
      </div>

      {playing && <WrappedStory edition={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
