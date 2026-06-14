/**
 * Merchant loyalty (stamp-card) config — RN sibling of the web LoyaltyConfig.
 *
 * One program per restaurant, self-fetched + saved via the authed Supabase
 * client under the loyalty_programs_merchant RLS policy. formatLoyaltyReward
 * keeps the preview identical to web + the eventual customer view.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Stamp, Gift, Check } from "lucide-react-native";

import { formatLoyaltyReward } from "@foodo/utils";
import type { LoyaltyProgram } from "@foodo/database";

import { getSupabase } from "../../lib/supabase";
import { theme } from "../../theme";

const REWARD_TYPES = [
  { value: "free_delivery", label: "Free delivery" },
  { value: "free_item", label: "Free item" },
  { value: "percentage", label: "% off" },
  { value: "fixed", label: "₦ off" },
];

type FormState = {
  is_active: boolean;
  stamps_required: string;
  earn_min_order_naira: string;
  reward_type: string;
  reward_value: string;
  reward_label: string;
};

function toForm(p: LoyaltyProgram | null): FormState {
  return {
    is_active: p?.is_active ?? false,
    stamps_required: String(p?.stamps_required ?? 10),
    earn_min_order_naira: p?.earn_min_order_kobo ? String(p.earn_min_order_kobo / 100) : "",
    reward_type: p?.reward_type ?? "free_delivery",
    reward_value:
      p?.reward_type === "fixed" && p.reward_value != null
        ? String(p.reward_value / 100)
        : p?.reward_value != null
        ? String(p.reward_value)
        : "",
    reward_label: p?.reward_label ?? "",
  };
}

export function LoyaltyConfig({ restaurantId }: { restaurantId: string }) {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<LoyaltyProgram | null>(null);
  const [form, setForm] = useState<FormState>(toForm(null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  const usesValue = form.reward_type === "percentage" || form.reward_type === "fixed";

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("loyalty_programs")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    const p = (data as LoyaltyProgram | null) ?? null;
    setProgram(p);
    setForm(toForm(p));
    setLoading(false);
  }, [restaurantId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const previewLabel = useMemo(
    () =>
      formatLoyaltyReward({
        reward_type: form.reward_type,
        reward_value:
          form.reward_type === "fixed"
            ? Math.round((parseFloat(form.reward_value) || 0) * 100)
            : parseInt(form.reward_value, 10) || 0,
        reward_label: form.reward_label || null,
      }),
    [form.reward_type, form.reward_value, form.reward_label]
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setJustSaved(false);
  }

  async function save() {
    setError("");
    const stamps = parseInt(form.stamps_required, 10);
    if (!stamps || stamps < 2 || stamps > 100) {
      setError("Stamps must be between 2 and 100.");
      return;
    }
    if (form.reward_type === "percentage") {
      const v = parseInt(form.reward_value, 10);
      if (!v || v < 1 || v > 100) {
        setError("Percentage must be 1–100.");
        return;
      }
    }
    if (form.reward_type === "fixed" && !(parseFloat(form.reward_value) > 0)) {
      setError("Enter a valid amount off.");
      return;
    }
    if (!supabase) return;

    const payload = {
      restaurant_id: restaurantId,
      is_active: form.is_active,
      stamps_required: stamps,
      earn_min_order_kobo: form.earn_min_order_naira
        ? Math.round(parseFloat(form.earn_min_order_naira) * 100) || 0
        : 0,
      reward_type: form.reward_type,
      reward_value:
        form.reward_type === "percentage"
          ? parseInt(form.reward_value, 10)
          : form.reward_type === "fixed"
          ? Math.round(parseFloat(form.reward_value) * 100)
          : null,
      reward_max_discount_kobo: null,
      reward_label: form.reward_label.trim() || null,
    };

    setSaving(true);
    const { data, error: e } = await supabase
      .from("loyalty_programs")
      .upsert(payload, { onConflict: "restaurant_id" })
      .select("*")
      .single();
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    const p = data as LoyaltyProgram;
    setProgram(p);
    setForm(toForm(p));
    setJustSaved(true);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.brand} size="large" />
      </View>
    );
  }

  const dotCount = Math.min(parseInt(form.stamps_required, 10) || 0, 20);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
      {/* Preview card */}
      <LinearGradient
        colors={["#10002B", "#3C096C", "#7B2CBF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 24, padding: 20 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Stamp size={14} color="rgba(255,255,255,0.8)" />
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.5, color: "rgba(255,255,255,0.7)" }}>
            LOYALTY CARD
          </Text>
          <View
            style={{
              marginLeft: "auto",
              backgroundColor: form.is_active ? theme.colors.viridian[100] : "rgba(255,255,255,0.15)",
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: form.is_active ? theme.colors.viridian[500] : "rgba(255,255,255,0.7)",
              }}
            >
              {form.is_active ? "Active" : "Off"}
            </Text>
          </View>
        </View>
        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 12 }}>
          Collect {form.stamps_required || "—"} stamps
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 }}>
          Reward: <Text style={{ color: "#fff", fontWeight: "700" }}>{previewLabel}</Text>
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
          {Array.from({ length: dotCount }).map((_, i) => (
            <View
              key={i}
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.3)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {i === dotCount - 1 ? <Gift size={11} color="rgba(255,255,255,0.8)" /> : null}
            </View>
          ))}
        </View>
      </LinearGradient>

      {error ? (
        <View
          style={{
            backgroundColor: theme.colors.cinnabar[100],
            borderRadius: 12,
            padding: 12,
          }}
        >
          <Text style={{ color: theme.colors.cinnabar[500], fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {/* Form card */}
      <View
        style={{
          backgroundColor: theme.colors.white,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.colors.black[100],
          padding: 16,
          gap: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.black[900] }}>
              Enable loyalty program
            </Text>
            <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}>
              Customers earn stamps on every paid order.
            </Text>
          </View>
          <Switch
            value={form.is_active}
            onValueChange={(v) => set("is_active", v)}
            trackColor={{ true: theme.colors.brand, false: theme.colors.black[200] }}
            thumbColor={theme.colors.white}
          />
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Field label="Stamps to unlock">
            <TextInput
              value={form.stamps_required}
              onChangeText={(t) => set("stamps_required", t)}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor={theme.colors.black[400]}
              style={inputStyle}
            />
          </Field>
          <Field label="Min order (₦)">
            <TextInput
              value={form.earn_min_order_naira}
              onChangeText={(t) => set("earn_min_order_naira", t)}
              keyboardType="numeric"
              placeholder="Any"
              placeholderTextColor={theme.colors.black[400]}
              style={inputStyle}
            />
          </Field>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={labelStyle}>Reward</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {REWARD_TYPES.map((r) => {
              const active = form.reward_type === r.value;
              return (
                <Pressable
                  key={r.value}
                  onPress={() => set("reward_type", r.value)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: active ? theme.colors.brand : theme.colors.black[50],
                    borderWidth: 1,
                    borderColor: active ? theme.colors.brand : theme.colors.black[200],
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: active ? theme.colors.white : theme.colors.black[500],
                    }}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {usesValue ? (
          <Field label={form.reward_type === "percentage" ? "Percent off (%)" : "Amount off (₦)"}>
            <TextInput
              value={form.reward_value}
              onChangeText={(t) => set("reward_value", t)}
              keyboardType="numeric"
              placeholder={form.reward_type === "percentage" ? "20" : "1000"}
              placeholderTextColor={theme.colors.black[400]}
              style={inputStyle}
            />
          </Field>
        ) : null}

        <Field label={form.reward_type === "free_item" ? "Item name" : "Reward label (optional)"}>
          <TextInput
            value={form.reward_label}
            onChangeText={(t) => set("reward_label", t)}
            placeholder={form.reward_type === "free_item" ? "e.g. Free regular meal" : "Shown to customers"}
            placeholderTextColor={theme.colors.black[400]}
            style={inputStyle}
          />
        </Field>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            onPress={save}
            disabled={saving}
            style={{
              backgroundColor: theme.colors.brand,
              opacity: saving ? 0.6 : 1,
              paddingHorizontal: 24,
              paddingVertical: 13,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: theme.colors.white, fontSize: 14, fontWeight: "700" }}>
              {saving ? "Saving…" : program ? "Save changes" : "Create program"}
            </Text>
          </Pressable>
          {justSaved ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Check size={15} color={theme.colors.viridian[500]} />
              <Text style={{ color: theme.colors.viridian[500], fontSize: 13, fontWeight: "600" }}>Saved</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Text style={{ fontSize: 12, color: theme.colors.black[400], paddingHorizontal: 4 }}>
        Customers earn stamps automatically on paid orders (by phone). Redemption at checkout and
        reminders come next.
      </Text>
    </ScrollView>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: theme.colors.black[200],
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 10,
  fontSize: 14,
  color: theme.colors.black[900],
  backgroundColor: theme.colors.white,
} as const;

const labelStyle = {
  fontSize: 11,
  fontWeight: "700",
  color: theme.colors.black[500],
  textTransform: "uppercase",
  letterSpacing: 0.5,
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={labelStyle}>{label}</Text>
      {children}
    </View>
  );
}
