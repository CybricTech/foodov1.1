import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/lib/stores/auth";
import { supabase } from "@/lib/supabase";
import { OnlineToggle } from "@/components/online-toggle";

interface EarningsSummary {
  today: number;
  week: number;
}

export default function ProfileScreen() {
  const rider = useAuthStore((s) => s.rider);
  const signOut = useAuthStore((s) => s.signOut);
  const [earnings, setEarnings] = useState<EarningsSummary>({ today: 0, week: 0 });
  const [loadingEarnings, setLoadingEarnings] = useState(true);

  useEffect(() => {
    if (rider?.id) fetchEarnings(rider.id);
  }, [rider?.id]);

  async function fetchEarnings(riderId: string) {
    setLoadingEarnings(true);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [todayRes, weekRes] = await Promise.all([
      supabase
        .from("delivery_assignments")
        .select("id", { count: "exact" })
        .eq("rider_id", riderId)
        .eq("status", "delivered")
        .gte("delivered_at", todayStart),
      supabase
        .from("delivery_assignments")
        .select("id", { count: "exact" })
        .eq("rider_id", riderId)
        .eq("status", "delivered")
        .gte("delivered_at", weekStart),
    ]);

    setEarnings({
      today: todayRes.count ?? 0,
      week: weekRes.count ?? 0,
    });
    setLoadingEarnings(false);
  }

  function confirmSignOut() {
    Alert.alert(
      "Sign out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: signOut },
      ]
    );
  }

  const initials = rider?.name
    ? rider.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <SafeAreaView className="flex-1 bg-[#0A0A0A]" edges={["top"]}>
      <View className="px-4 pt-2">
        <Text className="text-white text-2xl font-black mb-6">Profile</Text>

        {/* Avatar + info */}
        <View className="items-center mb-6">
          <View className="w-20 h-20 rounded-full bg-[#FF6B35]/20 items-center justify-center mb-3">
            <Text className="text-[#FF6B35] text-2xl font-black">{initials}</Text>
          </View>
          <Text className="text-white text-xl font-bold">{rider?.name ?? "—"}</Text>
          <Text className="text-white/40 text-sm mt-1">{rider?.phone ?? "—"}</Text>
        </View>

        {/* Online toggle */}
        <OnlineToggle />

        {/* Stats */}
        <View className="flex-row gap-3 mb-6">
          <View className="flex-1 bg-white/5 border border-white/10 rounded-card p-4 items-center">
            {loadingEarnings ? (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
            ) : (
              <Text className="text-white text-3xl font-black">{earnings.today}</Text>
            )}
            <Text className="text-white/40 text-xs uppercase tracking-wide mt-1">
              Today
            </Text>
          </View>
          <View className="flex-1 bg-white/5 border border-white/10 rounded-card p-4 items-center">
            {loadingEarnings ? (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
            ) : (
              <Text className="text-white text-3xl font-black">{earnings.week}</Text>
            )}
            <Text className="text-white/40 text-xs uppercase tracking-wide mt-1">
              This week
            </Text>
          </View>
        </View>

        {/* Sign out */}
        <TouchableOpacity
          className="bg-white/5 border border-white/10 rounded-btn py-4 items-center"
          onPress={confirmSignOut}
        >
          <Text className="text-[#E63946] font-semibold">Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
