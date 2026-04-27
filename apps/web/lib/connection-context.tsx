"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

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
    setIsNetworkOnline(navigator.onLine);
    const handleOnline = () => setIsNetworkOnline(true);
    const handleOffline = () => setIsNetworkOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
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

  return (
    <ConnectionContext.Provider
      value={{ status, reportRealtimeStatus, onReconnect }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error("useConnection must be used within ConnectionProvider");
  }
  return ctx;
}
