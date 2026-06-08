/**
 * SMS campaign composer — RN port of the web `SmsComposer`.
 *
 * Mirrors web: audience picker (all / inactive-30 / VIP) with live recipient
 * counts, a {name}-personalisable message with char/segment count and preview,
 * a confirm-before-send dialog, and the result summary. The send goes to the
 * Bearer'd `/api/dashboard/marketing/sms-campaign` route (the route runs the
 * service-client SendChamp logic and is scoped to the caller's restaurant).
 *
 * Like web, SMS campaigns are gated "coming soon" until the targeting work
 * ships — when `comingSoon` is true the composer renders dimmed behind a
 * coming-soon notice and sending is disabled (the server also returns 503 as a
 * backstop). Flip the gate in the parent when the server is enabled.
 */
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";

import { sendSmsCampaign, ApiError, type SmsCampaignResult } from "../../lib/api";
import { theme } from "../../theme";
import { Input } from "../settings/ui";

type SmsAudience = "all" | "inactive_30" | "vip";

const MAX_CHARS = 612;

export function SmsComposer({
  comingSoon,
  customerCounts,
  senderStatus,
  senderName,
}: {
  comingSoon: boolean;
  customerCounts: { all: number; inactive30: number; vip: number };
  senderStatus: "pending" | "approved" | "rejected" | null;
  senderName: string | null;
}) {
  const [audience, setAudience] = useState<SmsAudience>("all");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SmsCampaignResult | null>(null);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const audienceCounts: Record<SmsAudience, number> = {
    all: customerCounts.all,
    inactive_30: customerCounts.inactive30,
    vip: customerCounts.vip,
  };
  const recipientCount = audienceCounts[audience];

  const charCount = message.length;
  const smsCount = charCount === 0 ? 1 : Math.ceil(charCount / 160);
  const previewText = message.replace(/\{name\}/gi, "Ahmed");

  async function handleSend() {
    setConfirmOpen(false);
    setSending(true);
    setError("");
    setResult(null);
    try {
      const data = await sendSmsCampaign(audience, message);
      setResult(data);
      setMessage("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to send campaign. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const canSend =
    !comingSoon &&
    !!message.trim() &&
    charCount <= MAX_CHARS &&
    recipientCount > 0 &&
    !sending;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        style={comingSoon ? { opacity: 0.45 } : undefined}
        pointerEvents={comingSoon ? "none" : "auto"}
      >
        {/* Sender status */}
        {senderStatus === "approved" && senderName ? (
          <View style={styles.senderOk}>
            <Text style={styles.senderOkText}>
              Sending as <Text style={{ fontWeight: "800" }}>{senderName}</Text>
            </Text>
          </View>
        ) : (
          <View style={styles.senderWarn}>
            <Text style={styles.senderWarnTitle}>Sender ID not yet approved</Text>
            <Text style={styles.senderWarnSub}>
              Messages will arrive from our platform sender name. Contact support to register your own
              branded Sender ID.
            </Text>
          </View>
        )}

        {/* Result */}
        {result && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Campaign sent</Text>
            <Text style={styles.resultSub}>
              {result.sent} delivered · {result.failed > 0 ? `${result.failed} failed · ` : ""}
              {result.total} total recipients
            </Text>
          </View>
        )}

        {/* Audience */}
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Who receives this?</Text>
          <View style={{ gap: 8 }}>
            {(
              [
                { value: "all", label: "All customers", hint: "Everyone who has ordered from you" },
                { value: "inactive_30", label: "Inactive 30+ days", hint: "Haven't ordered in over a month" },
                { value: "vip", label: "VIP customers", hint: "Loyal customers with 3 or more orders" },
              ] as { value: SmsAudience; label: string; hint: string }[]
            ).map((opt) => {
              const selected = audience === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setAudience(opt.value)}
                  style={[
                    styles.audienceRow,
                    selected && { borderColor: theme.colors.brand, backgroundColor: theme.colors.primary[50] },
                  ]}
                >
                  <View style={[styles.radio, selected && { borderColor: theme.colors.brand }]}>
                    {selected && <View style={styles.radioInner} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.audienceLabel, selected && { color: theme.colors.brand }]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.audienceHint}>{opt.hint}</Text>
                  </View>
                  <View style={[styles.countBadge, selected && { backgroundColor: theme.colors.primary[50] }]}>
                    <Text style={[styles.countText, selected && { color: theme.colors.brand }]}>
                      {audienceCounts[opt.value]}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Message */}
        <View style={styles.panel}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={styles.panelLabel}>Message</Text>
            <Text
              style={{
                fontSize: 11,
                color: charCount > MAX_CHARS ? theme.colors.cinnabar[500] : theme.colors.black[400],
                fontWeight: charCount > MAX_CHARS ? "700" : "400",
              }}
            >
              {charCount} / {MAX_CHARS} · {smsCount} SMS
            </Text>
          </View>
          <Input
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={MAX_CHARS}
            placeholder="Hi {name}! We have a special offer just for you — use code SAVE20 for 20% off your next order. Valid today only!"
            style={{ minHeight: 110 }}
          />
          <Text style={styles.helpText}>
            Use {"{name}"} to personalise with the customer's first name. Each SMS is 160 characters.
          </Text>
        </View>

        {/* Preview */}
        {message ? (
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Preview · as seen by Ahmed</Text>
            <Text style={styles.previewText}>{previewText}</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={{ fontSize: 13, color: theme.colors.cinnabar[500] }}>{error}</Text>
          </View>
        ) : null}

        {/* Send */}
        <Pressable
          onPress={() => setConfirmOpen(true)}
          disabled={!canSend}
          style={[styles.sendBtn, !canSend && { opacity: 0.5 }]}
        >
          <Text style={styles.sendBtnText}>
            {sending
              ? "Sending…"
              : `Send to ${recipientCount} customer${recipientCount === 1 ? "" : "s"}`}
          </Text>
        </Pressable>
        {recipientCount === 0 && (
          <Text style={{ fontSize: 12, color: theme.colors.black[400], textAlign: "center" }}>
            No customers in this segment yet.
          </Text>
        )}
      </ScrollView>

      {/* Coming-soon overlay (parity with web's gated tab) */}
      {comingSoon && (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.overlayCard}>
            <View style={styles.soonPill}>
              <Text style={styles.soonPillText}>Coming soon</Text>
            </View>
            <Text style={styles.overlayTitle}>SMS Campaigns are almost here</Text>
            <Text style={styles.overlaySub}>
              We're finishing the discount integration that powers targeted campaigns. You'll be able
              to message your customers shortly.
            </Text>
          </View>
        </View>
      )}

      {/* Confirm-before-send */}
      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <Pressable style={styles.confirmBackdrop} onPress={() => setConfirmOpen(false)}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>Send this campaign?</Text>
            <Text style={styles.confirmSub}>
              This will send an SMS to {recipientCount} customer{recipientCount === 1 ? "" : "s"}. This
              action cannot be undone.
            </Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <Pressable style={styles.confirmCancel} onPress={() => setConfirmOpen(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmSend} onPress={handleSend}>
                <Text style={styles.confirmSendText}>Send now</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = {
  senderOk: {
    backgroundColor: theme.colors.viridian[100],
    borderWidth: 1,
    borderColor: theme.colors.viridian[500],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  senderOkText: { fontSize: 12, color: theme.colors.viridian[500] },
  senderWarn: {
    backgroundColor: theme.colors.dixie[100],
    borderWidth: 1,
    borderColor: theme.colors.dixie[500],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  senderWarnTitle: { fontSize: 13, fontWeight: "700" as const, color: theme.colors.dixie[500] },
  senderWarnSub: { fontSize: 12, color: theme.colors.black[500], marginTop: 2, lineHeight: 16 },
  resultBox: {
    backgroundColor: theme.colors.viridian[100],
    borderWidth: 1,
    borderColor: theme.colors.viridian[500],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resultTitle: { fontSize: 13, fontWeight: "700" as const, color: theme.colors.viridian[500] },
  resultSub: { fontSize: 12, color: theme.colors.black[500], marginTop: 2 },
  panel: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.black[100],
    padding: 14,
  },
  panelLabel: { fontSize: 12, fontWeight: "600" as const, color: theme.colors.black[500], marginBottom: 10 },
  audienceRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.black[100],
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.black[200],
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  radioInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.brand },
  audienceLabel: { fontSize: 14, fontWeight: "600" as const, color: theme.colors.black[900] },
  audienceHint: { fontSize: 11, color: theme.colors.black[400], marginTop: 1 },
  countBadge: { backgroundColor: theme.colors.black[100], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 12, fontWeight: "700" as const, color: theme.colors.black[500] },
  helpText: { fontSize: 11, color: theme.colors.black[400], marginTop: 8, lineHeight: 15 },
  previewBox: { backgroundColor: theme.colors.black[50], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  previewLabel: { fontSize: 11, fontWeight: "600" as const, color: theme.colors.black[500], marginBottom: 4 },
  previewText: { fontSize: 14, color: theme.colors.black[900], lineHeight: 20 },
  errorBox: { backgroundColor: theme.colors.cinnabar[100], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  sendBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center" as const,
  },
  sendBtnText: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.white },
  overlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center" as const,
    justifyContent: "flex-start" as const,
    paddingTop: 64,
    paddingHorizontal: 24,
  },
  overlayCard: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 22,
    alignItems: "center" as const,
    maxWidth: 340,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  soonPill: {
    backgroundColor: theme.colors.primary[50],
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  soonPillText: { fontSize: 11, fontWeight: "700" as const, color: theme.colors.brand },
  overlayTitle: { fontSize: 16, fontWeight: "800" as const, color: theme.colors.black[900], marginTop: 12, textAlign: "center" as const },
  overlaySub: { fontSize: 13, color: theme.colors.black[500], marginTop: 6, textAlign: "center" as const, lineHeight: 18 },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17,17,17,0.45)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 24,
  },
  confirmCard: { backgroundColor: theme.colors.white, borderRadius: 16, padding: 22, width: "100%" as const, maxWidth: 360 },
  confirmTitle: { fontSize: 16, fontWeight: "800" as const, color: theme.colors.black[900] },
  confirmSub: { fontSize: 13, color: theme.colors.black[500], marginTop: 8, lineHeight: 18 },
  confirmCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center" as const,
  },
  confirmCancelText: { fontSize: 14, fontWeight: "600" as const, color: theme.colors.black[500] },
  confirmSend: {
    flex: 1,
    backgroundColor: theme.colors.brand,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center" as const,
  },
  confirmSendText: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.white },
};
