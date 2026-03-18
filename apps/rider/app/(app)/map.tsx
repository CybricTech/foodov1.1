import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { useDeliveryStore } from "@/lib/stores/delivery";
import { useCurrentLocation } from "@/lib/hooks/use-location";
import { DeliverySteps } from "@/components/delivery-steps";

export default function MapScreen() {
  const active = useDeliveryStore((s) => s.activeAssignment);
  const { latitude, longitude } = useCurrentLocation();

  const hasLocation = latitude !== null && longitude !== null;

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      {/* Map */}
      <View style={StyleSheet.absoluteFillObject}>
        {hasLocation ? (
          <MapView
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFillObject}
            customMapStyle={darkMapStyle}
            initialRegion={{
              latitude: latitude!,
              longitude: longitude!,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {/* Rider marker is showsUserLocation */}
            {active?.order?.restaurant && (
              <Marker
                coordinate={{
                  // Placeholder coords — real implementation would geocode the address
                  latitude: latitude! + 0.002,
                  longitude: longitude! + 0.002,
                }}
                pinColor="#FF6B35"
                title={active.order.restaurant.name}
                description="Pickup"
              />
            )}
          </MapView>
        ) : (
          <View className="flex-1 bg-[#111] items-center justify-center">
            <Text className="text-white/30 text-sm">Loading map...</Text>
          </View>
        )}
      </View>

      {/* Bottom sheet */}
      <SafeAreaView edges={["bottom"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
        <View className="mx-4 mb-4">
          {active ? (
            <>
              {/* Order info */}
              <View className="bg-[#111] border border-white/10 rounded-card px-4 py-3 mb-3">
                <Text className="text-white/40 text-xs uppercase tracking-wide mb-1">
                  {active.status === "accepted" ? "Head to restaurant" : "Head to customer"}
                </Text>
                <Text className="text-white font-bold text-base">
                  {active.status === "accepted"
                    ? active.order?.restaurant?.name ?? "Restaurant"
                    : active.order?.customer_name ?? "Customer"}
                </Text>
                <Text className="text-white/50 text-sm mt-0.5">
                  {active.status === "accepted"
                    ? active.order?.restaurant?.address ?? ""
                    : active.order?.delivery_address ?? ""}
                </Text>
              </View>
              <DeliverySteps assignment={active} />
            </>
          ) : (
            <View className="bg-[#111] border border-white/10 rounded-card px-4 py-5 items-center">
              <Text className="text-white/40 text-sm">No active delivery</Text>
              <Text className="text-white/20 text-xs mt-1">
                Accept an order from the Home tab
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// Dark map style to match app theme
const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#666666" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a0a0a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];
