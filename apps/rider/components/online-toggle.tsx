import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useAuthStore } from "@/lib/stores/auth";

export function OnlineToggle() {
  const rider = useAuthStore((s) => s.rider);
  const toggleOnline = useAuthStore((s) => s.toggleOnline);
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    await toggleOnline();
    setToggling(false);
  }

  const isOnline = rider?.is_online ?? false;

  return (
    <View className="flex-row items-center justify-between bg-white/5 border border-white/10 rounded-card px-4 py-3 mb-4">
      <View className="flex-row items-center gap-3">
        <View
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: isOnline ? "#2D6A4F" : "rgba(255,255,255,0.2)" }}
        />
        <View>
          <Text className="text-white font-semibold text-sm">
            {isOnline ? "You're online" : "You're offline"}
          </Text>
          <Text className="text-white/40 text-xs mt-0.5">
            {isOnline
              ? "Ready to receive deliveries"
              : "Go online to start receiving orders"}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={handleToggle}
        disabled={toggling}
        className="px-4 py-2 rounded-chip"
        style={{
          backgroundColor: isOnline ? "rgba(230,57,70,0.15)" : "#2D6A4F",
        }}
      >
        {toggling ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text
            className="font-bold text-xs"
            style={{ color: isOnline ? "#E63946" : "#fff" }}
          >
            {isOnline ? "Go offline" : "Go online"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
