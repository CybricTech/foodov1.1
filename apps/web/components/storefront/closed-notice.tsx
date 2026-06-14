"use client";

import { useEffect, useState } from "react";
import { X, Clock } from "lucide-react";
import {
  isWithinOpeningHours,
  nextOpenLabel,
  type OpeningHours,
} from "@foodo/utils";
import { useRestaurant } from "./restaurant-context";

export function ClosedNotice() {
  const { restaurant } = useRestaurant();
  const extended = restaurant as unknown as { opening_hours?: OpeningHours | null; closure_message?: string | null };
  const hours = extended.opening_hours;
  const closureMessage = extended.closure_message;

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
        setNextOpen(nextOpenLabel(hours));
        return;
      }
      setHardClosed(false);
      if (hours && Object.keys(hours).length > 0) {
        const open = isWithinOpeningHours(hours);
        setScheduleClosed(!open);
        if (!open) setNextOpen(nextOpenLabel(hours));
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
            {hardClosed && closureMessage
              ? closureMessage
              : `${restaurant.name} isn’t taking orders at the moment.`}
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
