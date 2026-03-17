import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useDeliveryStore } from "@/lib/stores/delivery";

const STATUS_LABELS: Record<string, string> = {
  accepted: "Head to restaurant",
  picked_up: "Head to customer",
};

export function ActiveDeliveryBar() {
  const active = useDeliveryStore((s) => s.activeAssignment);
  const router = useRouter();

  if (!active) return null;

  const label = STATUS_LABELS[active.status] ?? "Active delivery";
  const orderRef = active.order?.order_number ?? "Order";

  return (
    <TouchableOpacity
      onPress={() => router.push("/(app)/map")}
      className="bg-[#FF6B35] mx-4 mb-3 rounded-card px-4 py-3 flex-row items-center justify-between shadow-lg"
      activeOpacity={0.85}
    >
      <View>
        <Text className="text-white/70 text-xs font-semibold uppercase tracking-wide">
          Active delivery · {orderRef}
        </Text>
        <Text className="text-white font-bold text-sm mt-0.5">{label}</Text>
      </View>
      <Text className="text-white text-lg">→</Text>
    </TouchableOpacity>
  );
}
