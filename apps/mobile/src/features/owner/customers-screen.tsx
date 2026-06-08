/**
 * Owner Customers — RN port of the web `CustomersClient` (READ-ONLY).
 *
 * Parity (ported from web):
 *   - List loaded via Supabase (RLS), customers for this restaurant ordered by
 *     total_spent_kobo desc (same query as the web server component).
 *   - Client-side search (name / phone / email) + sort.
 *   - Per-customer order history loaded through the Bearer'd dashboard route
 *     `/api/dashboard/customers/[id]/orders` (src/lib/api.ts), the same endpoint
 *     web uses — expandable order rows with items + price breakdown + address.
 *
 * No CSV export (that's Phase 2b). Money via formatKobo from @foodo/utils.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { formatKobo } from "@foodo/utils";
import type { Database } from "@foodo/database";

import { getSupabase } from "../../lib/supabase";
import { fetchCustomerOrders, ApiError, type CustomerOrder } from "../../lib/api";
import { theme } from "../../theme";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type SortKey = "total_spent_kobo" | "total_orders" | "last_order_at" | "first_order_at";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "total_spent_kobo", label: "Total spent" },
  { key: "total_orders", label: "Total orders" },
  { key: "last_order_at", label: "Last order" },
  { key: "first_order_at", label: "First order" },
];

const ORDER_STATUS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  confirmed: { label: "Confirmed", bg: theme.colors.primary[50], fg: theme.colors.brand },
  preparing: { label: "Preparing", bg: theme.colors.dixie[100], fg: theme.colors.dixie[500] },
  ready_for_pickup: { label: "Ready", bg: theme.colors.dixie[100], fg: theme.colors.dixie[500] },
  in_transit: { label: "In Transit", bg: theme.colors.primary[50], fg: theme.colors.brand },
  delivered: { label: "Delivered", bg: theme.colors.viridian[100], fg: theme.colors.viridian[500] },
  cancelled: { label: "Cancelled", bg: theme.colors.cinnabar[100], fg: theme.colors.cinnabar[500] },
  pending: { label: "Pending", bg: theme.colors.black[100], fg: theme.colors.black[500] },
};
const FULFILLMENT_LABELS: Record<string, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  dine_in: "Dine In",
};

function OrderStatusBadge({ status }: { status: string }) {
  const c = ORDER_STATUS_BADGE[status] ?? {
    label: status,
    bg: theme.colors.black[100],
    fg: theme.colors.black[500],
  };
  return (
    <View
      style={{ backgroundColor: c.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}
    >
      <Text style={{ fontSize: 11, fontWeight: "600", color: c.fg }}>{c.label}</Text>
    </View>
  );
}

interface CustomersScreenProps {
  restaurantId: string;
}

export function CustomersScreen({ restaurantId }: CustomersScreenProps) {
  const supabase = getSupabase();

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_spent_kobo");

  useEffect(() => {
    (async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("total_spent_kobo", { ascending: false });
      setCustomers((data as CustomerRow[]) ?? []);
      setLoading(false);
    })();
  }, [restaurantId, supabase]);

  if (selected) {
    return <CustomerDetail customer={selected} onBack={() => setSelected(null)} />;
  }

  const filtered = customers
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.full_name?.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") return bv.localeCompare(av);
      return (bv as number) - (av as number);
    });

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.black[50] }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: theme.colors.white,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.black[100],
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 14,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "800", color: theme.colors.black[900] }}>
          Customers ({customers.length})
        </Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or phone…"
          placeholderTextColor={theme.colors.black[400]}
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: theme.colors.black[200],
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 14,
            color: theme.colors.black[900],
          }}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, marginTop: 10 }}
        >
          {SORT_OPTIONS.map((opt) => {
            const active = sortKey === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setSortKey(opt.key)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.brand : theme.colors.black[200],
                  backgroundColor: active ? theme.colors.primary[50] : theme.colors.white,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: active ? theme.colors.brand : theme.colors.black[500],
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <Text style={{ fontSize: 14, color: theme.colors.black[400] }}>
              {search ? "No matching customers" : "No customers yet"}
            </Text>
          </View>
        }
        renderItem={({ item: c }) => (
          <Pressable
            onPress={() => setSelected(c)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              backgroundColor: theme.colors.white,
              borderWidth: 1,
              borderColor: theme.colors.black[100],
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 8,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: theme.colors.primary[50],
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.brand }}>
                {(c.full_name ?? c.phone)[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ fontSize: 14, fontWeight: "600", color: theme.colors.black[900] }}
                numberOfLines={1}
              >
                {c.full_name ?? "—"}
              </Text>
              <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}>
                {c.phone}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.black[900] }}>
                {formatKobo(c.total_spent_kobo)}
              </Text>
              <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}>
                {c.total_orders} order{c.total_orders !== 1 ? "s" : ""}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

/* ---- Per-customer detail + order history ---- */
function CustomerDetail({
  customer,
  onBack,
}: {
  customer: CustomerRow;
  onBack: () => void;
}) {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCustomerOrders(customer.id)
      .then((data) => {
        if (!cancelled) setOrders(data.orders);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof ApiError || err instanceof Error ? err.message : "Failed to load orders");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  const avgOrderValue =
    customer.total_orders > 0
      ? Math.round(customer.total_spent_kobo / customer.total_orders)
      : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.black[50] }}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {/* Back */}
      <View
        style={{
          backgroundColor: theme.colors.white,
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 8,
        }}
      >
        <Pressable onPress={onBack} hitSlop={8} style={{ alignSelf: "flex-start" }}>
          <Text style={{ fontSize: 14, color: theme.colors.black[500], fontWeight: "600" }}>
            ‹ Back to customers
          </Text>
        </Pressable>
      </View>

      {/* Profile card */}
      <View
        style={{
          backgroundColor: theme.colors.white,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.black[100],
          paddingHorizontal: 16,
          paddingVertical: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.colors.primary[50],
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.brand }}>
              {(customer.full_name ?? customer.phone)[0].toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={{ fontSize: 16, fontWeight: "800", color: theme.colors.black[900] }}>
              {customer.full_name ?? "Unknown"}
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.black[400] }}>{customer.phone}</Text>
            {customer.email ? (
              <Text style={{ fontSize: 12, color: theme.colors.black[400] }}>{customer.email}</Text>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 16 }}>
          {[
            {
              label: "Member Since",
              value: new Date(customer.created_at).toLocaleDateString("en-NG", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            },
            { label: "Total Orders", value: String(customer.total_orders) },
            { label: "Total Spent", value: formatKobo(customer.total_spent_kobo) },
            { label: "Avg Order Value", value: formatKobo(avgOrderValue) },
          ].map((stat) => (
            <View key={stat.label} style={{ width: "50%", marginBottom: 12 }}>
              <Text
                style={{
                  fontSize: 11,
                  color: theme.colors.black[400],
                  fontWeight: "500",
                  textTransform: "uppercase",
                }}
              >
                {stat.label}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: theme.colors.black[900],
                  marginTop: 2,
                }}
              >
                {stat.value}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Order history */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "800",
            color: theme.colors.black[900],
            marginBottom: 12,
          }}
        >
          Order History
        </Text>

        {loading ? (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <ActivityIndicator color={theme.colors.brand} />
          </View>
        ) : error ? (
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderWidth: 1,
              borderColor: theme.colors.cinnabar[500],
              borderRadius: 16,
              paddingVertical: 32,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 14, color: theme.colors.cinnabar[500] }}>{error}</Text>
          </View>
        ) : orders.length === 0 ? (
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderWidth: 1,
              borderColor: theme.colors.black[100],
              borderRadius: 16,
              paddingVertical: 32,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 14, color: theme.colors.black[400] }}>No orders found</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {orders.map((order) => {
              const isExpanded = expanded === order.id;
              const nameChanged =
                order.customer_name &&
                customer.full_name &&
                order.customer_name !== customer.full_name;
              return (
                <View
                  key={order.id}
                  style={{
                    backgroundColor: theme.colors.white,
                    borderWidth: 1,
                    borderColor: theme.colors.black[100],
                    borderRadius: 14,
                    overflow: "hidden",
                  }}
                >
                  <Pressable
                    onPress={() => toggle(order.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "700",
                            color: theme.colors.black[900],
                          }}
                        >
                          #{order.order_number}
                        </Text>
                        <OrderStatusBadge status={order.status} />
                        <Text style={{ fontSize: 12, color: theme.colors.black[400] }}>
                          {FULFILLMENT_LABELS[order.fulfillment_type] ?? order.fulfillment_type}
                        </Text>
                      </View>
                      <Text
                        style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 4 }}
                      >
                        {new Date(order.created_at).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                      {nameChanged ? (
                        <Text
                          style={{ fontSize: 12, color: theme.colors.dixie[500], marginTop: 2 }}
                        >
                          Ordered as: {order.customer_name}
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      style={{ fontSize: 14, fontWeight: "700", color: theme.colors.black[900] }}
                    >
                      {formatKobo(order.total_kobo)}
                    </Text>
                    <Text style={{ fontSize: 14, color: theme.colors.black[400] }}>
                      {isExpanded ? "▲" : "▼"}
                    </Text>
                  </Pressable>

                  {isExpanded ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.black[100] }}>
                      {/* Items */}
                      <View
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          backgroundColor: theme.colors.black[50],
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "600",
                            color: theme.colors.black[500],
                            textTransform: "uppercase",
                            marginBottom: 8,
                          }}
                        >
                          Items
                        </Text>
                        {order.order_items.map((item) => (
                          <View
                            key={item.id}
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              gap: 12,
                              marginBottom: 8,
                            }}
                          >
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ fontSize: 14, color: theme.colors.black[900] }}>
                                <Text style={{ fontWeight: "600" }}>{item.quantity}× </Text>
                                {item.item_name}
                              </Text>
                              {item.selected_options &&
                              Object.keys(item.selected_options).length > 0 ? (
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: theme.colors.black[400],
                                    marginTop: 2,
                                  }}
                                >
                                  {Object.entries(item.selected_options)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(", ")}
                                </Text>
                              ) : null}
                            </View>
                            <View style={{ alignItems: "flex-end" }}>
                              <Text
                                style={{
                                  fontSize: 14,
                                  fontWeight: "500",
                                  color: theme.colors.black[900],
                                }}
                              >
                                {formatKobo(item.line_total_kobo)}
                              </Text>
                              {item.quantity > 1 ? (
                                <Text style={{ fontSize: 12, color: theme.colors.black[400] }}>
                                  {formatKobo(item.item_price_kobo)} each
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        ))}
                      </View>

                      {/* Price breakdown */}
                      <View
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          borderTopWidth: 1,
                          borderTopColor: theme.colors.black[100],
                          gap: 4,
                        }}
                      >
                        <PriceRow label="Subtotal" value={order.subtotal_kobo} />
                        {order.vat_kobo > 0 ? <PriceRow label="VAT" value={order.vat_kobo} /> : null}
                        {order.service_fee_kobo > 0 ? (
                          <PriceRow label="Service Fee" value={order.service_fee_kobo} />
                        ) : null}
                        {order.delivery_fee_kobo > 0 ? (
                          <PriceRow label="Delivery Fee" value={order.delivery_fee_kobo} />
                        ) : null}
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            paddingTop: 6,
                            marginTop: 2,
                            borderTopWidth: 1,
                            borderTopColor: theme.colors.black[100],
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "700",
                              color: theme.colors.black[900],
                            }}
                          >
                            Total
                          </Text>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "700",
                              color: theme.colors.black[900],
                            }}
                          >
                            {formatKobo(order.total_kobo)}
                          </Text>
                        </View>
                      </View>

                      {/* Address + instructions */}
                      {order.delivery_address || order.special_instructions ? (
                        <View
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            borderTopWidth: 1,
                            borderTopColor: theme.colors.black[100],
                            gap: 8,
                          }}
                        >
                          {order.delivery_address ? (
                            <View>
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: "500",
                                  color: theme.colors.black[400],
                                  textTransform: "uppercase",
                                }}
                              >
                                Delivery Address
                              </Text>
                              <Text
                                style={{ fontSize: 14, color: theme.colors.black[900], marginTop: 2 }}
                              >
                                {order.delivery_address}
                              </Text>
                            </View>
                          ) : null}
                          {order.special_instructions ? (
                            <View>
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: "500",
                                  color: theme.colors.black[400],
                                  textTransform: "uppercase",
                                }}
                              >
                                Special Instructions
                              </Text>
                              <Text
                                style={{
                                  fontSize: 14,
                                  color: theme.colors.black[900],
                                  marginTop: 2,
                                  fontStyle: "italic",
                                }}
                              >
                                {order.special_instructions}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function PriceRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ fontSize: 12, color: theme.colors.black[500] }}>{label}</Text>
      <Text style={{ fontSize: 12, color: theme.colors.black[500] }}>{formatKobo(value)}</Text>
    </View>
  );
}
