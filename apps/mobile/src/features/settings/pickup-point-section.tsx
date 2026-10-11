/**
 * Rider pickup point — RN port of the web `RiderPickupPointSection` +
 * `PickupPointPicker`.
 *
 * Riders are given a street name (Bolt reverse-geocodes the coordinate we
 * send), not the business name — so if the name they get is the road behind
 * the store, they arrive on the wrong side. This offers the labels actually
 * reachable around the store and asks which street the entrance is on.
 *
 * Hidden until the address is confirmed, like web: there's nothing to pick
 * around until the store has a verified pin.
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Navigation } from "lucide-react-native";

import { theme } from "../../theme";
import {
  ApiError,
  fetchPickupOptions,
  savePickupPoint,
  type PickupCandidate,
} from "../../lib/api";
import { ErrorText, PrimaryButton, SecondaryButton, Section } from "./ui";

type Options = Awaited<ReturnType<typeof fetchPickupOptions>>;

export function PickupPointSection({
  verified,
  initialLabel,
  initialIsStorefront,
}: {
  verified: boolean;
  initialLabel: string | null;
  initialIsStorefront: boolean;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!verified) return null;

  const currentLabel = saved ?? initialLabel;
  const isStorefront = saved !== null ? false : initialIsStorefront;

  async function loadOptions() {
    setLoading(true);
    setError("");
    try {
      setOptions(await fetchPickupOptions());
      setSelected(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load pickup options");
    }
    setLoading(false);
  }

  async function save(candidate: PickupCandidate) {
    setSaving(true);
    setError("");
    try {
      // The storefront option clears the override rather than storing a
      // duplicate of the address coordinates, so a later address change
      // carries the pickup point with it instead of stranding it.
      const res = await savePickupPoint(
        candidate.distanceM === 0 ? null : candidate.lat,
        candidate.distanceM === 0 ? null : candidate.lng
      );
      setSaved(res.label ?? candidate.label);
      setOptions(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save pickup point");
    }
    setSaving(false);
  }

  return (
    <Section
      title="Rider pickup point"
      icon={<Navigation size={18} color={theme.colors.brand} strokeWidth={2.25} />}
      subtitle="Riders are given a street name, not your business name — so if the name they get is the road behind you, they arrive on the wrong side and call to ask. Check what they're told, and move the pickup to the street your entrance is on."
    >
      <View style={styles.currentBox}>
        <Text style={styles.muted}>Riders are currently told:</Text>
        <Text style={styles.currentLabel}>{currentLabel ?? "— not checked yet —"}</Text>
        {isStorefront && currentLabel ? (
          <Text style={styles.muted}>This is your store address pin.</Text>
        ) : null}
      </View>

      {!options && (
        <SecondaryButton
          label={loading ? "Checking nearby spots…" : "Check nearby pickup spots"}
          onPress={loadOptions}
          disabled={loading}
        />
      )}
      {loading && <ActivityIndicator color={theme.colors.brand} />}

      {options && (
        <View style={{ gap: 8 }}>
          <Text style={styles.muted}>
            Pick the street your entrance is on. Riders are sent to that exact spot.
          </Text>
          {options.candidates.length <= 1 && (
            <Text style={styles.muted}>
              Only one address is available within 100m of this store, so there is nothing to
              change — riders already get the closest name there is.
            </Text>
          )}
          {options.candidates.map((c) => {
            const key = `${c.lat},${c.lng}`;
            const active = selected === key;
            return (
              <Pressable
                key={key}
                onPress={() => setSelected(key)}
                style={[
                  styles.candidate,
                  active && { borderColor: theme.colors.brand, backgroundColor: theme.colors.primary[50] },
                ]}
              >
                <Text style={styles.candidateLabel}>{c.label}</Text>
                <Text style={styles.muted}>
                  {c.distanceM === 0 ? "Your store address pin" : `${c.distanceM}m ${c.direction}`}
                </Text>
              </Pressable>
            );
          })}
          {error ? <ErrorText>{error}</ErrorText> : null}
          <PrimaryButton
            label="Save pickup point"
            busy={saving}
            disabled={!selected}
            onPress={() => {
              const c = options.candidates.find((x) => `${x.lat},${x.lng}` === selected);
              if (c) void save(c);
            }}
          />
          <SecondaryButton
            label="Cancel"
            onPress={() => {
              setOptions(null);
              setError("");
            }}
          />
        </View>
      )}

      {saved && !options ? (
        <Text style={styles.savedText}>✓ Saved. Riders will now be told {saved}.</Text>
      ) : null}
      {error && !options ? <ErrorText>{error}</ErrorText> : null}
    </Section>
  );
}

const styles = {
  currentBox: {
    backgroundColor: theme.colors.black[50],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  currentLabel: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.black[900] },
  muted: { fontSize: 12, color: theme.colors.black[400], lineHeight: 17 },
  candidate: {
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  candidateLabel: { fontSize: 14, fontWeight: "600" as const, color: theme.colors.black[900] },
  savedText: { fontSize: 12, fontWeight: "600" as const, color: theme.colors.viridian[500] },
};
