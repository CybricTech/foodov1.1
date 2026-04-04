"use client";

import { useState } from "react";
import { cn } from "@foodo/ui";
import { Bike } from "lucide-react";

interface RiderRow {
  id: string;
  user_id: string;
  vehicle_type: string | null;
  is_online: boolean;
  is_active: boolean;
  active_deliveries: number;
  total_deliveries: number;
  last_seen_at: string | null;
  user_profiles: { full_name: string | null; phone: string | null };
}

export function RidersClient({ initialRiders }: { initialRiders: RiderRow[] }) {
  const [riders, setRiders] = useState(initialRiders);
  const [toggling, setToggling] = useState<string | null>(null);

  async function toggleActive(userId: string, current: boolean) {
    setToggling(userId);
    const res = await fetch("/api/admin/riders/toggle-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isActive: !current }),
    });
    if (res.ok) {
      setRiders((prev) =>
        prev.map((r) =>
          r.user_id === userId ? { ...r, is_active: !current, is_online: !current ? false : r.is_online } : r
        )
      );
    }
    setToggling(null);
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-black-900 mb-6">
        Riders ({riders.length})
      </h1>

      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        {riders.length === 0 && (
          <div className="py-12 text-center text-black-400">
            <div className="flex justify-center mb-2"><Bike size={28} /></div>
            <p className="text-sm">No riders yet</p>
          </div>
        )}
        {riders.map((rider) => (
          <div
            key={rider.id}
            className="flex items-center gap-4 px-4 py-4 border-b border-black-200 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-black-900 text-sm">
                  {rider.user_profiles.full_name ?? "Unknown"}
                </p>
                {rider.is_online && (
                  <span className="w-2 h-2 bg-viridian-500 rounded-full" />
                )}
              </div>
              <p className="text-xs text-black-500 mt-0.5">
                {rider.user_profiles.phone} ·{" "}
                {rider.vehicle_type ?? "no vehicle"} ·{" "}
                {rider.total_deliveries} deliveries
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  rider.is_active
                    ? "bg-viridian-100 text-viridian-500"
                    : "bg-cinnabar-100 text-cinnabar-500"
                )}
              >
                {rider.is_active ? "Active" : "Suspended"}
              </span>
              <button
                onClick={() => toggleActive(rider.user_id, rider.is_active)}
                disabled={toggling === rider.user_id}
                className="text-xs text-black-500 hover:text-black-900 px-3 py-1.5 rounded-lg border border-black-200 hover:border-black-400 transition-colors disabled:opacity-50"
              >
                {toggling === rider.user_id
                  ? "…"
                  : rider.is_active
                  ? "Suspend"
                  : "Approve"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
