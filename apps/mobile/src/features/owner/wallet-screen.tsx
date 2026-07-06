/**
 * Owner Wallet — RN port of the web `WalletClient` (READ-ONLY).
 *
 * Parity (ported from web), with the one mobile difference noted:
 *   - Reads (via Supabase RLS, replicating the web server component):
 *       • wallet_transactions (latest 50)         → Activity tab
 *       • settlements (all)                        → Payouts tab + Total Paid Out
 *       • orders (latest 200, billable)            → avg order net (computeOrderNet)
 *       • platform_settings (fee pct)             → net formula inputs
 *       • restaurant_wallets.pending_balance_kobo → "Expected Payout" headline
 *   - "Expected Payout" uses the stored pending_balance_kobo. The WEB page first
 *     re-derives it via a SERVICE-ROLE rpc (recompute_restaurant_wallet) the
 *     merchant role can't call; mobile reads the value the cron/triggers keep
 *     current (same field the web mobile-view reads). Read-only money — no
 *     mutations, no recompute, no CSV export (export is Phase 2b).
 *
 * ALL money via formatKobo / computeOrderNet from @foodo/utils — no kobo math here.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  Wallet,
  Banknote,
  ArrowDownToLine,
  Hourglass,
  ChevronRight,
  X,
} from "lucide-react-native";

import {
  formatKobo,
  computeOrderNet,
  computePendingPayoutBreakdown,
  resolveDeliveryCommissionPct,
} from "@foodo/utils";
import type { PendingPayoutBreakdown } from "@foodo/utils";

import { getSupabase } from "../../lib/supabase";
import { theme } from "../../theme";

/* ---- Types (mirror web) ---- */
type TxnRow = {
  id: string;
  type: string;
  direction: string;
  amount_kobo: number;
  status: string;
  description: string | null;
  available_at: string | null;
  created_at: string;
  order_id: string | null;
};

type SettlementRow = {
  id: string;
  amount_kobo: number;
  status: string;
  settlement_type: string;
  bank_reference: string | null;
  period_date: string | null;
  order_count: number;
  paystack_transfer_ref: string | null;
  monnify_disbursement_reference: string | null;
  failure_reason: string | null;
  initiated_at: string;
  paid_at: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  order_number: string;
  subtotal_kobo: number;
  discount_kobo: number;
  delivery_fee_kobo: number;
  service_fee_kobo: number;
  vat_kobo: number;
  total_kobo: number;
  settlement_id: string | null;
  dispatch_type: string | null;
  fulfillment_type: string;
  status: string;
  created_at: string;
};

type ActiveTab = "activity" | "payouts";

/* ---- Helpers (ported from web) ---- */
function formatDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function groupByDate<T extends { created_at: string }>(
  items: T[]
): Array<{ label: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = formatDateGroup(item.created_at);
    const existing = groups.get(label);
    if (existing) existing.push(item);
    else groups.set(label, [item]);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function extractOrderNumber(description: string | null, fallback: string | null): string {
  if (description) {
    const match = description.match(/#([A-Z0-9-]+)/);
    if (match) return `Order #${match[1]}`;
  }
  if (fallback) return `Order #${fallback}`;
  return "Order";
}

function extractBankRef(bankRef: string | null, altRef: string | null): string | null {
  return bankRef ?? altRef ?? null;
}

const SETTLEMENT_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: "Pending", bg: theme.colors.dixie[100], fg: theme.colors.dixie[500] },
  processing: { label: "Processing", bg: theme.colors.primary[50], fg: theme.colors.brand },
  paid: { label: "Paid", bg: theme.colors.viridian[100], fg: theme.colors.viridian[500] },
  failed: { label: "Failed", bg: theme.colors.cinnabar[100], fg: theme.colors.cinnabar[500] },
};
const TXN_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: "Pending", bg: theme.colors.dixie[100], fg: theme.colors.dixie[500] },
  available: { label: "Available", bg: theme.colors.viridian[100], fg: theme.colors.viridian[500] },
  settled: { label: "Paid", bg: theme.colors.black[100], fg: theme.colors.black[400] },
};

function Badge({ map, status }: { map: typeof TXN_BADGE; status: string }) {
  const c = map[status] ?? {
    label: status,
    bg: theme.colors.black[100],
    fg: theme.colors.black[400],
  };
  return (
    <View
      style={{ backgroundColor: c.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}
    >
      <Text style={{ fontSize: 11, fontWeight: "600", color: c.fg }}>{c.label}</Text>
    </View>
  );
}

interface WalletScreenProps {
  restaurantId: string;
}

export function WalletScreen({ restaurantId }: WalletScreenProps) {
  const supabase = getSupabase();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("activity");
  const [selected, setSelected] = useState<SettlementRow | null>(null);
  const [showPending, setShowPending] = useState(false);

  const [transactions, setTransactions] = useState<TxnRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [pendingBalanceKobo, setPendingBalanceKobo] = useState(0);
  const [processedOrderCount, setProcessedOrderCount] = useState(0);
  const [fees, setFees] = useState({ merchantChargePct: 0.01, deliveryCommissionPct: 0.1 });

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    const [
      { data: txns },
      { data: setts },
      { data: ords },
      { data: platformSettings },
      { data: restaurantRates },
      { data: wallet },
      { count: orderCount },
    ] = await Promise.all([
      supabase
        .from("wallet_transactions")
        .select(
          "id, type, direction, amount_kobo, status, description, available_at, created_at, order_id"
        )
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("settlements")
        .select(
          "id, amount_kobo, status, settlement_type, bank_reference, period_date, order_count, paystack_transfer_ref, monnify_disbursement_reference, failure_reason, initiated_at, paid_at, created_at"
        )
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select(
          "id, order_number, subtotal_kobo, discount_kobo, delivery_fee_kobo, service_fee_kobo, vat_kobo, total_kobo, settlement_id, dispatch_type, fulfillment_type, status, created_at"
        )
        .eq("restaurant_id", restaurantId)
        .neq("status", "cancelled")
        .neq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("platform_settings")
        .select("merchant_charge_pct, delivery_commission_pct")
        .single(),
      supabase
        .from("restaurants")
        .select("delivery_commission_pct")
        .eq("id", restaurantId)
        .single(),
      supabase
        .from("restaurant_wallets")
        .select("pending_balance_kobo")
        .eq("restaurant_id", restaurantId)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .neq("status", "cancelled")
        .neq("status", "pending"),
    ]);

    setTransactions((txns as unknown as TxnRow[]) ?? []);
    setSettlements((setts as unknown as SettlementRow[]) ?? []);
    setOrders((ords as unknown as OrderRow[]) ?? []);
    setPendingBalanceKobo(
      (wallet as { pending_balance_kobo?: number } | null)?.pending_balance_kobo ?? 0
    );
    setProcessedOrderCount(orderCount ?? (ords?.length ?? 0));
    if (platformSettings) {
      const ps = platformSettings as {
        merchant_charge_pct: number | null;
        delivery_commission_pct: number | null;
      };
      setFees({
        merchantChargePct: ps.merchant_charge_pct ?? 0.01,
        // Merchant-effective rate: this restaurant's negotiated override when
        // set, else the platform default — mirrors the web wallet exactly.
        deliveryCommissionPct: resolveDeliveryCommissionPct(
          (restaurantRates as { delivery_commission_pct: number | null } | null)
            ?.delivery_commission_pct,
          ps.delivery_commission_pct
        ),
      });
    }
  }, [restaurantId, supabase]);

  useEffect(() => {
    (async () => {
      await fetchData();
      setLoading(false);
    })();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  /* ---- Derived (ported from web) ---- */
  const { totalWithdrawn, avgOrderNet } = useMemo(() => {
    let totalEarned = 0;
    for (const o of orders) totalEarned += computeOrderNet(o, fees).net;
    const totalWithdrawn = settlements
      .filter((s) => s.status === "paid")
      .reduce((sum, s) => sum + s.amount_kobo, 0);
    const avgOrderNet = orders.length > 0 ? Math.round(totalEarned / orders.length) : 0;
    return { totalWithdrawn, avgOrderNet };
  }, [orders, settlements, fees]);

  // Pending payout — billable orders not yet attached to a settlement. Headline
  // uses the authoritative pending balance; breakdown itemises loaded orders.
  const pendingOrders = useMemo(() => orders.filter((o) => !o.settlement_id), [orders]);
  const pendingBreakdown = useMemo(
    () => computePendingPayoutBreakdown(pendingOrders, fees),
    [pendingOrders, fees]
  );

  const ordersBySettlement = useMemo(() => {
    const map: Record<string, OrderRow[]> = {};
    for (const o of orders) {
      if (!o.settlement_id) continue;
      (map[o.settlement_id] ??= []).push(o);
    }
    return map;
  }, [orders]);

  const activityItems = useMemo(
    () => transactions.filter((t) => t.type === "order_credit"),
    [transactions]
  );
  const activityGroups = useMemo(() => groupByDate(activityItems), [activityItems]);
  const payoutGroups = useMemo(() => groupByDate(settlements), [settlements]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.brand} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.black[50] }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[theme.colors.brand]}
          tintColor={theme.colors.brand}
        />
      }
    >
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Wallet size={14} color={theme.colors.black[400]} strokeWidth={2.5} />
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: theme.colors.black[400],
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          Wallet
        </Text>
      </View>

      {/* Balance card */}
      <View
        style={{
          marginHorizontal: 16,
          marginTop: 12,
          borderRadius: 24,
          overflow: "hidden",
          backgroundColor: theme.colors.primary[700],
          paddingHorizontal: 24,
          paddingTop: 28,
          paddingBottom: 24,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "600",
            letterSpacing: 1.5,
            color: "rgba(255,255,255,0.45)",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Expected Payout
        </Text>
        <Text style={{ fontSize: 40, fontWeight: "900", color: "#fff", letterSpacing: -1 }}>
          {formatKobo(pendingBalanceKobo)}
        </Text>
        <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>
          Earnings awaiting your next settlement
        </Text>
        <View
          style={{
            marginTop: 24,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.1)",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {processedOrderCount.toLocaleString()} orders processed
          </Text>
          <Text style={{ fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.25)" }}>
            KITCHYN
          </Text>
        </View>
      </View>

      {/* Secondary stats */}
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, marginTop: 16 }}>
        {[
          { label: "Total Paid Out", value: formatKobo(totalWithdrawn), sub: "Lifetime" },
          { label: "Total Orders", value: processedOrderCount.toLocaleString(), sub: "All time" },
          { label: "Avg Order", value: formatKobo(avgOrderNet), sub: "Net per order" },
        ].map((s) => (
          <View
            key={s.label}
            style={{
              flex: 1,
              backgroundColor: theme.colors.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.black[100],
              paddingVertical: 12,
              paddingHorizontal: 8,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: "600",
                color: theme.colors.black[400],
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
              numberOfLines={1}
            >
              {s.label}
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "800",
                color: theme.colors.black[900],
                marginTop: 6,
              }}
              numberOfLines={1}
            >
              {s.value}
            </Text>
            <Text style={{ fontSize: 10, color: theme.colors.black[400], marginTop: 4 }}>
              {s.sub}
            </Text>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <View
        style={{
          flexDirection: "row",
          alignSelf: "flex-start",
          marginHorizontal: 16,
          marginTop: 20,
          backgroundColor: theme.colors.black[100],
          borderRadius: 12,
          padding: 4,
        }}
      >
        {(["activity", "payouts"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: activeTab === tab ? theme.colors.white : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: activeTab === tab ? theme.colors.black[900] : theme.colors.black[500],
              }}
            >
              {tab === "activity" ? "Activity" : "Payouts"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
        {activeTab === "activity" ? (
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.black[100],
              overflow: "hidden",
            }}
          >
            {activityItems.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: "center", gap: 8 }}>
                <Banknote size={26} color={theme.colors.black[200]} strokeWidth={1.5} />
                <Text style={{ fontSize: 14, color: theme.colors.black[400] }}>
                  No earnings yet
                </Text>
              </View>
            ) : (
              activityGroups.map(({ label, items }) => (
                <View key={label}>
                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      backgroundColor: theme.colors.black[50],
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.black[100],
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: theme.colors.black[400],
                        textTransform: "uppercase",
                      }}
                    >
                      {label}
                    </Text>
                  </View>
                  {items.map((t) => (
                    <View
                      key={t.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.black[100],
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: theme.colors.black[900],
                          }}
                        >
                          {extractOrderNumber(t.description, t.order_id)}
                        </Text>
                        <Text
                          style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}
                        >
                          {new Date(t.created_at).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "700",
                            color: theme.colors.viridian[500],
                          }}
                        >
                          +{formatKobo(t.amount_kobo)}
                        </Text>
                        <Badge map={TXN_BADGE} status={t.status} />
                      </View>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {pendingOrders.length > 0 ? (
              <Pressable
                onPress={() => setShowPending(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  backgroundColor: theme.colors.white,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.black[200],
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: theme.colors.dixie[100],
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Hourglass size={18} color={theme.colors.dixie[500]} strokeWidth={2.5} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.black[900] }}>
                    Pending payout
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}>
                    {pendingBreakdown.orderCount} order
                    {pendingBreakdown.orderCount === 1 ? "" : "s"} awaiting settlement
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.black[900] }}>
                    {formatKobo(pendingBalanceKobo)}
                  </Text>
                  <Badge map={SETTLEMENT_BADGE} status="pending" />
                </View>
                <ChevronRight size={16} color={theme.colors.black[400]} />
              </Pressable>
            ) : null}

            <View
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.black[100],
              overflow: "hidden",
            }}
          >
            {settlements.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: "center", gap: 8 }}>
                <ArrowDownToLine size={26} color={theme.colors.black[200]} strokeWidth={1.5} />
                <Text style={{ fontSize: 14, color: theme.colors.black[400] }}>
                  No payouts yet
                </Text>
              </View>
            ) : (
              payoutGroups.map(({ label, items }) => (
                <View key={label}>
                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      backgroundColor: theme.colors.black[50],
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.black[100],
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: theme.colors.black[400],
                        textTransform: "uppercase",
                      }}
                    >
                      {label}
                    </Text>
                  </View>
                  {items.map((s) => {
                    const ref = extractBankRef(
                      s.bank_reference,
                      s.monnify_disbursement_reference ?? s.paystack_transfer_ref
                    );
                    const date = new Date(
                      s.initiated_at || s.created_at
                    ).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    });
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setSelected(s)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: theme.colors.black[100],
                        }}
                      >
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            backgroundColor: theme.colors.primary[50],
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <ArrowDownToLine size={18} color={theme.colors.brand} strokeWidth={2.5} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: "600",
                              color: theme.colors.black[900],
                            }}
                          >
                            Payout
                          </Text>
                          <Text
                            style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}
                            numberOfLines={1}
                          >
                            {date}
                            {s.order_count ? ` · ${s.order_count} orders` : ""}
                            {ref ? ` · ${ref}` : ""}
                          </Text>
                          {s.failure_reason ? (
                            <Text
                              style={{
                                fontSize: 12,
                                color: theme.colors.cinnabar[500],
                                marginTop: 2,
                              }}
                            >
                              {s.failure_reason}
                            </Text>
                          ) : null}
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 4 }}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: "700",
                              color: theme.colors.black[900],
                            }}
                          >
                            -{formatKobo(s.amount_kobo)}
                          </Text>
                          <Badge map={SETTLEMENT_BADGE} status={s.status} />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))
            )}
            </View>
          </View>
        )}
      </View>

      <PendingPayoutModal
        visible={showPending}
        breakdown={pendingBreakdown}
        netKobo={pendingBalanceKobo}
        orders={pendingOrders}
        fees={fees}
        onClose={() => setShowPending(false)}
      />

      <PayoutDetailModal
        settlement={selected}
        orders={selected ? ordersBySettlement[selected.id] ?? [] : []}
        fees={fees}
        onClose={() => setSelected(null)}
      />
    </ScrollView>
  );
}

/* ---- Payout detail modal (read-only) ---- */
function PayoutDetailModal({
  settlement,
  orders,
  fees,
  onClose,
}: {
  settlement: SettlementRow | null;
  orders: OrderRow[];
  fees: { merchantChargePct: number; deliveryCommissionPct: number };
  onClose: () => void;
}) {
  if (!settlement) return null;
  const computedNet = settlement.amount_kobo;
  const dateLabel = new Date(settlement.created_at).toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  function dispatchLabel(o: OrderRow): string {
    if (o.fulfillment_type === "pickup") return "Pickup";
    if (o.dispatch_type === "platform_rider") return "Kitchyn delivery";
    if (o.dispatch_type === "own_rider" || o.dispatch_type === "third_party")
      return "Your delivery";
    return "Delivery";
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
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
            maxHeight: "85%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.black[100],
            }}
          >
            <View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.black[900] }}>
                Payout Details
              </Text>
              <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}>
                {dateLabel}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={22} color={theme.colors.black[400]} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View>
                <Text style={{ fontSize: 12, color: theme.colors.black[400] }}>Net Payout</Text>
                <Text
                  style={{ fontSize: 24, fontWeight: "800", color: theme.colors.black[900] }}
                >
                  {formatKobo(computedNet)}
                </Text>
              </View>
              <Badge map={SETTLEMENT_BADGE} status={settlement.status} />
            </View>

            <View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: theme.colors.black[400],
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Orders in this payout ({orders.length})
              </Text>
              {orders.length === 0 ? (
                <Text style={{ fontSize: 14, color: theme.colors.black[400] }}>
                  No order details available.
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {orders.map((o) => {
                    const { net } = computeOrderNet(o, fees);
                    return (
                      <View
                        key={o.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderWidth: 1,
                          borderColor: theme.colors.black[100],
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                        }}
                      >
                        <View style={{ minWidth: 0, flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: "600",
                              color: theme.colors.black[900],
                            }}
                          >
                            {o.order_number}
                          </Text>
                          <Text style={{ fontSize: 12, color: theme.colors.black[400] }}>
                            {new Date(o.created_at).toLocaleDateString("en-NG", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {" · "}
                            {dispatchLabel(o)}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: "700",
                              color: theme.colors.black[900],
                            }}
                          >
                            {formatKobo(net)}
                          </Text>
                          <Text style={{ fontSize: 10, color: theme.colors.black[400] }}>
                            you earned
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ---- Pending payout modal (read-only) — Kitchyn's cut shown explicitly ---- */
function PendingBreakdownRow({
  label,
  hint,
  amountKobo,
  negative,
}: {
  label: string;
  hint?: string;
  amountKobo: number;
  negative?: boolean;
}) {
  const color = negative ? theme.colors.brand : theme.colors.black[900];
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <View style={{ minWidth: 0, flex: 1 }}>
        <Text style={{ fontSize: 14, color }}>
          {negative ? "− " : ""}
          {label}
        </Text>
        {hint ? (
          <Text style={{ fontSize: 11, color: theme.colors.black[400], marginTop: 2 }}>{hint}</Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 14, fontWeight: "500", color, fontVariant: ["tabular-nums"] }}>
        {negative ? `(${formatKobo(amountKobo)})` : formatKobo(amountKobo)}
      </Text>
    </View>
  );
}

function PendingPayoutModal({
  visible,
  breakdown,
  netKobo,
  orders,
  fees,
  onClose,
}: {
  visible: boolean;
  breakdown: PendingPayoutBreakdown;
  netKobo: number;
  orders: OrderRow[];
  fees: { merchantChargePct: number; deliveryCommissionPct: number };
  onClose: () => void;
}) {
  if (!visible) return null;
  const reconciles = breakdown.netKobo === netKobo;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
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
            maxHeight: "85%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.black[100],
            }}
          >
            <View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.black[900] }}>
                Pending Payout
              </Text>
              <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}>
                {breakdown.orderCount} order{breakdown.orderCount === 1 ? "" : "s"} awaiting settlement
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={22} color={theme.colors.black[400]} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ fontSize: 12, color: theme.colors.black[400] }}>Expected Payout</Text>
                <Text style={{ fontSize: 24, fontWeight: "800", color: theme.colors.black[900] }}>
                  {formatKobo(netKobo)}
                </Text>
              </View>
              <Badge map={SETTLEMENT_BADGE} status="pending" />
            </View>

            {/* Breakdown */}
            <View style={{ backgroundColor: theme.colors.black[50], borderRadius: 12, padding: 16, gap: 10 }}>
              <PendingBreakdownRow
                label="Food sales"
                hint="Your menu items, after any promos"
                amountKobo={breakdown.foodKobo}
              />
              {breakdown.deliveryFeesKobo > 0 ? (
                <PendingBreakdownRow
                  label="Delivery fees collected"
                  hint="Across all your delivery orders"
                  amountKobo={breakdown.deliveryFeesKobo}
                />
              ) : null}

              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.black[200],
                  paddingTop: 10,
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: theme.colors.black[400],
                    textTransform: "uppercase",
                  }}
                >
                  Kitchyn&rsquo;s cut
                </Text>
                {breakdown.platformRiderFeesKobo > 0 ? (
                  <PendingBreakdownRow
                    label={`Deliveries we handled · ${breakdown.platformRiderCount} ${breakdown.platformRiderCount === 1 ? "ride" : "rides"}`}
                    hint="Orders our riders delivered for you"
                    amountKobo={breakdown.platformRiderFeesKobo}
                    negative
                  />
                ) : null}
                {breakdown.deliveryCommissionKobo > 0 ? (
                  <PendingBreakdownRow
                    label="Delivery commission"
                    hint="Our share of deliveries your team handled"
                    amountKobo={breakdown.deliveryCommissionKobo}
                    negative
                  />
                ) : null}
                <PendingBreakdownRow
                  label="Merchant charge"
                  hint="Payment processing fee"
                  amountKobo={breakdown.merchantChargeKobo}
                  negative
                />
              </View>

              {reconciles ? (
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.black[200],
                    paddingTop: 10,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.black[900] }}>
                    = Expected Payout
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: theme.colors.black[900],
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {formatKobo(netKobo)}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Orders */}
            <View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: theme.colors.black[400],
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Orders awaiting payout ({orders.length})
              </Text>
              {orders.length === 0 ? (
                <Text style={{ fontSize: 14, color: theme.colors.black[400] }}>
                  No order details available.
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {orders.map((o) => {
                    const { net } = computeOrderNet(o, fees);
                    return (
                      <View
                        key={o.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderWidth: 1,
                          borderColor: theme.colors.black[100],
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                        }}
                      >
                        <View style={{ minWidth: 0, flex: 1 }}>
                          <Text
                            style={{ fontSize: 14, fontWeight: "600", color: theme.colors.black[900] }}
                          >
                            {o.order_number}
                          </Text>
                          <Text style={{ fontSize: 12, color: theme.colors.black[400] }}>
                            {new Date(o.created_at).toLocaleDateString("en-NG", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text
                            style={{ fontSize: 14, fontWeight: "700", color: theme.colors.black[900] }}
                          >
                            {formatKobo(net)}
                          </Text>
                          <Text style={{ fontSize: 10, color: theme.colors.black[400] }}>
                            you earn
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
