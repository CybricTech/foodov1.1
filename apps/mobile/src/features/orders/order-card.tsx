/**
 * Frontline order card — RN port of the web `FrontlineOrderCard`.
 *
 * Built for one-handed kitchen use: large primary action button, high-contrast
 * status accents, and ALL details always visible (items + options + contact +
 * pricing breakdown) — no tap-to-expand, so staff see the full order the moment
 * it arrives. Tap-to-call customer, tap-to-open delivery address in maps.
 * Status/dispatch actions mirror the web column logic EXACTLY, including the
 * platform-rider "Kitchyn rider handling" lock state.
 */
import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { formatKobo } from "@foodo/utils";

import { theme } from "../../theme";
import { callCustomer, openInMaps } from "../../lib/intents";
import {
  defaultPrepMinutes,
  formatTimeAgo,
  getItemCount,
  type Column,
  type OptionSnapshot,
  type OrderRow,
} from "./types";

interface OrderCardProps {
  order: OrderRow;
  column: Column;
  isNew: boolean;
  loading: boolean;
  onUpdateStatus: (id: string, status: string, estimatedReadyMinutes?: number) => void;
  onDispatchReady: (order: OrderRow) => void;
}

export function OrderCard({
  order,
  column,
  isNew,
  loading,
  onUpdateStatus,
  onDispatchReady,
}: OrderCardProps) {
  const itemCount = getItemCount(order);
  // Accept dialog lets staff adjust the estimated-ready time before the order
  // moves into preparing (pre-filled with the longest item prep time).
  const [showAccept, setShowAccept] = useState(false);

  return (
    <View
      style={{
        backgroundColor: isNew ? theme.colors.dixie[100] : theme.colors.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isNew ? theme.colors.dixie[500] : theme.colors.black[100],
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text
                style={{
                  fontWeight: "800",
                  fontSize: 15,
                  color: theme.colors.black[900],
                }}
              >
                #{order.order_number}
              </Text>
              <FulfillmentBadge type={order.fulfillment_type} />
            </View>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 13,
                color: theme.colors.black[500],
                fontWeight: "500",
                marginTop: 3,
              }}
            >
              {order.customer_name}
              <Text style={{ color: theme.colors.black[400] }}>
                {"  ·  "}
                {formatTimeAgo(order.created_at)}
              </Text>
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "800",
                color: theme.colors.black[900],
              }}
            >
              {formatKobo(order.total_kobo)}
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.black[400], marginTop: 2 }}>
              {itemCount} item{itemCount !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>
      </View>

      {/* All order details — always visible (no expand/collapse). */}
      <OrderDetails order={order} />

      {/* Action row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 12,
        }}
      >
        <ActionButton
          order={order}
          column={column}
          loading={loading}
          onUpdateStatus={onUpdateStatus}
          onDispatchReady={onDispatchReady}
          onAccept={() => setShowAccept(true)}
        />
      </View>

      <AcceptOrderModal
        visible={showAccept}
        order={order}
        loading={loading}
        onClose={() => setShowAccept(false)}
        onConfirm={(minutes) => {
          onUpdateStatus(order.id, "preparing", minutes);
          setShowAccept(false);
        }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Accept dialog — set the estimated-ready time before preparing.      */
/* ------------------------------------------------------------------ */

function AcceptOrderModal({
  visible,
  order,
  loading,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  order: OrderRow;
  loading: boolean;
  onClose: () => void;
  onConfirm: (minutes: number) => void;
}) {
  const [minutes, setMinutes] = useState<number>(20);

  // Seed with the order's default (longest item prep time) each time it opens.
  function handleShow() {
    setMinutes(defaultPrepMinutes(order));
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={handleShow}
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: theme.colors.white,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            gap: 16,
          }}
        >
          <View>
            <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.black[900] }}>
              Accept order #{order.order_number}
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.black[400], marginTop: 2 }}>
              How long until it&rsquo;s ready? The customer sees this estimate.
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <StepperButton
              label="−"
              disabled={loading}
              onPress={() => setMinutes((m) => Math.max(1, m - 5))}
            />
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, minWidth: 120, justifyContent: "center" }}>
              <TextInput
                value={String(minutes)}
                onChangeText={(t) => {
                  const v = parseInt(t, 10);
                  setMinutes(Number.isFinite(v) ? Math.min(240, Math.max(1, v)) : 1);
                }}
                keyboardType="numeric"
                style={{
                  fontSize: 32,
                  fontWeight: "800",
                  color: theme.colors.black[900],
                  minWidth: 56,
                  textAlign: "center",
                  padding: 0,
                }}
              />
              <Text style={{ fontSize: 14, color: theme.colors.black[500] }}>min</Text>
            </View>
            <StepperButton
              label="+"
              disabled={loading}
              onPress={() => setMinutes((m) => Math.min(240, m + 5))}
            />
          </View>

          {order.fulfillment_type === "delivery" ? (
            <Text style={{ fontSize: 11, color: theme.colors.black[400], textAlign: "center" }}>
              Delivery travel time is added automatically.
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={onClose}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 20,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.black[200],
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.black[500] }}>
                Back
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(minutes)}
              disabled={loading}
              style={{
                flex: 1,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: theme.colors.brand,
                opacity: loading ? 0.6 : 1,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.white }}>
                {loading ? "Accepting…" : "Accept Order"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StepperButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.black[200],
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: "700", color: theme.colors.black[500] }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Action button — exact column/status logic from web                 */
/* ------------------------------------------------------------------ */

function ActionButton({
  order,
  column,
  loading,
  onUpdateStatus,
  onDispatchReady,
  onAccept,
}: {
  order: OrderRow;
  column: Column;
  loading: boolean;
  onUpdateStatus: (id: string, status: string, estimatedReadyMinutes?: number) => void;
  onDispatchReady: (order: OrderRow) => void;
  onAccept: () => void;
}) {
  if (column === "new") {
    return (
      <PrimaryButton
        label={loading ? "Updating…" : "Accept"}
        color={theme.colors.dixie[500]}
        disabled={loading}
        onPress={onAccept}
      />
    );
  }

  if (column === "in_progress") {
    return order.fulfillment_type === "delivery" ? (
      <PrimaryButton
        label={loading ? "Updating…" : "Ready → Dispatch"}
        color={theme.colors.viridian[500]}
        disabled={loading}
        onPress={() => onDispatchReady(order)}
      />
    ) : (
      <PrimaryButton
        label={loading ? "Updating…" : "Ready"}
        color={theme.colors.viridian[500]}
        disabled={loading}
        onPress={() => onUpdateStatus(order.id, "ready_for_pickup")}
      />
    );
  }

  if (column === "in_transit") {
    if (order.status === "ready_for_pickup" && order.fulfillment_type === "delivery") {
      return (
        <PrimaryButton
          label="Assign Rider"
          color={theme.colors.brand}
          disabled={loading}
          onPress={() => onDispatchReady(order)}
        />
      );
    }
    if (order.status === "ready_for_pickup" && order.fulfillment_type === "pickup") {
      return (
        <PrimaryButton
          label={loading ? "Updating…" : "Mark Collected"}
          color={theme.colors.viridian[500]}
          disabled={loading}
          onPress={() => onUpdateStatus(order.id, "delivered")}
        />
      );
    }
    if (order.status === "in_transit" && order.dispatch_type !== "platform_rider") {
      return (
        <PrimaryButton
          label={loading ? "Updating…" : "Mark Delivered"}
          color={theme.colors.viridian[500]}
          disabled={loading}
          onPress={() => onUpdateStatus(order.id, "delivered")}
        />
      );
    }
    if (
      order.status === "assigned_to_rider" ||
      (order.status === "in_transit" && order.dispatch_type === "platform_rider")
    ) {
      return (
        <View
          style={{
            flex: 1,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: theme.colors.primary[50],
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.brand }}>
            Kitchyn rider handling
          </Text>
        </View>
      );
    }
  }

  // completed column or no action — keep the row height consistent.
  return <View style={{ flex: 1 }} />;
}

function PrimaryButton({
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
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: color,
        opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
        paddingVertical: 13,
        borderRadius: 12,
        alignItems: "center",
      })}
    >
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Expanded details                                                   */
/* ------------------------------------------------------------------ */

function OrderDetails({ order }: { order: OrderRow }) {
  const paid = order.payment_status === "paid";
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.black[100],
        backgroundColor: theme.colors.black[50],
      }}
    >
      {/* Contact + payment */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 8,
          flexWrap: "wrap",
        }}
      >
        {!!order.customer_phone && (
          <Pressable onPress={() => callCustomer(order.customer_phone)}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.brand }}>
              📞 {order.customer_phone}
            </Text>
          </Pressable>
        )}
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: paid ? theme.colors.viridian[100] : theme.colors.dixie[100],
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: paid ? theme.colors.viridian[500] : theme.colors.dixie[500],
            }}
          >
            {paid ? "Paid" : order.payment_status ?? "Unpaid"}
          </Text>
        </View>
      </View>

      {/* Items */}
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 10 }}>
        {order.order_items.map((item) => {
          const opts = Array.isArray(item.selected_options)
            ? (item.selected_options as OptionSnapshot[])
            : [];
          return (
            <View key={item.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 8, flex: 1 }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      backgroundColor: theme.colors.primary[50],
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.brand }}>
                      {item.quantity}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "500",
                      color: theme.colors.black[900],
                      flex: 1,
                    }}
                  >
                    {item.item_name}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.black[900] }}>
                  {formatKobo(item.line_total_kobo)}
                </Text>
              </View>
              {opts.length > 0 && (
                <View style={{ marginLeft: 30, marginTop: 4, gap: 2 }}>
                  {opts.flatMap((opt) =>
                    opt.choices.map((c) => {
                      const qty = c.quantity ?? 1;
                      return (
                        <View
                          key={c.choiceId}
                          style={{ flexDirection: "row", justifyContent: "space-between" }}
                        >
                          <Text style={{ fontSize: 12, color: theme.colors.black[400] }}>
                            {qty > 1 ? `${qty}x ` : ""}
                            {c.choiceName}
                          </Text>
                          {c.priceModifierKobo > 0 && (
                            <Text style={{ fontSize: 12, color: theme.colors.black[400] }}>
                              +{formatKobo(c.priceModifierKobo * qty)}
                            </Text>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Special instructions */}
      {!!order.special_instructions && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
          <View
            style={{
              backgroundColor: theme.colors.dixie[100],
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 12, color: theme.colors.dixie[500] }}>
              📝 {order.special_instructions}
            </Text>
          </View>
        </View>
      )}

      {/* Delivery address (tap to open in maps) */}
      {order.fulfillment_type === "delivery" && !!order.delivery_address && (
        <Pressable
          onPress={() => openInMaps(order.delivery_address)}
          style={{ paddingHorizontal: 14, paddingBottom: 10 }}
        >
          <Text style={{ fontSize: 12, color: theme.colors.brand }}>
            📍 {order.delivery_address}
          </Text>
        </Pressable>
      )}

      {/* Pricing breakdown */}
      <View
        style={{
          paddingHorizontal: 14,
          paddingTop: 8,
          paddingBottom: 12,
          borderTopWidth: 1,
          borderTopColor: theme.colors.black[100],
          gap: 6,
        }}
      >
        <PriceRow label="Subtotal" value={formatKobo(order.subtotal_kobo)} />
        {order.delivery_fee_kobo > 0 && (
          <PriceRow label="Delivery fee" value={formatKobo(order.delivery_fee_kobo)} />
        )}
        {order.vat_kobo > 0 && <PriceRow label="VAT" value={formatKobo(order.vat_kobo)} />}
        {order.service_fee_kobo > 0 && (
          <PriceRow label="Service fee" value={formatKobo(order.service_fee_kobo)} />
        )}
        {order.discount_kobo > 0 && (
          <PriceRow
            label={`Discount${order.discount_code ? ` (${order.discount_code})` : ""}`}
            value={`−${formatKobo(order.discount_kobo)}`}
            highlight
          />
        )}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingTop: 6,
            borderTopWidth: 1,
            borderTopColor: theme.colors.black[100],
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "800", color: theme.colors.black[900] }}>
            Total
          </Text>
          <Text style={{ fontSize: 14, fontWeight: "800", color: theme.colors.black[900] }}>
            {formatKobo(order.total_kobo)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function PriceRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const color = highlight ? theme.colors.brand : theme.colors.black[500];
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ fontSize: 12, color, fontWeight: highlight ? "600" : "400" }}>
        {label}
      </Text>
      <Text style={{ fontSize: 12, color, fontWeight: highlight ? "600" : "400" }}>
        {value}
      </Text>
    </View>
  );
}

function FulfillmentBadge({ type }: { type: string | null }) {
  const delivery = type === "delivery";
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 5,
        backgroundColor: delivery ? theme.colors.primary[50] : theme.colors.black[100],
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: "700",
          color: delivery ? theme.colors.brand : theme.colors.black[500],
        }}
      >
        {delivery ? "Delivery" : "Pickup"}
      </Text>
    </View>
  );
}
