"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@foodo/ui";

interface OrderEtaCountdownProps {
  estimatedDeliveryAt: string | null;
  status: string;
}

// The ETA represents when the food will be *ready*, not a delivery time —
// deliveries are fulfilled by 3rd-party riders whose timing we can't control.
// So we only surface the countdown while the order is still being prepared;
// once it's ready or dispatched we show no time at all.
const PRE_READY_STATUSES = new Set(["pending", "confirmed", "preparing"]);

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-NG", {
    timeZone: "Africa/Lagos",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s remaining`;
  }
  return `${seconds}s remaining`;
}

export function OrderEtaCountdown({
  estimatedDeliveryAt,
  status,
}: OrderEtaCountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);

  const showCountdown =
    !!estimatedDeliveryAt && PRE_READY_STATUSES.has(status);

  useEffect(() => {
    if (!showCountdown || !estimatedDeliveryAt) return;

    const estimatedAt = new Date(estimatedDeliveryAt).getTime();

    function tick() {
      setRemaining(estimatedAt - Date.now());
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [estimatedDeliveryAt, showCountdown]);

  if (!showCountdown || !estimatedDeliveryAt || remaining === null) {
    return null;
  }

  const estimatedAt = new Date(estimatedDeliveryAt);
  const isLate = remaining <= 0;

  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-5 flex items-start gap-3 border",
        isLate
          ? "bg-cinnabar-100 border-cinnabar-200"
          : "bg-primary/5 border-primary/10"
      )}
    >
      <Clock
        size={18}
        strokeWidth={1.75}
        className={cn(
          "mt-0.5 flex-shrink-0",
          isLate ? "text-cinnabar-500" : "text-primary"
        )}
      />
      <div className="flex-1 min-w-0">
        {isLate ? (
          <p className="text-sm font-semibold text-cinnabar-500 leading-snug">
            Running late — your restaurant has been notified
          </p>
        ) : (
          <>
            <p className="text-xs font-medium text-black-500 mb-0.5">
              Ready by {formatTime(estimatedAt)}
            </p>
            <p className="text-sm font-bold text-primary">
              {formatRemaining(remaining)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
