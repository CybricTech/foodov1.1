import { useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/lib/stores/auth";
import { useDeliveryStore } from "@/lib/stores/delivery";
import { OnlineToggle } from "@/components/online-toggle";
import { AssignmentCard } from "@/components/assignment-card";
import { ActiveDeliveryBar } from "@/components/active-delivery-bar";

export default function HomeScreen() {
  const rider = useAuthStore((s) => s.rider);
  const { assignments, activeAssignment, loading, fetchAssignments } =
    useDeliveryStore();

  const pendingAssignments = assignments.filter((a) => a.status === "pending");

  useEffect(() => {
    if (rider?.id) {
      fetchAssignments(rider.id);
    }
  }, [rider?.id]);

  return (
    <SafeAreaView className="flex-1 bg-[#0A0A0A]" edges={["top"]}>
      {/* Header */}
      <View className="px-4 pt-2 pb-4">
        <Text className="text-white/40 text-xs uppercase tracking-widest mb-1">
          Welcome back
        </Text>
        <Text className="text-white text-2xl font-black">
          {rider?.name ?? "Rider"}
        </Text>
      </View>

      <FlatList
        data={pendingAssignments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => rider?.id && fetchAssignments(rider.id)}
            tintColor="rgba(255,255,255,0.3)"
          />
        }
        ListHeaderComponent={
          <View className="mb-2">
            <OnlineToggle />
            {activeAssignment && (
              <View className="mb-4">
                <Text className="text-white/40 text-xs uppercase tracking-widest mb-2">
                  Active delivery
                </Text>
                <ActiveDeliveryBar />
              </View>
            )}
            {pendingAssignments.length > 0 && (
              <Text className="text-white/40 text-xs uppercase tracking-widest mb-2">
                Incoming ({pendingAssignments.length})
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator
              color="rgba(255,255,255,0.3)"
              style={{ marginTop: 48 }}
            />
          ) : (
            <View className="items-center mt-16">
              <Text className="text-5xl mb-4">🛵</Text>
              <Text className="text-white font-bold text-base">
                No pending deliveries
              </Text>
              <Text className="text-white/40 text-sm mt-1 text-center px-8">
                {rider?.is_online
                  ? "Hang tight — new orders will appear here"
                  : "Go online to start receiving deliveries"}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => <AssignmentCard assignment={item} />}
      />
    </SafeAreaView>
  );
}
