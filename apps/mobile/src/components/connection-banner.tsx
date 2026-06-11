/**
 * Connection banner — RN port of the web `ConnectionBanner`.
 *
 * Renders nothing when healthy (except a brief "Back online" flash on recovery,
 * matching web). Sits above the tab bar so staff always see degraded state.
 */
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { useConnection, type ConnectionStatus } from "../lib/connection";
import { theme } from "../theme";

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { bg: string; text: string; sub: string }
> = {
  offline: {
    bg: theme.colors.cinnabar[500],
    text: "No internet connection",
    sub: "Trying to reconnect…",
  },
  reconnecting: {
    bg: theme.colors.dixie[500],
    text: "Reconnecting to server",
    sub: "Updates may be delayed",
  },
  online: {
    bg: theme.colors.viridian[500],
    text: "Back online",
    sub: "All updates synced",
  },
};

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
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: config.bg,
        paddingVertical: 10,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
        {config.text}
      </Text>
      <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12 }}>
        · {config.sub}
      </Text>
    </View>
  );
}
