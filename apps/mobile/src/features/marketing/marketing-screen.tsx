/**
 * Owner Marketing — RN port of the web `MarketingClient` (full parity).
 *
 * Read components/dashboard/marketing-client.tsx for the canonical behaviour.
 * Two tabs, exactly like web:
 *
 *   Offers — promo codes & automatic discounts. Full CRUD against the
 *     `discounts` table via the authed `getSupabase()` client (RLS):
 *       - list (ordered newest-first), status derivation, pause/resume
 *         (is_active toggle), edit (DiscountForm), and ARCHIVE (soft-delete:
 *         sets archived_at + is_active=false so history/orders are preserved —
 *         never a hard delete, matching web).
 *
 *   SMS Campaigns — the composer is built and wired to the Bearer'd
 *     `/api/dashboard/marketing/sms-campaign` route (audience + message,
 *     recipient counts, confirm-before-send). BUT, exactly like web, SMS
 *     campaigns are gated "coming soon" — the web tab shows a coming-soon
 *     overlay and the server returns 503 until the targeting work ships. We
 *     mirror that here so behaviour matches; flip `SMS_COMING_SOON` when the
 *     server backstop is lifted.
 *
 * Money is rendered with `formatKobo` from @foodo/utils — no kobo math here.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { formatKobo, type DiscountType } from "@foodo/utils";
import type { Discount } from "@foodo/database";

import { getSupabase } from "../../lib/supabase";
import { theme } from "../../theme";
import { DiscountForm } from "./discount-form";
import { SmsComposer } from "./sms-composer";

// Mirrors the web/server "coming soon" gate for SMS campaigns. The web tab is
// overlaid and the route returns 503 until targeting ships; keep parity here.
const SMS_COMING_SOON = true;

type DiscountStatus = "active" | "paused" | "scheduled" | "expired" | "used_up" | "archived";

function deriveStatus(d: Discount, now = new Date()): DiscountStatus {
  if (d.archived_at) return "archived";
  if (!d.is_active) return "paused";
  if (d.ends_at && now > new Date(d.ends_at)) return "expired";
  if (d.starts_at && now < new Date(d.starts_at)) return "scheduled";
  if (d.usage_limit_total !== null && d.times_redeemed >= d.usage_limit_total) return "used_up";
  return "active";
}

const STATUS_LABELS: Record<DiscountStatus, string> = {
  active: "Active",
  paused: "Paused",
  scheduled: "Scheduled",
  expired: "Expired",
  used_up: "Used up",
  archived: "Archived",
};

const STATUS_COLORS: Record<DiscountStatus, { bg: string; fg: string }> = {
  active: { bg: theme.colors.viridian[100], fg: theme.colors.viridian[500] },
  paused: { bg: theme.colors.black[100], fg: theme.colors.black[500] },
  scheduled: { bg: theme.colors.primary[50], fg: theme.colors.brand },
  expired: { bg: theme.colors.cinnabar[100], fg: theme.colors.cinnabar[500] },
  used_up: { bg: theme.colors.dixie[100], fg: theme.colors.dixie[500] },
  archived: { bg: theme.colors.black[100], fg: theme.colors.black[400] },
};

function describeValue(d: Discount): string {
  switch (d.type as DiscountType) {
    case "percentage":
      return `${d.value ?? 0}% off${d.max_discount_kobo ? ` (max ${formatKobo(d.max_discount_kobo)})` : ""}`;
    case "fixed":
      return `${formatKobo(d.value ?? 0)} off`;
    case "free_delivery":
      return "Free delivery";
    default:
      return "";
  }
}

interface MarketingScreenProps {
  restaurantId: string;
  customerCounts: { all: number; inactive30: number; vip: number };
  senderStatus: "pending" | "approved" | "rejected" | null;
  senderName: string | null;
}

export function MarketingScreen({
  restaurantId,
  customerCounts,
  senderStatus,
  senderName,
}: MarketingScreenProps) {
  const supabase = getSupabase();

  const [tab, setTab] = useState<"offers" | "sms">("offers");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoadError("App is not configured.");
      setLoading(false);
      return;
    }
    setLoadError(null);
    const { data, error } = await supabase
      .from("discounts")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setDiscounts((data ?? []) as Discount[]);
    setLoading(false);
  }, [restaurantId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(d: Discount) {
    if (!supabase) return;
    setBusyId(d.id);
    setDiscounts((prev) => prev.map((x) => (x.id === d.id ? { ...x, is_active: !x.is_active } : x)));
    const { error } = await supabase
      .from("discounts")
      .update({ is_active: !d.is_active })
      .eq("id", d.id);
    if (error) {
      setDiscounts((prev) => prev.map((x) => (x.id === d.id ? { ...x, is_active: d.is_active } : x)));
    }
    setBusyId(null);
  }

  // Archive = soft delete (preserve history + orders), matching web exactly.
  function archive(d: Discount) {
    Alert.alert(
      "Archive offer",
      `Archive "${d.name}"? Customers can no longer use it, but its history and the orders that used it stay on record.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: async () => {
            if (!supabase) return;
            setBusyId(d.id);
            const archivedAt = new Date().toISOString();
            setDiscounts((prev) =>
              prev.map((x) =>
                x.id === d.id ? { ...x, archived_at: archivedAt, is_active: false } : x
              )
            );
            const { error } = await supabase
              .from("discounts")
              .update({ archived_at: archivedAt, is_active: false } as never)
              .eq("id", d.id);
            if (error) {
              setDiscounts((prev) =>
                prev.map((x) =>
                  x.id === d.id ? { ...x, archived_at: null, is_active: d.is_active } : x
                )
              );
              Alert.alert("Archive failed", error.message);
            }
            setBusyId(null);
          },
        },
      ]
    );
  }

  function handleSaved(saved: Discount) {
    setDiscounts((prev) => {
      const exists = prev.some((d) => d.id === saved.id);
      return exists ? prev.map((d) => (d.id === saved.id ? saved : d)) : [saved, ...prev];
    });
    setCreating(false);
    setEditing(null);
  }

  const activeCount = useMemo(
    () => discounts.filter((d) => deriveStatus(d) === "active").length,
    [discounts]
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.black[50] }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={styles.headerTitle}>Marketing</Text>
            {tab === "offers" ? (
              <Text style={styles.headerSub}>
                {discounts.length} offer{discounts.length === 1 ? "" : "s"} · {activeCount} active
              </Text>
            ) : (
              <Text style={styles.headerSub}>
                {customerCounts.all} customer{customerCounts.all === 1 ? "" : "s"} reachable
              </Text>
            )}
          </View>
          {tab === "offers" && (
            <Pressable onPress={() => setCreating(true)} style={styles.newBtn}>
              <Text style={styles.newBtnText}>＋ New offer</Text>
            </Pressable>
          )}
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: "row", marginTop: 12, gap: 20 }}>
          <TabBtn label="Offers" active={tab === "offers"} onPress={() => setTab("offers")} />
          <TabBtn label="SMS Campaigns" active={tab === "sms"} onPress={() => setTab("sms")} />
        </View>
      </View>

      {tab === "offers" ? (
        loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.colors.brand} size="large" />
          </View>
        ) : loadError ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Text style={{ fontSize: 14, color: theme.colors.cinnabar[500], textAlign: "center" }}>
              {loadError}
            </Text>
            <Pressable onPress={() => { setLoading(true); void load(); }} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : discounts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 28 }}>✨</Text>
            <Text style={styles.emptyTitle}>No offers yet</Text>
            <Text style={styles.emptySub}>
              Create a promo code or a time-based discount to bring customers back and grow orders.
            </Text>
            <Pressable onPress={() => setCreating(true)} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>＋ Create your first offer</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
            {discounts.map((d) => {
              const status = deriveStatus(d);
              const sc = STATUS_COLORS[status];
              return (
                <View key={d.id} style={styles.card}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.cardName} numberOfLines={1}>{d.name}</Text>
                      <Text style={styles.cardValue}>{describeValue(d)}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.statusText, { color: sc.fg }]}>{STATUS_LABELS[status]}</Text>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    {d.trigger === "code" && d.code ? (
                      <Chip text={`🎟 ${d.code}`} accent />
                    ) : (
                      <Chip text="Automatic" />
                    )}
                    {d.min_order_kobo > 0 && <Chip text={`Min ${formatKobo(d.min_order_kobo)}`} />}
                    {d.fulfillment_type && <Chip text={`${d.fulfillment_type} only`} />}
                  </View>

                  <Text style={styles.usage}>
                    {d.times_redeemed} used
                    {d.usage_limit_total !== null ? ` of ${d.usage_limit_total}` : ""}
                    {d.ends_at
                      ? ` · ends ${new Date(d.ends_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}`
                      : ""}
                  </Text>

                  {status === "archived" ? (
                    <Text style={styles.archivedNote}>Archived · kept for history</Text>
                  ) : (
                    <View style={styles.actions}>
                      <Pressable
                        onPress={() => toggleActive(d)}
                        disabled={busyId === d.id}
                        style={styles.actionBtn}
                      >
                        <Text style={styles.actionText}>{d.is_active ? "Pause" : "Resume"}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setEditing(d)}
                        disabled={busyId === d.id}
                        style={styles.actionBtn}
                      >
                        <Text style={styles.actionText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => archive(d)}
                        disabled={busyId === d.id}
                        style={styles.actionBtn}
                      >
                        <Text style={[styles.actionText, { color: theme.colors.cinnabar[500] }]}>
                          Archive
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )
      ) : (
        <SmsComposer
          comingSoon={SMS_COMING_SOON}
          customerCounts={customerCounts}
          senderStatus={senderStatus}
          senderName={senderName}
        />
      )}

      {(creating || editing) && (
        <DiscountForm
          restaurantId={restaurantId}
          discount={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </View>
  );
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Chip({ text, accent }: { text: string; accent?: boolean }) {
  return (
    <View
      style={[
        styles.chip,
        accent && { backgroundColor: theme.colors.primary[50] },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          accent && { color: theme.colors.brand },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = {
  header: {
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.black[100],
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 20, fontWeight: "800" as const, color: theme.colors.black[900] },
  headerSub: { fontSize: 12, color: theme.colors.black[400], marginTop: 2 },
  newBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  newBtnText: { fontSize: 13, fontWeight: "700" as const, color: theme.colors.white },
  tab: { paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: theme.colors.brand },
  tabText: { fontSize: 14, fontWeight: "600" as const, color: theme.colors.black[400] },
  tabTextActive: { color: theme.colors.brand },
  retryBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { fontSize: 13, fontWeight: "700" as const, color: theme.colors.black[500] },
  empty: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, padding: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800" as const, color: theme.colors.black[900], marginTop: 6 },
  emptySub: { fontSize: 13, color: theme.colors.black[400], textAlign: "center" as const, lineHeight: 18 },
  emptyBtn: {
    marginTop: 12,
    backgroundColor: theme.colors.brand,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptyBtnText: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.white },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.black[100],
    padding: 14,
    gap: 10,
  },
  cardName: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.black[900] },
  cardValue: { fontSize: 12, color: theme.colors.black[400], marginTop: 2 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: "700" as const },
  metaRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
  chip: { backgroundColor: theme.colors.black[50], borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: "600" as const, color: theme.colors.black[500] },
  usage: { fontSize: 11, color: theme.colors.black[400] },
  archivedNote: {
    fontSize: 11,
    color: theme.colors.black[400],
    borderTopWidth: 1,
    borderTopColor: theme.colors.black[50],
    paddingTop: 8,
  },
  actions: {
    flexDirection: "row" as const,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.black[50],
    paddingTop: 8,
  },
  actionBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" as const },
  actionText: { fontSize: 12, fontWeight: "600" as const, color: theme.colors.black[500] },
};
