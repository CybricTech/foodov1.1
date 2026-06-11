/**
 * Auth-gated entry / redirect.
 *
 *   loading              → branded splash (ActivityIndicator)
 *   no merchant session  → /login
 *   merchant_staff       → /(frontline)/orders
 *   merchant_owner       → /(owner) (owner home)
 *
 * Phase 2a splits routing by role: owners land in the owner dashboard group,
 * staff in the frontline queue. `profile` is only set when the account has a
 * restaurant_id + a merchant role, so its presence is the auth gate; `role`
 * then selects the group. Owners can still drop into Frontline mode from the
 * owner "More" tab.
 */
import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { useAuth } from "../src/lib/auth";
import { theme } from "../src/theme";

export default function Index() {
  const { loading, profile, configured } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.brand,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 28, fontWeight: "800", marginBottom: 16 }}>
          Kitchyn
        </Text>
        <ActivityIndicator color="#fff" />
        {!configured && (
          <Text style={{ color: "rgba(255,255,255,0.8)", marginTop: 16, fontSize: 12 }}>
            Not configured — set EXPO_PUBLIC_SUPABASE_*
          </Text>
        )}
      </View>
    );
  }

  if (!profile) {
    return <Redirect href="/login" />;
  }

  if (profile.role === "merchant_staff") {
    return <Redirect href="/(frontline)/orders" />;
  }

  return <Redirect href="/(owner)" />;
}
