"use client";

import { useEffect, useState } from "react";
import { X, Clock } from "lucide-react";
import { useRestaurant } from "./restaurant-context";

type DayHours = { enabled: boolean; open: string; close: string };
type OpeningHours = Record<string, DayHours>;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS: Record<string, string> = {
  sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday",
  thu: "Thursday", fri: "Friday", sat: "Saturday",
};

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}:00${period}` : `${hour}:${String(m).padStart(2, "0")}${period}`;
}

function isCurrentlyOpen(hours: OpeningHours): boolean {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" })
  );
  const dayKey = DAY_KEYS[now.getDay()];
  const day = hours[dayKey];

  if (!day || !day.enabled) return false;

  const current = now.getHours() * 60 + now.getMinutes();
  const open = parseTime(day.open);
  const close = parseTime(day.close);

  if (close <= open) {
    return current >= open || current < close;
  }
  return current >= open && current < close;
}

function getNextOpenTime(hours: OpeningHours): string | null {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" })
  );
  const todayIdx = now.getDay();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  for (let offset = 0; offset < 7; offset++) {
    const idx = (todayIdx + offset) % 7;
    const key = DAY_KEYS[idx];
    const day = hours[key];
    if (!day?.enabled) continue;

    const openMins = parseTime(day.open);

    if (offset === 0) {
      if (openMins > currentMins) {
        return `Opens today at ${formatTime(day.open)}`;
      }
    } else {
      const label = offset === 1 ? "tomorrow" : DAY_LABELS[key];
      return `Opens ${label} at ${formatTime(day.open)}`;
    }
  }

  return null;
}

export function ClosedNotice() {
  const { restaurant } = useRestaurant();
  const hours = (restaurant as unknown as { opening_hours?: OpeningHours | null }).opening_hours;

  // hardClosed = merchant manually toggled "Accept orders" off
  // scheduleClosed = within operating hours but not the right time
  const [hardClosed, setHardClosed] = useState(false);
  const [scheduleClosed, setScheduleClosed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [nextOpen, setNextOpen] = useState<string | null>(null);

  useEffect(() => {
    function check() {
      if (!restaurant.accepts_orders) {
        setHardClosed(true);
        setScheduleClosed(false);
        setNextOpen(hours ? getNextOpenTime(hours) : null);
        return;
      }
      setHardClosed(false);
      if (hours && Object.keys(hours).length > 0) {
        const open = isCurrentlyOpen(hours);
        setScheduleClosed(!open);
        if (!open) setNextOpen(getNextOpenTime(hours));
      }
    }

    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [restaurant.accepts_orders, hours]);

  const closed = hardClosed || scheduleClosed;
  // Hard-closed modals cannot be dismissed — only schedule-based ones can
  const canDismiss = !hardClosed;

  if (!closed || (dismissed && canDismiss)) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="px-6 pt-6 pb-6">
          {/* Close button — only shown for schedule-based closures */}
          {canDismiss && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setDismissed(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-black-100 text-black-500 hover:bg-black-200 transition-colors cursor-pointer"
                aria-label="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* Icon */}
          <div className={`flex justify-center mb-5 ${canDismiss ? "" : "mt-3"}`}>
            <div className="w-20 h-20 bg-black-50 rounded-full flex items-center justify-center">
              <Clock size={36} className="text-black-400" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-black-900 text-center mb-2">
            We&apos;re closed right now
          </h2>

          {/* Subtitle */}
          <p className="text-sm text-black-500 text-center mb-1 leading-relaxed">
            {restaurant.name} isn&apos;t taking orders at the moment.
          </p>

          {/* Next open time */}
          {nextOpen ? (
            <p className="text-sm font-semibold text-black-900 text-center mb-6">
              {nextOpen}
            </p>
          ) : (
            <div className="mb-6" />
          )}

          {/* Browse button — only shown for schedule-based closures */}
          {canDismiss && (
            <button
              onClick={() => setDismissed(true)}
              className="w-full bg-black-900 hover:bg-black-800 text-white font-semibold py-3.5 rounded-2xl transition-colors text-sm cursor-pointer"
            >
              Browse menu anyway
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
