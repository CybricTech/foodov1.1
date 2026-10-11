/**
 * Merchant agreement — RN port of the web `AgreementSection`.
 *
 * Shows the latest agreement's status; when it's the merchant's turn, "Review &
 * sign" fetches a live DocuSeal signing link and opens it in the browser. Once
 * countersigned, "View signed agreement" opens a short-lived link to the PDF.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { FileSignature } from "lucide-react-native";

import { theme } from "../../theme";
import {
  ApiError,
  fetchAgreement,
  fetchAgreementFileUrl,
  type MerchantAgreement,
} from "../../lib/api";
import { openLink } from "../../lib/links";
import { ErrorText, PrimaryButton, SecondaryButton, Section } from "./ui";

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "Preparing", bg: theme.colors.black[100], fg: theme.colors.black[500] },
  sent: { label: "Awaiting your signature", bg: theme.colors.primary[50], fg: theme.colors.brandDark },
  merchant_signed: {
    label: "Awaiting Kitchyn countersignature",
    bg: theme.colors.dixie[100],
    fg: theme.colors.black[900],
  },
  completed: { label: "Signed", bg: theme.colors.viridian[100], fg: theme.colors.viridian[500] },
  declined: { label: "Declined", bg: theme.colors.cinnabar[100], fg: theme.colors.cinnabar[500] },
  expired: { label: "Expired — contact Kitchyn", bg: theme.colors.black[100], fg: theme.colors.black[500] },
  voided: { label: "Voided — contact Kitchyn", bg: theme.colors.black[100], fg: theme.colors.black[500] },
};

export function AgreementSection() {
  const [loading, setLoading] = useState(true);
  const [agreement, setAgreement] = useState<MerchantAgreement | null>(null);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await fetchAgreement();
      setAgreement(data.agreement);
      setSignUrl(data.sign_url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your agreement.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReviewAndSign() {
    setBusy(true);
    setError("");
    try {
      // Signing links are short-lived; always fetch a fresh one on tap.
      const data = await fetchAgreement();
      setAgreement(data.agreement);
      const url = data.sign_url ?? signUrl;
      if (url) await openLink(url);
      else setError("Signing link isn't ready yet — try again shortly.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load signing link");
    }
    setBusy(false);
  }

  async function handleViewSigned() {
    setBusy(true);
    setError("");
    try {
      const { url } = await fetchAgreementFileUrl();
      await openLink(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open the signed agreement.");
    }
    setBusy(false);
  }

  const icon = <FileSignature size={18} color={theme.colors.brand} strokeWidth={2.25} />;

  if (loading) {
    return (
      <Section title="Merchant agreement" icon={icon}>
        <ActivityIndicator color={theme.colors.brand} />
      </Section>
    );
  }

  if (!agreement) {
    return (
      <Section title="Merchant agreement" icon={icon}>
        {error ? (
          <ErrorText>{error}</ErrorText>
        ) : (
          <Text style={styles.muted}>
            Kitchyn hasn&rsquo;t sent your Merchant Agreement yet — you&rsquo;ll see it here as soon
            as it&rsquo;s ready to sign.
          </Text>
        )}
      </Section>
    );
  }

  const meta = STATUS_META[agreement.status] ?? STATUS_META.draft;

  return (
    <Section title="Merchant agreement" icon={icon}>
      <View style={[styles.badge, { backgroundColor: meta.bg }]}>
        <Text style={[styles.badgeText, { color: meta.fg }]}>{meta.label}</Text>
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {agreement.status === "sent" && (
        <PrimaryButton label="Review & sign" onPress={handleReviewAndSign} busy={busy} />
      )}
      {agreement.status === "completed" && agreement.final_pdf_path && (
        <SecondaryButton label="View signed agreement" onPress={handleViewSigned} busy={busy} />
      )}
    </Section>
  );
}

const styles = {
  muted: { fontSize: 13, color: theme.colors.black[400], lineHeight: 18 },
  badge: {
    alignSelf: "flex-start" as const,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: "600" as const },
};
