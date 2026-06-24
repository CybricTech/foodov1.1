"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useConnectionOptional } from "@/lib/connection-context";

/**
 * Drop-in component for server-rendered layouts. Re-requests all server
 * components on the current page (router.refresh()) so the user never stares at
 * a stale snapshot.
 *
 * Why this exists: Next.js keeps a client-side Router Cache of each visited
 * route's RSC payload for the lifetime of the tab. When you navigate via <Link>
 * it can serve that cached (often prefetched) payload instead of fetching fresh
 * — so admin/dashboard pages show data that's hours or days old until a hard
 * reload. A manual reload always pulls fresh data; this component replicates
 * that automatically.
 *
 * Triggers:
 *   - Every client-side navigation (pathname change) — guarantees fresh data on
 *     page entry. Not throttled: each new route must refetch.
 *   - Tab becomes visible / network reconnects — throttled to once per 5s.
 *   - Optional `intervalMs` poll — near-realtime while sitting on a page.
 */
export function RouterAutoRefresh({ intervalMs }: { intervalMs?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const connection = useConnectionOptional();
  const lastRefreshRef = useRef(0);

  // Throttled refresh for high-frequency triggers (focus, reconnect, interval).
  const refresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 5_000) return;
    lastRefreshRef.current = now;
    router.refresh();
  }, [router]);

  // Fresh data on every client-side navigation. Skips the very first mount
  // (the initial load already rendered fresh server data, so refreshing again
  // would just be a wasted round-trip).
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    lastRefreshRef.current = Date.now();
    router.refresh();
  }, [pathname, router]);

  // Refresh when network/realtime connection is restored (only if provider is mounted)
  useEffect(() => {
    if (!connection) return;
    return connection.onReconnect(refresh);
  }, [connection, refresh]);

  // Refresh when the user switches back to this tab
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refresh]);

  // Optional near-realtime polling while the user stays on a page.
  useEffect(() => {
    if (!intervalMs || intervalMs <= 0) return;
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, refresh]);

  return null;
}
