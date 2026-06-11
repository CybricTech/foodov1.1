/**
 * Dispatch modal — RN port of the web frontline dispatch flow.
 *
 * Two steps mirroring web: (1) choose Platform Rider vs In-House Rider, then
 * (2) confirm. On confirm it first marks the order ready_for_pickup, then calls
 * the dispatch API (both via Bearer-authed routes). The parent owns the actual
 * API calls + optimistic state; this component is presentational + step state.
 */
import { Modal, Pressable, Text, View } from "react-native";

import { theme } from "../../theme";
import type { OrderRow } from "./types";

export interface DispatchState {
  order: OrderRow;
  step: "select" | "confirm";
  selectedType: "platform_rider" | "own_rider" | null;
}

interface DispatchModalProps {
  state: DispatchState | null;
  loading: boolean;
  error: string | null;
  onChange: (next: DispatchState) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function DispatchModal({
  state,
  loading,
  error,
  onChange,
  onConfirm,
  onClose,
}: DispatchModalProps) {
  return (
    <Modal
      visible={!!state}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        {state && (
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: 32,
            }}
          >
            {state.step === "select" ? (
              <>
                <Header
                  title="Choose Delivery Method"
                  subtitle={`Order #${state.order.order_number}`}
                  onClose={onClose}
                />
                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    paddingHorizontal: 20,
                    paddingBottom: 8,
                  }}
                >
                  <Choice
                    title="Platform Rider"
                    subtitle="Request from app"
                    accent={theme.colors.brand}
                    accentSoft={theme.colors.primary[50]}
                    onPress={() =>
                      onChange({ ...state, selectedType: "platform_rider", step: "confirm" })
                    }
                  />
                  <Choice
                    title="In-House Rider"
                    subtitle="Your own rider"
                    accent={theme.colors.black[900]}
                    accentSoft={theme.colors.black[50]}
                    onPress={() =>
                      onChange({ ...state, selectedType: "own_rider", step: "confirm" })
                    }
                  />
                </View>
              </>
            ) : (
              <>
                <Header
                  title="Confirm Dispatch"
                  subtitle={`Order #${state.order.order_number}`}
                />
                <View style={{ paddingHorizontal: 20 }}>
                  <View
                    style={{
                      borderRadius: 12,
                      padding: 16,
                      backgroundColor:
                        state.selectedType === "platform_rider"
                          ? theme.colors.primary[50]
                          : theme.colors.black[50],
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "800",
                        color:
                          state.selectedType === "platform_rider"
                            ? theme.colors.brand
                            : theme.colors.black[900],
                      }}
                    >
                      {state.selectedType === "platform_rider"
                        ? "Platform Rider"
                        : "In-House Rider"}
                    </Text>
                    <Text style={{ fontSize: 13, color: theme.colors.black[500], marginTop: 3 }}>
                      {state.selectedType === "platform_rider"
                        ? "A rider will be requested from the app"
                        : "Your own rider will handle delivery"}
                    </Text>
                  </View>
                  {!!error && (
                    <Text style={{ fontSize: 13, color: theme.colors.cinnabar[500], marginTop: 10 }}>
                      {error}
                    </Text>
                  )}
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                    <Pressable
                      onPress={() => onChange({ ...state, step: "select" })}
                      disabled={loading}
                      style={({ pressed }) => ({
                        flex: 1,
                        paddingVertical: 14,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: theme.colors.black[200],
                        alignItems: "center",
                        opacity: loading ? 0.6 : pressed ? 0.8 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.black[900] }}>
                        Back
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={onConfirm}
                      disabled={loading}
                      style={({ pressed }) => ({
                        flex: 1,
                        paddingVertical: 14,
                        borderRadius: 12,
                        alignItems: "center",
                        backgroundColor:
                          state.selectedType === "platform_rider"
                            ? theme.colors.brand
                            : theme.colors.black[900],
                        opacity: loading ? 0.6 : pressed ? 0.85 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff" }}>
                        {loading ? "Dispatching…" : "Confirm"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

function Header({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 14,
      }}
    >
      <View>
        <Text style={{ fontSize: 17, fontWeight: "800", color: theme.colors.black[900] }}>
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      {onClose && (
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={{ fontSize: 20, color: theme.colors.black[400] }}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

function Choice({
  title,
  subtitle,
  accent,
  accentSoft,
  onPress,
}: {
  title: string;
  subtitle: string;
  accent: string;
  accentSoft: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: "center",
        gap: 8,
        padding: 18,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: accent,
        backgroundColor: accentSoft,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 14, fontWeight: "800", color: accent }}>{title}</Text>
      <Text style={{ fontSize: 11, color: theme.colors.black[500] }}>{subtitle}</Text>
    </Pressable>
  );
}
