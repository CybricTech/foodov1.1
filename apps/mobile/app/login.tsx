/**
 * Merchant login — branded email/password form mirroring the web login copy
 * ("Merchant Login" / "Sign in to manage your restaurant"). On success the auth
 * context resolves the merchant profile; a successful sign-in flips `profile`,
 * and the effect below sends the user to "/" so index.tsx performs the single,
 * role-based redirect (owner → dashboard, staff → frontline). PostHog
 * `merchant_login` is captured inside `signIn` (auth context).
 */
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";

import { useAuth } from "../src/lib/auth";
import { theme } from "../src/theme";

export default function LoginScreen() {
  const { signIn, profile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Once authenticated, hand off to "/" which routes by role (owner → owner
  // dashboard, staff → frontline). Keeping that decision in one place (index.tsx)
  // avoids the role-routing drifting between here and the entry redirect.
  useEffect(() => {
    if (profile) router.replace("/");
  }, [profile]);

  async function handleLogin() {
    setLoading(true);
    setError("");
    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError);
      setLoading(false);
      return;
    }
    // Navigation happens via the effect when `profile` lands.
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.black[50] }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <Image
            source={require("../assets/logo.png")}
            style={{ width: 180, height: 62 }}
            resizeMode="contain"
            accessibilityLabel="Kitchyn"
          />
          <Text style={{ fontSize: 22, fontWeight: "800", color: theme.colors.black[900], marginTop: 16 }}>
            Merchant Login
          </Text>
          <Text style={{ fontSize: 14, color: theme.colors.black[400], marginTop: 4 }}>
            Sign in to manage your restaurant
          </Text>
        </View>

        <View
          style={{
            backgroundColor: theme.colors.white,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.black[100],
            padding: 20,
            gap: 16,
          }}
        >
          <View>
            <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.black[500], marginBottom: 6 }}>
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@restaurant.com"
              placeholderTextColor={theme.colors.black[400]}
              style={inputStyle}
            />
          </View>

          <View>
            <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.black[500], marginBottom: 6 }}>
              Password
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              placeholder="••••••••"
              placeholderTextColor={theme.colors.black[400]}
              style={inputStyle}
              onSubmitEditing={handleLogin}
            />
          </View>

          {!!error && (
            <View
              style={{
                backgroundColor: theme.colors.cinnabar[100],
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: theme.colors.cinnabar[500] }}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            style={({ pressed }) => ({
              backgroundColor: theme.colors.brand,
              opacity: loading ? 0.6 : pressed ? 0.85 : 1,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
            })}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Sign in</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: theme.colors.black[200],
  borderRadius: 12,
  paddingHorizontal: 16,
  paddingVertical: 12,
  fontSize: 15,
  color: theme.colors.black[900],
} as const;
