/**
 * Pre-orders (scheduled orders) — RN port of the web "Pre-orders" section.
 *
 * Controlled: the parent owns `scheduling_settings` and writes it with the
 * rest of the restaurant profile on "Save changes", exactly like web. Number
 * fields keep their own draft text, so clearing a field mid-edit doesn't snap
 * back to the default; valid input is clamped in as it's typed.
 */
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { CalendarClock } from "lucide-react-native";

import {
  SCHEDULING_DEFAULTS,
  type PausedRange,
  type SchedulingSettings,
} from "@foodo/utils";

import { theme } from "../../theme";
import { ErrorText, Field, Input, SecondaryButton, Section } from "./ui";

const SLOT_SIZES = [15, 30, 60] as const;

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const v = parseInt(raw, 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export function SchedulingSection({
  value,
  onChange,
}: {
  value: SchedulingSettings;
  onChange: (next: SchedulingSettings) => void;
}) {
  const [bookingWindow, setBookingWindow] = useState(String(value.booking_horizon_hours));
  const [earliest, setEarliest] = useState(String(value.min_lead_minutes));
  const [alertBefore, setAlertBefore] = useState(String(value.alert_lead_minutes));
  const [selfCancel, setSelfCancel] = useState(String(value.self_cancel_cutoff_minutes));

  const set = (patch: Partial<SchedulingSettings>) => onChange({ ...value, ...patch });

  function numberField(
    label: string,
    hint: string,
    draft: string,
    setDraft: (v: string) => void,
    key: "booking_horizon_hours" | "min_lead_minutes" | "alert_lead_minutes" | "self_cancel_cutoff_minutes",
    min: number,
    max: number
  ) {
    return (
      <Field label={label} hint={hint}>
        <Input
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            // Commit valid input right away: on native, tapping "Save changes"
            // doesn't blur the field first, so blur alone could drop the edit.
            if (Number.isFinite(parseInt(t, 10))) set({ [key]: clampInt(t, min, max, SCHEDULING_DEFAULTS[key]) });
          }}
          keyboardType="number-pad"
          onBlur={() => {
            const clamped = clampInt(draft, min, max, SCHEDULING_DEFAULTS[key]);
            setDraft(String(clamped));
            set({ [key]: clamped });
          }}
        />
      </Field>
    );
  }

  return (
    <Section
      title="Pre-orders"
      icon={<CalendarClock size={18} color={theme.colors.brand} strokeWidth={2.25} />}
      subtitle="Let customers book a future time slot at checkout — even while you're closed, so they can order ahead for when you open. A pre-order is paid in full up front and enters your live queue automatically at the booked time."
    >
      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Accept scheduled orders</Text>
          <Text style={styles.toggleSub}>Adds a “Schedule for later” option at checkout</Text>
        </View>
        <Switch
          value={value.enabled}
          onValueChange={(enabled) => set({ enabled })}
          trackColor={{ false: theme.colors.black[200], true: theme.colors.brand }}
          thumbColor={theme.colors.white}
        />
      </View>

      {value.enabled && (
        <>
          {numberField("Booking window (hours)", "How far ahead customers can book", bookingWindow, setBookingWindow, "booking_horizon_hours", 1, 720)}

          <Field label="Slot size (minutes)">
            <View style={{ flexDirection: "row", gap: 8 }}>
              {SLOT_SIZES.map((m) => {
                const active = value.slot_granularity_minutes === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => set({ slot_granularity_minutes: m })}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{m} min</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          {numberField("Earliest booking (minutes)", "Minimum lead time from now", earliest, setEarliest, "min_lead_minutes", 0, 1440)}

          <Field label="Capacity per slot" hint="Optional — soft cap shown to you only">
            <Input
              value={value.capacity_per_slot != null ? String(value.capacity_per_slot) : ""}
              onChangeText={(t) => {
                const v = t.trim();
                set({ capacity_per_slot: v ? Math.max(1, parseInt(v, 10) || 1) : null });
              }}
              keyboardType="number-pad"
              placeholder="No limit"
            />
          </Field>

          {numberField("Alert me before (minutes)", "Push notification lead time", alertBefore, setAlertBefore, "alert_lead_minutes", 1, 1440)}
          {numberField("Customer self-cancel cutoff (minutes)", "Before the slot", selfCancel, setSelfCancel, "self_cancel_cutoff_minutes", 0, 1440)}

          <PausedRangesField
            ranges={value.paused_ranges}
            onChange={(paused_ranges) => set({ paused_ranges })}
          />
        </>
      )}
    </Section>
  );
}

/** "2026-12-24 18:00" (device local time) → Date, or null if malformed. */
function parseLocal(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  // Reject roll-overs like 2026-02-31.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

function formatRangeEnd(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

/** Blackout windows (holidays, private events) — no bookable slots inside these. */
function PausedRangesField({
  ranges,
  onChange,
}: {
  ranges: PausedRange[];
  onChange: (ranges: PausedRange[]) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");

  function addRange() {
    const fromDate = parseLocal(from);
    const toDate = parseLocal(to);
    if (!fromDate || !toDate) {
      setError("Use the format YYYY-MM-DD HH:MM, e.g. 2026-12-24 18:00");
      return;
    }
    if (toDate <= fromDate) {
      setError("The end must be after the start.");
      return;
    }
    setError("");
    onChange([...ranges, { from: fromDate.toISOString(), to: toDate.toISOString() }]);
    setFrom("");
    setTo("");
  }

  return (
    <Field
      label="Blackout windows"
      hint="No slots will be offered inside these ranges (holidays, private events)."
    >
      {ranges.map((r, idx) => (
        <View key={`${r.from}-${r.to}`} style={styles.rangeRow}>
          <Text style={styles.rangeText}>
            {formatRangeEnd(r.from)} → {formatRangeEnd(r.to)}
          </Text>
          <Pressable
            onPress={() => onChange(ranges.filter((_, i) => i !== idx))}
            hitSlop={8}
            accessibilityLabel="Remove blackout window"
          >
            <Text style={styles.removeX}>✕</Text>
          </Pressable>
        </View>
      ))}
      <Input value={from} onChangeText={setFrom} placeholder="From — 2026-12-24 18:00" autoCapitalize="none" />
      <Input value={to} onChangeText={setTo} placeholder="To — 2026-12-26 09:00" autoCapitalize="none" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <SecondaryButton label="Add blackout window" onPress={addRange} disabled={!from || !to} />
    </Field>
  );
}

const styles = {
  toggleRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12 },
  toggleTitle: { fontSize: 14, fontWeight: "600" as const, color: theme.colors.black[900] },
  toggleSub: { fontSize: 12, color: theme.colors.black[400], marginTop: 1 },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center" as const,
  },
  chipActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.primary[50] },
  chipText: { fontSize: 13, fontWeight: "600" as const, color: theme.colors.black[500] },
  chipTextActive: { color: theme.colors.brand },
  rangeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: theme.colors.black[50],
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rangeText: { flex: 1, fontSize: 12, color: theme.colors.black[900] },
  removeX: { fontSize: 13, color: theme.colors.cinnabar[500], fontWeight: "700" as const },
};
