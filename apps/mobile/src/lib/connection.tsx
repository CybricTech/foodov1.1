/**
 * Connection context — React Native port of the web `connection-context`.
 *
 * Combines two signals into a single status used by the banner + catch-up:
 *   - device network reachability, via `@react-native-community/netinfo`
 *     (replacing the web's `navigator.onLine` + window online/offline events),
 *   - Supabase Realtime channel health, reported by the orders screen
 *     (SUBSCRIBED → healthy; CHANNEL_ERROR/TIMED_OUT → unhealthy).
 *
 * status = offline (no network) | reconnecting (network up, realtime down) |
 *          online (both healthy).
 *
 * `onReconnect` registers a callback fired on the rising edge back to healthy,
 * so the orders screen can refetch the latest 200 orders to fill the gap that
 * Realtime does NOT replay. Identical semantics to web.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import NetInfo from "@react-native-community/netinfo";

export type ConnectionStatus = "online" | "offline" | "reconnecting";

interface ConnectionContextValue {
  status: ConnectionStatus;
  reportRealtimeStatus: (healthy: boolean) => void;
  onReconnect: (callback: () => void | Promise<void>) => () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [isNetworkOnline, setIsNetworkOnline] = useState(true);
  const [isRealtimeHealthy, setIsRealtimeHealthy] = useState(true);
  const wasDisconnectedRef = useRef(false);
  const callbacksRef = useRef<Set<() => void | Promise<void>>>(new Set());

  useEffect(() => {
    // NetInfo: treat reachable connection as online. `isInternetReachable` can
    // be null while probing — fall back to `isConnected` so we don't flap.
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online =
        state.isInternetReachable === null
          ? Boolean(state.isConnected)
          : Boolean(state.isConnected && state.isInternetReachable);
      setIsNetworkOnline(online);
    });
    NetInfo.fetch().then((state) => {
      const online =
        state.isInternetReachable === null
          ? Boolean(state.isConnected)
          : Boolean(state.isConnected && state.isInternetReachable);
      setIsNetworkOnline(online);
    });
    return unsubscribe;
  }, []);

  const status: ConnectionStatus = !isNetworkOnline
    ? "offline"
    : !isRealtimeHealthy
      ? "reconnecting"
      : "online";

  useEffect(() => {
    const isHealthy = isNetworkOnline && isRealtimeHealthy;
    if (!isHealthy) {
      wasDisconnectedRef.current = true;
    } else if (wasDisconnectedRef.current) {
      wasDisconnectedRef.current = false;
      callbacksRef.current.forEach((cb) => {
        try {
          const result = cb();
          if (result instanceof Promise) result.catch(console.error);
        } catch (err) {
          console.error("[connection] reconnect callback error:", err);
        }
      });
    }
  }, [isNetworkOnline, isRealtimeHealthy]);

  const reportRealtimeStatus = useCallback((healthy: boolean) => {
    setIsRealtimeHealthy(healthy);
  }, []);

  const onReconnect = useCallback((cb: () => void | Promise<void>) => {
    callbacksRef.current.add(cb);
    return () => {
      callbacksRef.current.delete(cb);
    };
  }, []);

  const value = useMemo<ConnectionContextValue>(
    () => ({ status, reportRealtimeStatus, onReconnect }),
    [status, reportRealtimeStatus, onReconnect]
  );

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error("useConnection must be used within ConnectionProvider");
  }
  return ctx;
}
