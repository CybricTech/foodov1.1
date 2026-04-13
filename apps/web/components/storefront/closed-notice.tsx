"use client";

import { useEffect, useState } from "react";
import { useRestaurant } from "./restaurant-context";

type DayHours = { enabled: boolean; open: string; close: string };
type OpeningHours = Record<string, DayHours>;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isCurrentlyOpen(hours: OpeningHours): boolean {
  // Use Africa/Lagos (WAT, UTC+1)
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" })
  );
  const dayKey = DAY_KEYS[now.getDay()];
  const day = hours[dayKey];

  if (!day || !day.enabled) return false;

  const current = now.getHours() * 60 + now.getMinutes();
  const open = parseTime(day.open);
  const close = parseTime(day.close);

  // Handle overnight hours (close < open, e.g. 22:00–02:00)
  if (close <= open) {
    return current >= open || current < close;
  }
  return current >= open && current < close;
}

export function ClosedNotice() {
  const { restaurant } = useRestaurant();
  const hours = (restaurant as unknown as { opening_hours?: OpeningHours | null }).opening_hours;

  const [closed, setClosed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function check() {
      // Manual close always wins
      if (!restaurant.accepts_orders) {
        setClosed(true);
        return;
      }
      // If opening_hours are configured, check them
      if (hours && Object.keys(hours).length > 0) {
        setClosed(!isCurrentlyOpen(hours));
      }
    }

    check();
    // Re-check every minute
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [restaurant.accepts_orders, hours]);

  if (!closed || dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Top accent */}
        <div className="h-1.5 bg-cinnabar-500" />

        <div className="px-6 py-6 text-center">
          {/* Icon */}
          <div className="mx-auto mb-4 w-14 h-14 bg-cinnabar-100 rounded-full flex items-center justify-center">
            <svg className="w-7 h-7 text-cinnabar-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h2 className="text-lg font-bold text-black-900 mb-1">We&apos;re closed right now</h2>
          <p className="text-sm text-black-500 mb-6">
            {restaurant.name} isn&apos;t taking orders at the moment. You can still browse the menu and we&apos;ll be back soon!
          </p>

          {hours && (
            <div className="bg-black-50 rounded-xl px-4 py-3 mb-6 text-left">
              <p className="text-xs font-semibold text-black-500 mb-2 uppercase tracking-wide">Opening hours</p>
              <div className="space-y-1">
                {["mon","tue","wed","thu","fri","sat","sun"].map((key) => {
                  const day = hours[key];
                  const labels: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
                  return (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-black-500">{labels[key]}</span>
                      {day?.enabled
                        ? <span className="text-black-900 font-medium">{day.open} – {day.close}</span>
                        : <span className="text-black-400">Closed</span>
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={() => setDismissed(true)}
            className="w-full bg-black-900 text-white font-semibold py-3 rounded-xl hover:bg-black-800 transition-colors text-sm"
          >
            Browse menu anyway
          </button>
        </div>
      </div>
    </div>
  );
}
