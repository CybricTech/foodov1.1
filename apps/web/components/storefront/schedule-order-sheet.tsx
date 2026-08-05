"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Zap, CalendarClock, Check } from "lucide-react";
import {
  generateScheduleSlots,
  formatLagosDayLabel,
  formatLagosTimeRange,
  lagosDateKey,
  type OpeningHours,
  type SchedulingSettings,
} from "@foodo/utils";
import { cn } from "@foodo/ui";
import { useScrollLock } from "@/lib/hooks/use-scroll-lock";

/**
 * "When would you like this?" bottom sheet — day list + time list side by
 * side, independently scrollable, with a pinned Confirm button. Replaces the
 * old always-expanded Now/Later toggle + inline picker with a single compact
 * trigger row in checkout, so the order-type card doesn't grow taller the
 * moment a merchant enables pre-orders.
 */
export function ScheduleOrderSheet({
  fulfillmentType,
  openingHours,
  schedulingSettings,
  allowNow,
  requiredNoticeHours,
  initialMode,
  initialSlot,
  brandColor,
  onClose,
  onConfirm,
}: {
  fulfillmentType: "pickup" | "delivery";
  openingHours: OpeningHours | null | undefined;
  /** Already-effective settings (e.g. floored by a Made to Order item's lead
   *  time) — this component doesn't re-derive that, it just renders slots. */
  schedulingSettings: SchedulingSettings;
  /** False when the store is schedule-closed or a Made to Order item forces
   *  scheduling — hides the "Order now" option entirely. */
  allowNow: boolean;
  /** Set when a Made to Order item is forcing scheduling — shows the reason
   *  inline so a customer who opens the sheet without reading the trigger
   *  row still understands why "Order now" isn't offered. */
  requiredNoticeHours?: number | null;
  initialMode: "now" | "later";
  initialSlot: string | null;
  brandColor?: string;
  onClose: () => void;
  onConfirm: (mode: "now" | "later", slotIso: string | null) => void;
}) {
  const [draftMode, setDraftMode] = useState<"now" | "later">(
    allowNow ? initialMode : "later"
  );
  const [draftSlot, setDraftSlot] = useState<string | null>(initialSlot);
  const accent = brandColor ?? "#7B2CBF";

  // This sheet is only mounted while it is open, so the lock is simply its
  // lifetime. It had none at all, which on a long checkout page meant the form
  // scrolled away behind the day/time lists as the customer picked a slot.
  useScrollLock(true);

  // Re-generate every minute so a sheet left open can't offer a stale slot.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const days = useMemo(() => {
    const now = new Date(nowTick);
    const slots = generateScheduleSlots({ openingHours, schedulingSettings, now });
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
  const activeDay = days.find((d) => d.key === activeDayKey) ?? days[0] ?? null;

  // Keep the day list positioned on whatever day the current selection is on.
  useEffect(() => {
    if (draftSlot) {
      const key = lagosDateKey(new Date(draftSlot));
      if (days.some((d) => d.key === key)) setActiveDayKey(key);
    }
  }, [draftSlot, days]);

  const fulfillmentLabel = fulfillmentType === "pickup" ? "pickup" : "delivery";
  const canConfirm = draftMode === "now" || !!draftSlot;

  return (
    <>
      {/* Backdrop — same fade-in used by every other bottom sheet (cart, item detail) */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fade-in" onClick={onClose} />

      {/* Sheet — same slide-up as every other bottom sheet, so it doesn't
          feel like it "just appears", especially when auto-opened. */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center animate-slide-up">
      <div className="bg-white rounded-t-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0">
          <div>
            <h2 className="text-xl font-extrabold text-black-900">
              Schedule {fulfillmentLabel}
            </h2>
            {!allowNow && requiredNoticeHours && (
              <p className="text-xs text-primary font-medium mt-1 leading-relaxed">
                This order includes a Made to Order item — please pick a time at
                least {requiredNoticeHours}h from now.
              </p>
            )}
            {!allowNow && !requiredNoticeHours && (
              <p className="text-xs text-black-400 font-medium mt-1">
                We&rsquo;re closed right now — pick a time for when we open.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black-100 text-black-500 hover:bg-black-200 transition-colors cursor-pointer flex-shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Now / Later switch */}
        {allowNow && (
          <div className="px-5 pb-3 flex-shrink-0">
            <div className="flex bg-black-100 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setDraftMode("now")}
                className={cn(
                  "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                  draftMode === "now"
                    ? "bg-white text-black-900 shadow-sm"
                    : "text-black-400 hover:text-black-600"
                )}
              >
                <Zap size={14} />
                Order now
              </button>
              <button
                type="button"
                onClick={() => setDraftMode("later")}
                className={cn(
                  "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                  draftMode === "later"
                    ? "bg-white text-black-900 shadow-sm"
                    : "text-black-400 hover:text-black-600"
                )}
              >
                <CalendarClock size={14} />
                Schedule for later
              </button>
            </div>
          </div>
        )}

        {/* Day / time two-pane list */}
        {draftMode === "later" && (
          <div className="flex-1 min-h-0 px-5 pb-2 overflow-hidden">
            {days.length === 0 ? (
              <p className="text-sm text-black-400 py-6 text-center">
                No bookable times right now — please check back later.
              </p>
            ) : (
              <div className="flex gap-3 h-full">
                {/* Days */}
                <div className="w-[38%] overflow-y-auto space-y-1.5 pr-1">
                  {days.map((day) => {
                    const isActive = day.key === activeDay?.key;
                    return (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => setActiveDayKey(day.key)}
                        className={cn(
                          "w-full text-left px-3 py-3 rounded-2xl text-sm font-semibold transition-colors cursor-pointer",
                          isActive
                            ? "text-white"
                            : "bg-black-50 text-black-600 hover:bg-black-100"
                        )}
                        style={isActive ? { backgroundColor: accent } : undefined}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>

                {/* Times for the active day */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pl-1 border-l border-black-100">
                  {activeDay?.slots.map((slot) => {
                    const iso = slot.toISOString();
                    const isSelected = draftSlot === iso;
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setDraftSlot(iso)}
                        className={cn(
                          "w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-sm font-semibold transition-colors cursor-pointer tabular-nums",
                          isSelected
                            ? "text-white"
                            : "bg-black-50 text-black-700 hover:bg-black-100"
                        )}
                        style={isSelected ? { backgroundColor: accent } : undefined}
                      >
                        {formatLagosTimeRange(slot, schedulingSettings.slot_granularity_minutes)}
                        {isSelected && <Check size={14} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Confirm */}
        <div className="px-5 py-4 border-t border-black-100 flex-shrink-0">
          <button
            onClick={() => {
              if (!canConfirm) return;
              onConfirm(draftMode, draftMode === "later" ? draftSlot : null);
            }}
            disabled={!canConfirm}
            className="w-full text-white font-bold py-3.5 rounded-2xl transition-colors text-base disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            style={{ backgroundColor: accent }}
          >
            Confirm
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
