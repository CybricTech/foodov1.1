/**
 * Bank account section — READ-ONLY on mobile.
 *
 * Shows the saved payout account via the Bearer'd `/api/merchant/banking`
 * route. Adding or changing payout details (Monnify name-enquiry + save) is
 * deliberately left to the web dashboard so financial-detail editing stays out
 * of the store-reviewed app.
 */
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Banknote } from "lucide-react-native";

import { fetchBanking, type BankingInfo } from "../../lib/api";
import { DASHBOARD_URL, openLink } from "../../lib/links";
import { theme } from "../../theme";
import { Section } from "./ui";

export function BankSection({ restaurantId }: { restaurantId: string }) {
  const [saved, setSaved] = useState<BankingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchBanking(restaurantId);
        if (alive) setSaved(data);
      } catch {
        // Non-fatal: fall through to the "no account" state.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  return (
    <Section
      title="Bank account"
      icon={<Banknote size={18} color={theme.colors.brand} strokeWidth={2.25} />}
    >
      {loading ? (
        <Text style={{ fontSize: 13, color: theme.colors.black[400] }}>Loading…</Text>
      ) : saved?.bank_account_name ? (
        <View style={{ gap: 10 }}>
          <ReadonlyRow label="Account name" value={saved.bank_account_name} />
          <ReadonlyRow label="Account number" value={saved.bank_account_number ?? ""} />
          {(saved.paystack_recipient_code || saved.monnify_bank_verified_at) && (
            <Text style={{ fontSize: 12, color: theme.colors.viridian[500] }}>
              Verified — ready for automatic settlement
            </Text>
          )}
        </View>
      ) : (
        <Text style={{ fontSize: 13, color: theme.colors.black[500] }}>
          No payout account added yet.
        </Text>
      )}

      <View style={styles.note}>
        <Text style={styles.noteText}>
          To add or change your payout account, sign in to the Kitchyn dashboard on the web.
        </Text>
        <Pressable onPress={() => openLink(DASHBOARD_URL)} hitSlop={6} accessibilityRole="link">
          <Text style={styles.linkText}>Open web dashboard</Text>
        </Pressable>
      </View>
    </Section>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readonlyRow}>
      <Text style={styles.readonlyLabel}>{label}</Text>
      <Text style={styles.readonlyValue}>{value}</Text>
    </View>
  );
}

const styles = {
  linkText: { fontSize: 13, fontWeight: "600" as const, color: theme.colors.brand },
  note: {
    marginTop: 12,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.black[50],
    paddingTop: 10,
  },
  noteText: { fontSize: 12, color: theme.colors.black[400], lineHeight: 17 },
  readonlyRow: { backgroundColor: theme.colors.black[50], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  readonlyLabel: { fontSize: 11, fontWeight: "600" as const, color: theme.colors.black[500] },
  readonlyValue: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.black[900], marginTop: 2 },
};
