/**
 * Non-blocking heads-up that a Merchant Agreement is waiting to be signed —
 * the web dashboard's `AgreementReminderBanner`. Never gates anything; it just
 * points at Settings, where the "Merchant agreement" section lives.
 */
import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";
import { router } from "expo-router";
import { FileSignature } from "lucide-react-native";

import { fetchAgreement } from "../../lib/api";
import { hasApiConfig } from "../../lib/env";
import { theme } from "../../theme";

export function AgreementReminder() {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!hasApiConfig) return;
    let cancelled = false;
    fetchAgreement()
      .then((data) => {
        if (!cancelled) setPending(data.agreement?.status === "sent");
      })
      // Best effort: a failed check just means no banner.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pending) return null;

  return (
    <Pressable
      onPress={() => router.push("/(owner)/settings")}
      accessibilityRole="link"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: theme.colors.primary[50],
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.primary[100],
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <FileSignature size={15} color={theme.colors.brandDark} strokeWidth={2.5} />
      <Text style={{ flex: 1, fontSize: 13, color: theme.colors.brandDark }}>
        <Text style={{ fontWeight: "700" }}>Your Merchant Agreement is ready to sign</Text>
        {" — review in Settings →"}
      </Text>
    </Pressable>
  );
}
