"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import {
  generateScheduleSlots,
  formatLagosDayLabel,
  formatLagosTime,
  lagosDateKey,
  type OpeningHours,
  type SchedulingSettings,
} from "@foodo/utils";
import { cn } from "@foodo/ui";

/**
 * Two-step slot picker (day chips → time chips) for scheduled orders.
 * Slots come from the SAME shared generator the server validates against
 * (packages/utils/src/schedule-slots.ts), so anything pickable here is
 * bookable there. Used by checkout; the dashboard reschedule panel renders
 * its own compact variant from the same generator.
 */
export function ScheduleSlotPicker({
  openingHours,
  schedulingSettings,
  value,
  onChange,
  brandColor,
}: {
  openingHours: OpeningHours | null | undefined;
  schedulingSettings: SchedulingSettings;
  /** ISO string of the selected slot, or null. */
  value: string | null;
  onChange: (iso: string | null) => void;
  brandColor?: string;
}) {
  // Re-generate every minute so the earliest slots slide forward with time
  // and a picker left open can't offer a stale (now-invalid) slot.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const days = useMemo(() => {
    const now = new Date(nowTick);
    const slots = generateScheduleSlots({
      openingHours,
      schedulingSettings,
      now,
    });
    const groups: { key: string; label: string; slots: Date[] }[] = [];
    const seen = new Map<string, number>();
    for (const slot of slots) {
      const key = lagosDateKey(slot);
      if (!seen.has(key)) {
        seen.set(key, groups.length);
        groups.push({ key, label: formatLagosDayLabel(slot, now), slots: [] });
      }
      groups[seen.get(key)!].slots.push(slot);
    }
    return groups;
  }, [openingHours, schedulingSettings, nowTick]);

  const [activeDayKey, setActiveDayKey] = useState<string | null>(null);
  const activeDay =
    days.find((d) => d.key === activeDayKey) ?? days[0] ?? null;

  // If the selected slot slid out of validity (time passed, merchant paused),
  // clear it so checkout can't submit a dead slot.
  useEffect(() => {
    if (!value) return;
    const stillValid = days.some((d) =>
      d.slots.some((s) => s.toISOString() === value)
    );
    if (!stillValid) onChange(null);
  }, [days, value, onChange]);

  if (days.length === 0) {
    return (
      <div className="flex items-start gap-2.5 bg-black-50 rounded-xl px-3 py-3">
        <CalendarClock size={15} className="text-black-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-black-500 leading-relaxed">
          No bookable times right now — please check back later.
        </p>
      </div>
    );
  }

  const accent = brandColor ?? "#7B2CBF";

  return (
    <div className="space-y-3">
      {/* Day chips */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
        {days.map((day) => {
          const isActive = day.key === activeDay?.key;
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => setActiveDayKey(day.key)}
              className={cn(
                "flex-shrink-0 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors cursor-pointer",
                isActive
                  ? "text-white border-transparent"
                  : "bg-white text-black-600 border-black-200 hover:border-black-300"
              )}
              style={isActive ? { backgroundColor: accent } : undefined}
            >
              {day.label}
            </button>
          );
        })}
      </div>

      {/* Time chips */}
      <div className="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-0.5">
        {activeDay?.slots.map((slot) => {
          const iso = slot.toISOString();
          const isSelected = value === iso;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onChange(isSelected ? null : iso)}
              className={cn(
                "py-2.5 rounded-xl text-sm font-semibold border transition-colors cursor-pointer tabular-nums",
                isSelected
                  ? "text-white border-transparent"
                  : "bg-white text-black-700 border-black-200 hover:border-black-300"
              )}
              style={isSelected ? { backgroundColor: accent } : undefined}
            >
              {formatLagosTime(slot)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
