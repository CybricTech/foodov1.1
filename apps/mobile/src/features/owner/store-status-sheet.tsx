/**
 * Store open/close sheet — RN port of the web `StoreStatusControl`.
 *
 * Lets the owner flip the store open/closed from Home and, when closing, pick a
 * closure message: built-in suggestions plus their own recently-used messages.
 * Writes go through the authed Supabase client under the
 * restaurants_merchant_update RLS policy (own restaurant only), with the same
 * columns web writes — the recent list is newest-first and capped on
 * restaurants.closure_message_history.
 */
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Power } from "lucide-react-native";

import { nextOpenLabel, type OpeningHours } from "@foodo/utils";

import { getSupabase } from "../../lib/supabase";
import { theme } from "../../theme";

const SUGGESTIONS = [
  "We're taking a short break — back soon!",
  "Closed for today — see you tomorrow!",
  "Fully booked right now, back in about an hour.",
  "Kitchen's on a quick break, back shortly.",
  "Closed for a public holiday. Thanks for your patience!",
];

const MAX_HISTORY = 6;

export function StoreStatusSheet({
  visible,
  onClose,
  restaurantId,
  acceptsOrders,
  withinHours,
  openingHours,
  initialClosureMessage,
  initialHistory,
  onAcceptsOrdersChange,
}: {
  visible: boolean;
  onClose: () => void;
  restaurantId: string;
  acceptsOrders: boolean;
  withinHours: boolean;
  openingHours: OpeningHours | null;
  initialClosureMessage: string | null;
  initialHistory: string[];
  onAcceptsOrdersChange: (next: boolean, closureMessage: string | null, history: string[]) => void;
}) {
  const [message, setMessage] = useState(initialClosureMessage ?? "");
  const [history, setHistory] = useState<string[]>(initialHistory);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMessage(initialClosureMessage ?? "");
  }, [initialClosureMessage]);
  useEffect(() => {
    setHistory(initialHistory);
  }, [initialHistory]);

  const effectiveOpen = acceptsOrders && withinHours;
  const scheduleClosed = acceptsOrders && !withinHours;

  async function persist(nextOpen: boolean, closureMessage: string) {
    const supabase = getSupabase();
    if (!supabase) return;
    setSaving(true);
    setError("");
    const trimmed = closureMessage.trim();
    // When closing with a message, remember it (newest-first, deduped, capped).
    const nextHistory =
      !nextOpen && trimmed
        ? [trimmed, ...history.filter((m) => m !== trimmed)].slice(0, MAX_HISTORY)
        : history;

    const { error: e } = await supabase
      .from("restaurants")
      .update({
        accepts_orders: nextOpen,
        closure_message: trimmed || null,
        closure_message_history: nextHistory,
      })
      .eq("id", restaurantId);

    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    setHistory(nextHistory);
    onAcceptsOrdersChange(nextOpen, trimmed || null, nextHistory);
    if (nextOpen) onClose();
  }

  const tone = effectiveOpen
    ? { bg: theme.colors.viridian[100], fg: theme.colors.viridian[500] }
    : scheduleClosed
      ? { bg: theme.colors.dixie[100], fg: theme.colors.black[900] }
      : { bg: theme.colors.cinnabar[100], fg: theme.colors.cinnabar[500] };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={() => {}} style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.iconTile, { backgroundColor: tone.bg }]}>
              <Power size={18} color={tone.fg} strokeWidth={2.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Store is {effectiveOpen ? "open" : "closed"}</Text>
              <Text style={styles.sub}>
                {effectiveOpen
                  ? "Accepting orders now"
                  : scheduleClosed
                    ? nextOpenLabel(openingHours) ?? "Outside your opening hours"
                    : "You've closed the store"}
              </Text>
            </View>
          </View>

          {scheduleClosed && (
            <Text style={styles.scheduleNote}>
              You&rsquo;re set to accept orders, but customers can&rsquo;t order outside your opening
              hours. Change them in Settings → Operating hours.
            </Text>
          )}

          {acceptsOrders ? (
            <ActionButton
              label={saving ? "Closing…" : "Close store"}
              color={theme.colors.cinnabar[500]}
              disabled={saving}
              onPress={() => void persist(false, message)}
            />
          ) : (
            <ActionButton
              label={saving ? "Opening…" : "Open store"}
              color={theme.colors.viridian[500]}
              disabled={saving}
              onPress={() => void persist(true, "")}
            />
          )}

          <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 6 }}>
              <Text style={styles.overline}>CLOSURE MESSAGE</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={200}
                placeholder="Shown to customers while you're closed (optional)"
                placeholderTextColor={theme.colors.black[400]}
                style={styles.input}
              />
            </View>

            {history.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={styles.chipHeading}>Recently used</Text>
                <View style={styles.chipWrap}>
                  {history.map((m) => (
                    <MessageChip key={m} text={m} active={message.trim() === m} onPress={() => setMessage(m)} />
                  ))}
                </View>
              </View>
            )}

            <View style={{ gap: 6 }}>
              <Text style={styles.chipHeading}>Suggestions</Text>
              <View style={styles.chipWrap}>
                {SUGGESTIONS.map((m) => (
                  <MessageChip key={m} text={m} active={message.trim() === m} onPress={() => setMessage(m)} />
                ))}
              </View>
            </View>

            {!acceptsOrders && (
              <ActionButton
                label={saving ? "Saving…" : "Save message"}
                color={theme.colors.brand}
                disabled={saving}
                onPress={() => void persist(false, message)}
              />
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionButton({
  label,
  color,
  disabled,
  onPress,
}: {
  label: string;
  color: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: color, opacity: disabled ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function MessageChip({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && { borderColor: theme.colors.primary[200], backgroundColor: theme.colors.primary[50] },
      ]}
    >
      <Text style={[styles.chipText, active && { color: theme.colors.brandDark }]}>
        {active ? "✓ " : ""}
        {text}
      </Text>
    </Pressable>
  );
}

const styles = {
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" as const },
  sheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    gap: 14,
  },
  grabber: {
    alignSelf: "center" as const,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.black[200],
    marginBottom: 2,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  title: { fontSize: 16, fontWeight: "700" as const, color: theme.colors.black[900] },
  sub: { fontSize: 12, color: theme.colors.black[400], marginTop: 1 },
  scheduleNote: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.black[900],
    backgroundColor: theme.colors.dixie[100],
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" as const },
  actionText: { color: theme.colors.white, fontWeight: "700" as const, fontSize: 15 },
  overline: { fontSize: 11, fontWeight: "700" as const, color: theme.colors.black[400], letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: "top" as const,
    color: theme.colors.black[900],
  },
  chipHeading: { fontSize: 12, fontWeight: "600" as const, color: theme.colors.black[400] },
  chipWrap: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: "100%" as const,
  },
  chipText: { fontSize: 12, color: theme.colors.black[500] },
  error: { fontSize: 12, color: theme.colors.cinnabar[500] },
};
