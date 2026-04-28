"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useConnection } from "@/lib/connection-context";

/**
 * Drop-in component for server-rendered layouts.
 * Calls router.refresh() (re-requests all server components on the current page)
 * whenever the network reconnects or the browser tab becomes visible again.
 * Throttled to once per 5 seconds to avoid hammering the server.
 */
export function RouterAutoRefresh() {
  const router = useRouter();
  const { onReconnect } = useConnection();
  const lastRefreshRef = useRef(0);

  const refresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 5_000) return;
    lastRefreshRef.current = now;
    router.refresh();
  }, [router]);

  // Refresh when network/realtime connection is restored
  useEffect(() => {
    return onReconnect(refresh);
  }, [onReconnect, refresh]);

  // Refresh when the user switches back to this tab
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refresh]);

  return null;
}
