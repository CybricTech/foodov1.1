import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useDeliveryStore, type DeliveryAssignment } from "@/lib/stores/delivery";

function formatKobo(kobo: number): string {
  return "₦" + (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface AssignmentCardProps {
  assignment: DeliveryAssignment;
}

export function AssignmentCard({ assignment }: AssignmentCardProps) {
  const acceptAssignment = useDeliveryStore((s) => s.acceptAssignment);
  const declineAssignment = useDeliveryStore((s) => s.declineAssignment);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);

  const order = assignment.order;

  async function handleAccept() {
    setAccepting(true);
    await acceptAssignment(assignment.id);
    setAccepting(false);
  }

  async function handleDecline() {
    setDeclining(true);
    await declineAssignment(assignment.id);
    setDeclining(false);
  }

  return (
    <View className="bg-white/5 border border-white/10 rounded-card p-4 mb-3">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="bg-orange-500/20 rounded-chip px-3 py-1">
          <Text className="text-orange-400 text-xs font-bold uppercase tracking-wide">
            New delivery
          </Text>
        </View>
        {order && (
          <Text className="text-white font-extrabold text-sm">
            {formatKobo(order.total_kobo)}
          </Text>
        )}
      </View>

      {/* Route */}
      <View className="mb-4 gap-2">
        {/* Pickup */}
        <View className="flex-row items-start gap-3">
          <View className="w-2 h-2 rounded-full bg-[#FF6B35] mt-1.5 flex-shrink-0" />
          <View className="flex-1">
            <Text className="text-white/40 text-xs uppercase tracking-wide mb-0.5">
              Pickup
            </Text>
            <Text className="text-white font-semibold text-sm">
              {order?.restaurant?.name ?? "Restaurant"}
            </Text>
            {order?.restaurant?.address && (
              <Text className="text-white/50 text-xs mt-0.5">
                {order.restaurant.address}
              </Text>
            )}
          </View>
        </View>

        {/* Dashed line */}
        <View className="ml-1 w-0.5 h-4 border-l border-dashed border-white/20 self-start ml-[3px]" />

        {/* Dropoff */}
        <View className="flex-row items-start gap-3">
          <View className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
          <View className="flex-1">
            <Text className="text-white/40 text-xs uppercase tracking-wide mb-0.5">
              Deliver to
            </Text>
            <Text className="text-white font-semibold text-sm">
              {order?.customer_name ?? "Customer"}
            </Text>
            {order?.delivery_address && (
              <Text className="text-white/50 text-xs mt-0.5">
                {order.delivery_address}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Actions */}
      <View className="flex-row gap-3">
        <TouchableOpacity
          className="flex-1 bg-white/10 rounded-btn py-3 items-center"
          onPress={handleDecline}
          disabled={declining || accepting}
          style={{ opacity: declining ? 0.5 : 1 }}
        >
          {declining ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
          ) : (
            <Text className="text-white/60 font-semibold text-sm">Decline</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          className="flex-2 bg-[#FF6B35] rounded-btn py-3 items-center"
          style={{ flex: 2, opacity: accepting ? 0.7 : 1 }}
          onPress={handleAccept}
          disabled={accepting || declining}
        >
          {accepting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white font-bold text-sm">Accept delivery</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
