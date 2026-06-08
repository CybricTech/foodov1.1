/**
 * Create / edit a promo offer — RN port of the web `DiscountForm`.
 *
 * Mirrors the web form's fields, validation and payload exactly (read
 * marketing-client.tsx → DiscountForm). All writes go straight to the
 * `discounts` table through the authed `getSupabase()` client (RLS); there's no
 * privileged step, so no API route is involved. Naira inputs convert to kobo
 * with the same `* 100` the web form uses.
 */
import { useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, View } from "react-native";

import {
  DISCOUNT_TYPE_LABELS,
  type DiscountType,
  type DiscountTrigger,
} from "@foodo/utils";
import type { Discount } from "@foodo/database";

import { getSupabase } from "../../lib/supabase";
import { theme } from "../../theme";
import { Field, Input, ErrorText } from "../settings/ui";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

interface DiscountFormProps {
  restaurantId: string;
  discount: Discount | null;
  onClose: () => void;
  onSaved: (d: Discount) => void;
}

export function DiscountForm({ restaurantId, discount, onClose, onSaved }: DiscountFormProps) {
  const supabase = getSupabase();
  const isEdit = !!discount;

  const [name, setName] = useState(discount?.name ?? "");
  const [trigger, setTrigger] = useState<DiscountTrigger>(
    (discount?.trigger as DiscountTrigger) ?? "code"
  );
  const [code, setCode] = useState(discount?.code ?? "");
  const [type, setType] = useState<DiscountType>(
    (discount?.type as DiscountType) ?? "percentage"
  );
  const [percentValue, setPercentValue] = useState(
    discount?.type === "percentage" && discount?.value ? String(discount.value) : ""
  );
  const [fixedNaira, setFixedNaira] = useState(
    discount?.type === "fixed" && discount?.value ? String(discount.value / 100) : ""
  );
  const [maxDiscountNaira, setMaxDiscountNaira] = useState(
    discount?.max_discount_kobo ? String(discount.max_discount_kobo / 100) : ""
  );
  const [minOrderNaira, setMinOrderNaira] = useState(
    discount?.min_order_kobo ? String(discount.min_order_kobo / 100) : ""
  );
  const [fulfillment, setFulfillment] = useState<"" | "delivery" | "pickup">(
    (discount?.fulfillment_type as "delivery" | "pickup" | null) ?? ""
  );
  const [usageTotal, setUsageTotal] = useState(
    discount?.usage_limit_total ? String(discount.usage_limit_total) : ""
  );
  const [perCustomer, setPerCustomer] = useState(
    discount?.usage_limit_per_customer ? String(discount.usage_limit_per_customer) : ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function validate(): string | null {
    if (name.trim().length < 2) return "Give this offer a name.";
    if (trigger === "code" && code.trim().length < 3)
      return "Enter a promo code of at least 3 characters.";
    if (type === "percentage") {
      const v = Number(percentValue);
      if (!v || v <= 0 || v > 100) return "Enter a percentage between 1 and 100.";
    }
    if (type === "fixed") {
      const v = Number(fixedNaira);
      if (!v || v <= 0) return "Enter a discount amount greater than ₦0.";
    }
    return null;
  }

  async function handleSubmit() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (!supabase) return;
    setError("");
    setSaving(true);

    const naira = (s: string) => (s ? Math.round(Number(s) * 100) : null);

    const payload = {
      restaurant_id: restaurantId,
      name: name.trim(),
      trigger,
      code: trigger === "code" ? code.trim().toUpperCase() : null,
      type,
      value:
        type === "percentage"
          ? Number(percentValue)
          : type === "fixed"
            ? naira(fixedNaira)
            : null,
      max_discount_kobo: type === "percentage" ? naira(maxDiscountNaira) : null,
      min_order_kobo: naira(minOrderNaira) ?? 0,
      fulfillment_type: fulfillment || null,
      usage_limit_total: usageTotal ? Number(usageTotal) : null,
      usage_limit_per_customer: perCustomer ? Number(perCustomer) : null,
    };

    const result =
      isEdit && discount
        ? await supabase.from("discounts").update(payload).eq("id", discount.id).select("*").single()
        : await supabase.from("discounts").insert(payload).select("*").single();

    setSaving(false);

    if (result.error || !result.data) {
      const msg = result.error?.message ?? "";
      if (msg.includes("discounts_restaurant_code_unique")) {
        setError("That promo code is already in use. Pick another.");
      } else {
        setError(msg || "Could not save this offer. Please try again.");
      }
      return;
    }

    onSaved(result.data as Discount);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{isEdit ? "Edit offer" : "New offer"}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={{ fontSize: 16, color: theme.colors.black[400] }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <Field label="Offer name">
              <Input value={name} onChangeText={setName} placeholder="e.g. Weekend 20% off" />
            </Field>

            <Field label="How customers get it">
              <View style={{ flexDirection: "row", gap: 8 }}>
                <SegBtn label="Promo code" active={trigger === "code"} onPress={() => setTrigger("code")} />
                <SegBtn label="Automatic" active={trigger === "automatic"} onPress={() => setTrigger("automatic")} />
              </View>
            </Field>

            {trigger === "code" && (
              <Field label="Promo code">
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Input
                    value={code}
                    onChangeText={(t) => setCode(t.toUpperCase())}
                    autoCapitalize="characters"
                    placeholder="WELCOME10"
                    style={{ flex: 1 }}
                  />
                  <Pressable onPress={() => setCode(generateCode())} style={styles.generateBtn}>
                    <Text style={styles.generateText}>Generate</Text>
                  </Pressable>
                </View>
              </Field>
            )}

            <Field label="Discount type">
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["percentage", "fixed", "free_delivery"] as DiscountType[]).map((t) => (
                  <SegBtn
                    key={t}
                    label={DISCOUNT_TYPE_LABELS[t]}
                    active={type === t}
                    onPress={() => setType(t)}
                    small
                  />
                ))}
              </View>
            </Field>

            {type === "percentage" && (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Percent off">
                    <Input
                      value={percentValue}
                      onChangeText={(t) => setPercentValue(t.replace(/[^0-9.]/g, ""))}
                      keyboardType="numeric"
                      placeholder="20"
                    />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Max discount (₦)">
                    <Input
                      value={maxDiscountNaira}
                      onChangeText={(t) => setMaxDiscountNaira(t.replace(/[^0-9.]/g, ""))}
                      keyboardType="numeric"
                      placeholder="2000"
                    />
                  </Field>
                </View>
              </View>
            )}

            {type === "fixed" && (
              <Field label="Amount off (₦)">
                <Input
                  value={fixedNaira}
                  onChangeText={(t) => setFixedNaira(t.replace(/[^0-9.]/g, ""))}
                  keyboardType="numeric"
                  placeholder="500"
                />
              </Field>
            )}

            {type === "free_delivery" && (
              <Text style={styles.note}>
                Waives the delivery fee on qualifying delivery orders. Tip: set a minimum order below
                so it stays profitable.
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Min order (₦)">
                  <Input
                    value={minOrderNaira}
                    onChangeText={(t) => setMinOrderNaira(t.replace(/[^0-9.]/g, ""))}
                    keyboardType="numeric"
                    placeholder="0"
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Order type">
                  <View style={{ gap: 6 }}>
                    {(
                      [
                        { value: "", label: "Both" },
                        { value: "delivery", label: "Delivery" },
                        { value: "pickup", label: "Pickup" },
                      ] as const
                    ).map((opt) => (
                      <Pressable
                        key={opt.value}
                        onPress={() => setFulfillment(opt.value)}
                        style={[
                          styles.fulfillChip,
                          fulfillment === opt.value && {
                            borderColor: theme.colors.brand,
                            backgroundColor: theme.colors.primary[50],
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color:
                              fulfillment === opt.value
                                ? theme.colors.brand
                                : theme.colors.black[500],
                          }}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </Field>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Total uses">
                  <Input
                    value={usageTotal}
                    onChangeText={(t) => setUsageTotal(t.replace(/[^0-9]/g, ""))}
                    keyboardType="numeric"
                    placeholder="Unlimited"
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Per customer">
                  <Input
                    value={perCustomer}
                    onChangeText={(t) => setPerCustomer(t.replace(/[^0-9]/g, ""))}
                    keyboardType="numeric"
                    placeholder="Unlimited"
                  />
                </Field>
              </View>
            </View>

            {error ? <ErrorText>{error}</ErrorText> : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving}
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            >
              <Text style={styles.saveText}>
                {saving ? "Saving…" : isEdit ? "Save changes" : "Create offer"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SegBtn({
  label,
  active,
  onPress,
  small,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.seg,
        active && { borderColor: theme.colors.brand, backgroundColor: theme.colors.primary[50] },
      ]}
    >
      <Text
        style={{
          fontSize: small ? 11 : 13,
          fontWeight: active ? "700" : "600",
          color: active ? theme.colors.brand : theme.colors.black[500],
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = {
  backdrop: { flex: 1, backgroundColor: "rgba(17,17,17,0.5)", justifyContent: "flex-end" as const },
  sheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%" as const,
    overflow: "hidden" as const,
  },
  sheetHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.black[100],
  },
  sheetTitle: { fontSize: 16, fontWeight: "800" as const, color: theme.colors.black[900] },
  seg: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  generateBtn: {
    borderWidth: 1,
    borderColor: theme.colors.brand,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: "center" as const,
  },
  generateText: { fontSize: 13, fontWeight: "600" as const, color: theme.colors.brand },
  fulfillChip: {
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center" as const,
  },
  note: {
    fontSize: 12,
    color: theme.colors.black[500],
    backgroundColor: theme.colors.black[50],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    lineHeight: 17,
  },
  footer: {
    flexDirection: "row" as const,
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.black[100],
    backgroundColor: theme.colors.white,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center" as const,
  },
  cancelText: { fontSize: 14, fontWeight: "600" as const, color: theme.colors.black[500] },
  saveBtn: {
    flex: 1,
    backgroundColor: theme.colors.brand,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center" as const,
  },
  saveText: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.white },
};
