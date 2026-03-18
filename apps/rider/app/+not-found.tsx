import { View, Text, TouchableOpacity } from "react-native";
import { Link } from "expo-router";

export default function NotFoundScreen() {
  return (
    <View className="flex-1 bg-[#0A0A0A] items-center justify-center px-6">
      <Text className="text-6xl mb-4">🔍</Text>
      <Text className="text-white text-xl font-bold mb-2">Screen not found</Text>
      <Text className="text-white/50 text-sm mb-8 text-center">
        The screen you're looking for doesn't exist.
      </Text>
      <Link href="/(app)" asChild>
        <TouchableOpacity className="bg-[#FF6B35] rounded-btn px-6 py-3">
          <Text className="text-white font-bold">Go home</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}
