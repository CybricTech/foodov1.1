/**
 * Account & help — shared by owners (More tab) and staff (Menu tab header).
 *
 * Hosts the store-required surfaces: support contact, privacy policy, terms,
 * and in-app account deletion — plus sign out and the app version. Deletion
 * files a request (POST /api/merchant/account/deletion-request) that Kitchyn
 * processes within 30 days, then signs the user out.
 */
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import Constants from "expo-constants";
import {
  ChevronRight,
  FileText,
  LifeBuoy,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react-native";

import { useAuth } from "../src/lib/auth";
import { ApiError, requestAccountDeletion } from "../src/lib/api";
import { PRIVACY_URL, SUPPORT_EMAIL, SUPPORT_URL, TERMS_URL, openLink } from "../src/lib/links";
import { ScreenHeader } from "../src/components/screen-header";
import { theme } from "../src/theme";

interface Row {
  label: string;
  description?: string;
  icon: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
  busy?: boolean;
}

export default function AccountScreen() {
  const { profile, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

  if (!profile) return <Redirect href="/login" />;

  const isOwner = profile.role === "merchant_owner";

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  async function submitDeletion() {
    setDeleting(true);
    try {
      await requestAccountDeletion();
    } catch (e) {
      setDeleting(false);
      Alert.alert(
        "Couldn't send request",
        e instanceof ApiError && e.status !== 0
          ? e.message
          : `Check your connection and try again, or email ${SUPPORT_EMAIL}.`
      );
      return;
    }
    Alert.alert(
      "Deletion requested",
      `We've received your request and will delete your account within 30 days. Questions? Email ${SUPPORT_EMAIL}.`,
      [{ text: "OK", onPress: () => void handleSignOut() }],
      { cancelable: false }
    );
  }

  function confirmDeletion() {
    Alert.alert(
      "Delete your account?",
      (isOwner
        ? "This closes your restaurant's Kitchyn account, including staff logins. "
        : "This removes your staff login. ") +
        "Your personal data will be deleted within 30 days. Order and payment records we're required by law to keep are retained. You'll be signed out.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: () => void submitDeletion() },
      ]
    );
  }

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: "Help",
      rows: [
        {
          label: "Help & support",
          description: "kitchyn.app/support",
          icon: LifeBuoy,
          onPress: () => openLink(SUPPORT_URL),
        },
        {
          label: "Email support",
          description: SUPPORT_EMAIL,
          icon: Mail,
          onPress: () => openLink(`mailto:${SUPPORT_EMAIL}`),
        },
      ],
    },
    {
      title: "Legal",
      rows: [
        { label: "Privacy Policy", icon: ShieldCheck, onPress: () => openLink(PRIVACY_URL) },
        { label: "Terms of Service", icon: FileText, onPress: () => openLink(TERMS_URL) },
      ],
    },
    {
      title: "Account",
      rows: [
        {
          label: "Sign out",
          description: profile.fullName || profile.email,
          icon: LogOut,
          onPress: () => void handleSignOut(),
        },
        {
          label: "Delete account",
          description: isOwner ? "Close your restaurant's Kitchyn account" : "Remove your staff login",
          icon: Trash2,
          onPress: confirmDeletion,
          destructive: true,
          busy: deleting,
        },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.black[50] }}>
      <ScreenHeader title="Account & help" subtitle={profile.email} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Cap width so rows don't stretch edge-to-edge on iPad. */}
        <View style={{ width: "100%", maxWidth: 640, alignSelf: "center", gap: 20 }}>
          {sections.map((section) => (
            <View key={section.title}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.card}>
                {section.rows.map((row, i) => (
                  <RowItem key={row.label} row={row} first={i === 0} />
                ))}
              </View>
            </View>
          ))}

          <Text style={styles.version}>
            Kitchyn Merchant v{Constants.expoConfig?.version ?? "1.0.0"}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function RowItem({ row, first }: { row: Row; first: boolean }) {
  const Icon = row.icon;
  const tint = row.destructive ? theme.colors.cinnabar[500] : theme.colors.brand;
  return (
    <Pressable
      onPress={row.onPress}
      disabled={row.busy}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { borderTopWidth: first ? 0 : 1, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: row.destructive
              ? theme.colors.cinnabar[100]
              : theme.colors.primary[50],
          },
        ]}
      >
        <Icon size={18} color={tint} strokeWidth={2.25} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[
            styles.rowLabel,
            row.destructive && { color: theme.colors.cinnabar[500] },
          ]}
        >
          {row.label}
        </Text>
        {row.description ? (
          <Text style={styles.rowDescription} numberOfLines={1}>
            {row.description}
          </Text>
        ) : null}
      </View>
      {row.busy ? (
        <ActivityIndicator color={tint} />
      ) : (
        <ChevronRight size={18} color={theme.colors.black[200]} />
      )}
    </Pressable>
  );
}

const styles = {
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: theme.colors.black[400],
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.black[100],
    overflow: "hidden" as const,
  },
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopColor: theme.colors.black[100],
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  rowLabel: { fontSize: 15, fontWeight: "600" as const, color: theme.colors.black[900] },
  rowDescription: { fontSize: 12, color: theme.colors.black[400], marginTop: 2 },
  version: { fontSize: 12, color: theme.colors.black[400], textAlign: "center" as const },
};
