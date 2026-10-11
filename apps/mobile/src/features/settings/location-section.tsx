/**
 * Restaurant location — RN port of the web `RestaurantLocationSection` +
 * `AddressPicker`.
 *
 * Coordinates are derived from a *picked* Google place, never typed: the API
 * (PATCH /api/merchant/location) rejects coordinates that don't arrive with
 * their address + place_id, because a coordinate that disagrees with its
 * address misprices every delivery and sends riders to the wrong pickup.
 * Editing the text clears the picked place, so a stale pin can't survive.
 *
 * Suggestions come from the web app's server-proxied /api/places/* routes, so
 * the Maps key stays server-side.
 */
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { MapPin } from "lucide-react-native";

import { theme } from "../../theme";
import { ApiError, resolvePlace, saveLocation, searchPlaces } from "../../lib/api";
import { ErrorText, Field, Input, PrimaryButton, Section } from "./ui";

interface PickedPlace {
  address: string;
  lat: number;
  lng: number;
  placeId: string;
}

export function LocationSection({
  initialAddress,
  initialLat,
  initialLng,
  initialVerified,
  initialMaxRadius,
  onSaved,
}: {
  initialAddress: string | null;
  initialLat: number | null;
  initialLng: number | null;
  /** True when the stored coordinates came from a picked place. */
  initialVerified: boolean;
  initialMaxRadius: number | null;
  /** Fired after a new address is saved (the pickup point depends on it). */
  onSaved?: (place: PickedPlace) => void;
}) {
  const [input, setInput] = useState(initialAddress ?? "");
  const [predictions, setPredictions] = useState<{ description: string; placeId: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [picked, setPicked] = useState<PickedPlace | null>(null);
  const [maxRadius, setMaxRadius] = useState(initialMaxRadius != null ? String(initialMaxRadius) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // The last confirmed state, so a successful save updates the status pill.
  const [confirmed, setConfirmed] = useState({
    lat: initialLat,
    lng: initialLng,
    verified: initialVerified,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(value: string) {
    setInput(value);
    setError("");
    // Editing the text invalidates the picked place and its coordinates.
    if (picked) setPicked(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 3) {
      requestSeq.current++;
      setPredictions([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      // Drop out-of-order responses so older input can't overwrite newer.
      const seq = ++requestSeq.current;
      try {
        const data = await searchPlaces(value);
        if (seq !== requestSeq.current) return;
        setPredictions((data.suggestions ?? []).filter((s) => s.description && s.placeId));
      } catch {
        if (seq !== requestSeq.current) return;
        setPredictions([]);
      }
      setSearching(false);
    }, 300);
  }

  async function selectPrediction(description: string, placeId: string) {
    requestSeq.current++;
    setInput(description);
    setPredictions([]);
    setSearching(false);
    setResolving(true);
    setError("");
    try {
      const data = await resolvePlace(placeId);
      const value: PickedPlace = {
        address: data.formattedAddress ?? description,
        lat: data.lat,
        lng: data.lng,
        placeId,
      };
      setInput(value.address);
      setPicked(value);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 0
          ? e.message
          : "Could not pin that address — pick another suggestion."
      );
    }
    setResolving(false);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await saveLocation({
        // Omitted when nothing new was picked, so saving just the radius
        // never disturbs an already-confirmed address.
        ...(picked
          ? {
              address: picked.address,
              latitude: picked.lat,
              longitude: picked.lng,
              place_id: picked.placeId,
            }
          : {}),
        max_delivery_radius_km: maxRadius ? parseInt(maxRadius, 10) : null,
      });
      if (picked) {
        setConfirmed({ lat: picked.lat, lng: picked.lng, verified: true });
        onSaved?.(picked);
        setPicked(null);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save location.");
    } finally {
      setSaving(false);
    }
  }

  const activeLat = picked?.lat ?? confirmed.lat;
  const activeLng = picked?.lng ?? confirmed.lng;
  const isVerified = picked !== null || confirmed.verified;
  const hasCoords = activeLat != null && activeLng != null;
  // Typed text that hasn't been turned into a place yet would be silently
  // ignored by the save, so say so.
  const unpickedEdit = !picked && input.trim() !== (initialAddress ?? "").trim() && input.trim().length > 0;

  return (
    <Section
      title="Restaurant location"
      icon={<MapPin size={18} color={theme.colors.brand} strokeWidth={2.25} />}
      subtitle="Pick your exact address below. This is the address shown on your storefront, the point delivery fees are measured from, and where riders are sent to collect orders."
    >
      <Field label="Store address" hint="Choose from the suggestions so we can pin your exact location.">
        <Input
          value={input}
          onChangeText={handleChange}
          placeholder="Start typing your street, estate or a landmark"
          autoCorrect={false}
        />
        {predictions.length > 0 && (
          <View style={styles.suggestBox}>
            {predictions.map((p) => (
              <Pressable
                key={p.placeId}
                onPress={() => void selectPrediction(p.description, p.placeId)}
                style={styles.suggestRow}
              >
                <MapPin size={13} color={theme.colors.black[400]} />
                <Text style={styles.suggestText}>{p.description}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </Field>

      {searching && <StatusLine text="Searching addresses…" />}
      {resolving && <StatusLine text="Pinning location…" />}
      {!searching && !resolving && input.trim().length >= 3 && predictions.length === 0 && unpickedEdit && (
        <Text style={styles.muted}>
          No registered places match — try the area, estate or a nearby landmark.
        </Text>
      )}

      {!searching && !resolving && hasCoords && (
        <View style={[styles.pill, { backgroundColor: isVerified ? theme.colors.viridian[100] : theme.colors.dixie[100] }]}>
          <Text style={[styles.pillTitle, { color: isVerified ? theme.colors.viridian[500] : theme.colors.black[900] }]}>
            {isVerified ? "✓ Location confirmed" : "⚠ Location unconfirmed"}
          </Text>
          <Text style={styles.muted}>
            {Number(activeLat).toFixed(6)}, {Number(activeLng).toFixed(6)}
            {!isVerified && " — pick your address above to confirm it"}
          </Text>
        </View>
      )}
      {!hasCoords && !searching && !resolving && (
        <View style={[styles.pill, { backgroundColor: theme.colors.dixie[100] }]}>
          <Text style={[styles.pillTitle, { color: theme.colors.black[900] }]}>⚠ Location not set</Text>
          <Text style={styles.muted}>Delivery fees fall back to the flat base rate until this is set.</Text>
        </View>
      )}

      <Field
        label="Max delivery radius (km)"
        hint="Orders beyond this distance will be rejected. Leave blank to use the platform default."
      >
        <Input value={maxRadius} onChangeText={setMaxRadius} keyboardType="numeric" placeholder="e.g. 15" />
      </Field>

      {unpickedEdit && (
        <Text style={[styles.muted, { color: theme.colors.black[500] }]}>
          Pick a suggestion to change your address — typed text alone isn&apos;t saved.
        </Text>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <PrimaryButton label={saved ? "Saved!" : "Save location"} onPress={handleSave} busy={saving} />
    </Section>
  );
}

function StatusLine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <ActivityIndicator size="small" color={theme.colors.black[400]} />
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

const styles = {
  suggestBox: {
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    overflow: "hidden" as const,
    backgroundColor: theme.colors.white,
  },
  suggestRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.black[50],
  },
  suggestText: { flex: 1, fontSize: 13, color: theme.colors.black[900] },
  muted: { fontSize: 12, color: theme.colors.black[400], lineHeight: 17 },
  pill: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  pillTitle: { fontSize: 12, fontWeight: "700" as const },
};
