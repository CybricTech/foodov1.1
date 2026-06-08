/**
 * Owner Marketing (reached from "More") — offers + SMS campaigns at web parity.
 *
 * The web marketing PAGE loads the customer segment counts and SMS sender
 * status server-side before rendering the client; mobile has no server
 * component, so we run the SAME four reads here (all via the authed
 * `getSupabase()` RLS client, scoped to the owner's restaurant) and hand the
 * results to the screen. The discounts list itself is loaded inside the screen.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { useAuth } from "../../src/lib/auth";
import { getSupabase } from "../../src/lib/supabase";
import { theme } from "../../src/theme";
import { MarketingScreen } from "../../src/features/marketing/marketing-screen";

interface MarketingData {
  customerCounts: { all: number; inactive30: number; vip: number };
  senderStatus: "pending" | "approved" | "rejected" | null;
  senderName: string | null;
}

export default function OwnerMarketingRoute() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  const [data, setData] = useState<MarketingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    const supabase = getSupabase();
    if (!supabase) {
      setError("App is not configured.");
      return;
    }
    let alive = true;

    (async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [restaurant, allCount, inactive30Count, vipCount] = await Promise.all([
        supabase
          .from("restaurants")
          .select("sms_sender_id, sms_sender_status")
          .eq("id", restaurantId)
          .single(),
        supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId),
        supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .or(`last_order_at.is.null,last_order_at.lt.${thirtyDaysAgo.toISOString()}`),
        supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .gte("total_orders", 3),
      ]);

      if (!alive) return;
      setData({
        customerCounts: {
          all: allCount.count ?? 0,
          inactive30: inactive30Count.count ?? 0,
          vip: vipCount.count ?? 0,
        },
        senderStatus:
          (restaurant.data?.sms_sender_status as
            | "pending"
            | "approved"
            | "rejected"
            | null) ?? null,
        senderName: restaurant.data?.sms_sender_id ?? null,
      });
    })();

    return () => {
      alive = false;
    };
  }, [restaurantId]);

  if (!restaurantId) return null;

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 14, color: theme.colors.cinnabar[500], textAlign: "center" }}>
          {error}
        </Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.brand} size="large" />
      </View>
    );
  }

  return (
    <MarketingScreen
      restaurantId={restaurantId}
      customerCounts={data.customerCounts}
      senderStatus={data.senderStatus}
      senderName={data.senderName}
    />
  );
}
