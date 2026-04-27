"use client";

import { useEffect, useRef, useState } from "react";
import { WifiOff, Wifi, Loader2 } from "lucide-react";
import { cn } from "@foodo/ui";
import { useConnection, type ConnectionStatus } from "@/lib/connection-context";

const STATUS_CONFIG = {
  offline: {
    bg: "bg-cinnabar-500",
    text: "No internet connection",
    sub: "Trying to reconnect…",
  },
  reconnecting: {
    bg: "bg-dixie-500",
    text: "Reconnecting to server",
    sub: "Updates may be delayed",
  },
  online: {
    bg: "bg-viridian-500",
    text: "Back online",
    sub: "All updates synced",
  },
} as const;

export function ConnectionBanner() {
  const { status } = useConnection();
  const [showRestored, setShowRestored] = useState(false);
  const prevStatusRef = useRef<ConnectionStatus>(status);

  useEffect(() => {
    if (prevStatusRef.current !== "online" && status === "online") {
      setShowRestored(true);
      const t = setTimeout(() => setShowRestored(false), 2500);
      prevStatusRef.current = status;
      return () => clearTimeout(t);
    }
    prevStatusRef.current = status;
  }, [status]);

  if (status === "online" && !showRestored) return null;

  const config = STATUS_CONFIG[status];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-0 z-50 text-white shadow-md",
        config.bg
      )}
    >
      <div className="px-4 py-2.5 flex items-center justify-center gap-2.5">
        {status === "offline" && <WifiOff size={16} className="flex-shrink-0" />}
        {status === "reconnecting" && (
          <Loader2 size={16} className="flex-shrink-0 animate-spin" />
        )}
        {status === "online" && <Wifi size={16} className="flex-shrink-0" />}
        <span className="text-sm font-semibold">{config.text}</span>
        <span className="hidden sm:inline text-xs text-white/80">
          · {config.sub}
        </span>
      </div>
    </div>
  );
}
