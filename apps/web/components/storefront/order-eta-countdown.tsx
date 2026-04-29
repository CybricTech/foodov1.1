"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@foodo/ui";

interface OrderEtaCountdownProps {
  estimatedDeliveryAt: string | null;
  status: string;
  fulfillmentType: "delivery" | "pickup";
}

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
  fulfillmentType,
}: OrderEtaCountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!estimatedDeliveryAt) return;
    if (status === "delivered" || status === "cancelled") return;

    const estimatedAt = new Date(estimatedDeliveryAt).getTime();

    function tick() {
      setRemaining(estimatedAt - Date.now());
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [estimatedDeliveryAt, status]);

  if (
    !estimatedDeliveryAt ||
    status === "delivered" ||
    status === "cancelled" ||
    remaining === null
  ) {
    return null;
  }

  const estimatedAt = new Date(estimatedDeliveryAt);
  const label = fulfillmentType === "delivery" ? "delivery" : "pickup";
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
              Est. {label} at {formatTime(estimatedAt)}
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
