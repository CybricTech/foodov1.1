import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { supabase } from "@/lib/supabase";

type Step = "phone" | "otp";

function normalizeNigerianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) {
    return "+234" + digits.slice(1);
  }
  if (digits.startsWith("234") && digits.length === 13) {
    return "+" + digits;
  }
  if (digits.startsWith("+234")) return digits;
  return "+" + digits;
}

export default function LoginScreen() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendOtp() {
    setLoading(true);
    const normalized = normalizeNigerianPhone(phone.trim());
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    setPhone(normalized);
    setStep("otp");
  }

  async function verifyOtp() {
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: otp.trim(),
      type: "sms",
    });
    setLoading(false);
    if (error) {
      Alert.alert("Invalid code", "Please check the code and try again.");
    }
    // On success auth state change fires → _layout.tsx redirects to (app)
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#0A0A0A]"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="flex-1 justify-center px-6">
        {/* Wordmark */}
        <View className="mb-12">
          <Text className="text-4xl font-black text-white tracking-tight">
            Foodo
          </Text>
          <Text className="text-base text-white/50 mt-1 font-medium">
            Rider
          </Text>
        </View>

        {step === "phone" ? (
          <>
            <Text className="text-white text-lg font-bold mb-2">
              Enter your phone number
            </Text>
            <Text className="text-white/50 text-sm mb-6">
              We'll send a one-time code to verify your identity.
            </Text>
            <TextInput
              className="bg-white/5 border border-white/10 rounded-card px-4 py-4 text-white text-base mb-4"
              placeholder="08012345678"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              autoFocus
            />
            <TouchableOpacity
              className="bg-[#FF6B35] rounded-btn py-4 items-center"
              onPress={sendOtp}
              disabled={loading || phone.length < 10}
              style={{ opacity: loading || phone.length < 10 ? 0.5 : 1 }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-base">
                  Send code
                </Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text className="text-white text-lg font-bold mb-2">
              Enter the 6-digit code
            </Text>
            <Text className="text-white/50 text-sm mb-6">
              Sent to {phone}
            </Text>
            <TextInput
              className="bg-white/5 border border-white/10 rounded-card px-4 py-4 text-white text-2xl tracking-widest text-center mb-4"
              placeholder="000000"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={setOtp}
              autoFocus
            />
            <TouchableOpacity
              className="bg-[#FF6B35] rounded-btn py-4 items-center mb-3"
              onPress={verifyOtp}
              disabled={loading || otp.length < 6}
              style={{ opacity: loading || otp.length < 6 ? 0.5 : 1 }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-base">Verify</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep("phone")}>
              <Text className="text-white/40 text-sm text-center">
                Wrong number? Go back
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
