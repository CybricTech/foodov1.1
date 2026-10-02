/**
 * Rider contact: the number a Kitchyn rider calls when they arrive to collect.
 * RN port of `RiderContactSection` in web components/dashboard/settings-client.tsx;
 * read that for the canonical behaviour.
 *
 * Saves on its own through the Bearer'd `/api/merchant/rider-contact` route,
 * which validates against the same rules the booking path uses and knows
 * whether the rollout includes this store (platform_settings isn't readable
 * from a merchant session). The WhatsApp option previews the live value from
 * the Notifications field above, so editing that number shows here at once.
 *
 * If the route can't be reached (older API, offline) the section hides itself
 * rather than offering a control that can't save.
 */
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { PhoneCall } from "lucide-react-native";

import {
  formatPhoneDisplay,
  normalizeNigerianMobile,
  parseRiderContactInput,
  resolveMerchantRiderPhone,
  type RiderContactStatus,
} from "@foodo/utils";

import { ApiError, fetchRiderContact, saveRiderContact } from "../../lib/api";
import { theme } from "../../theme";
import { ErrorText, Input, PrimaryButton, Section } from "./ui";

type Choice = "whatsapp" | "custom";

export function RiderContactSection({ whatsappNumber }: { whatsappNumber: string }) {
  const [status, setStatus] = useState<RiderContactStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [choice, setChoice] = useState<Choice>("whatsapp");
  const [customDraft, setCustomDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function adopt(next: RiderContactStatus) {
    setStatus(next);
    setChoice(next.customPhone ? "custom" : "whatsapp");
    setCustomDraft(next.customPhone ? formatPhoneDisplay(next.customPhone) : "");
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchRiderContact();
        if (alive) adopt(data);
      } catch {
        if (alive) setUnavailable(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (unavailable) return null;

  const icon = <PhoneCall size={18} color={theme.colors.brand} strokeWidth={2.25} />;

  if (!status) {
    return (
      <Section title="Rider contact" icon={icon}>
        <Text style={{ fontSize: 13, color: theme.colors.black[400] }}>Loading…</Text>
      </Section>
    );
  }

  const parsedCustom = parseRiderContactInput(customDraft);
  const customBlank = !customDraft.trim();
  // What would be saved: null = follow WhatsApp; undefined = not saveable yet.
  const target: string | null | undefined =
    choice === "whatsapp" ? null : parsedCustom.ok && !customBlank ? parsedCustom.phone : undefined;
  const dirty = target !== undefined && target !== status.customPhone;

  const preview = resolveMerchantRiderPhone({
    customPhone: choice === "custom" ? (customBlank ? null : customDraft) : null,
    whatsappNumber,
  });
  const whatsappPhone = normalizeNigerianMobile(whatsappNumber);

  async function handleSave() {
    if (target === undefined) return;
    setSaving(true);
    setError("");
    try {
      adopt(await saveRiderContact(target));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your rider contact.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Rider contact" icon={icon}>
      <View style={[styles.pill, status.live ? styles.pillLive : styles.pillIdle]}>
        <View
          style={[
            styles.pillDot,
            { backgroundColor: status.live ? theme.colors.viridian[500] : theme.colors.black[400] },
          ]}
        />
        <Text
          style={[
            styles.pillText,
            { color: status.live ? theme.colors.viridian[500] : theme.colors.black[500] },
          ]}
        >
          {status.live ? "Active" : "Coming soon"}
        </Text>
      </View>

      <Text style={styles.body}>
        When a Kitchyn rider arrives to collect an order, this is the number they call. The
        customer&apos;s number is already in the rider&apos;s instructions for the drop-off, so
        you&apos;ll only hear from riders about pickups.
      </Text>

      {!status.live && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            For now, riders call Kitchyn and we pass the message on. Set your number now and
            we&apos;ll start using it as soon as your store is switched over.
          </Text>
        </View>
      )}

      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        <OptionCard
          selected={choice === "whatsapp"}
          onPress={() => setChoice("whatsapp")}
          title="My WhatsApp alert number"
          subtitle={
            whatsappPhone
              ? formatPhoneDisplay(whatsappPhone)
              : whatsappNumber.trim()
                ? `${whatsappNumber.trim()} isn't a Nigerian mobile number`
                : "Not set yet. Add it under Notifications above."
          }
          subtitleTone={whatsappPhone ? "mono" : whatsappNumber.trim() ? "error" : "muted"}
        />
        <OptionCard
          selected={choice === "custom"}
          onPress={() => setChoice("custom")}
          title="A different number"
          subtitle="Like your kitchen or front-desk phone"
          subtitleTone="muted"
        >
          {choice === "custom" && (
            <Input
              value={customDraft}
              onChangeText={setCustomDraft}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              placeholder="0803 123 4567"
              accessibilityLabel="Number riders should call"
              style={[
                { marginTop: 10, backgroundColor: theme.colors.white },
                !customBlank && !parsedCustom.ok ? { borderColor: theme.colors.cinnabar[500] } : null,
              ]}
            />
          )}
        </OptionCard>
      </View>

      {/* What riders will actually get, given the choice above. */}
      {choice === "custom" && !customBlank && !parsedCustom.ok ? (
        <ErrorText>{parsedCustom.error}</ErrorText>
      ) : choice === "custom" && customBlank ? (
        <Text style={styles.muted}>Enter the number riders should call.</Text>
      ) : preview.ok ? (
        <Text style={styles.previewText}>
          Riders will call{" "}
          <Text style={styles.previewNumber}>{formatPhoneDisplay(preview.phone)}</Text>
          {status.live ? "." : " once your store is switched over."}
        </Text>
      ) : (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>
            Without a working number, riders will keep calling Kitchyn. Add a WhatsApp number above
            or choose a different number.
          </Text>
        </View>
      )}

      <Text style={styles.tip}>
        Choose a phone someone answers during opening hours. Riders call when they arrive, or if
        they can&apos;t find you. Bolt may also text this number about the rider.
      </Text>

      {error ? <ErrorText>{error}</ErrorText> : null}
      <PrimaryButton
        label={saved ? "Saved!" : "Save rider contact"}
        onPress={handleSave}
        busy={saving}
        disabled={!dirty}
      />
    </Section>
  );
}

function OptionCard({
  selected,
  onPress,
  title,
  subtitle,
  subtitleTone,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle: string;
  subtitleTone: "mono" | "muted" | "error";
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={[
        styles.option,
        selected && { borderColor: theme.colors.brand, backgroundColor: theme.colors.primary[50] },
      ]}
    >
      <View style={[styles.radioDot, selected && { borderColor: theme.colors.brand }]}>
        {selected && <View style={styles.radioDotInner} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text
          style={[
            styles.optionSub,
            subtitleTone === "mono" && { color: theme.colors.black[500], fontVariant: ["tabular-nums"] },
            subtitleTone === "error" && { color: theme.colors.cinnabar[500] },
          ]}
        >
          {subtitle}
        </Text>
        {children}
      </View>
    </Pressable>
  );
}

const styles = {
  pill: {
    alignSelf: "flex-start" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillLive: { backgroundColor: theme.colors.viridian[100] },
  pillIdle: { backgroundColor: theme.colors.black[100] },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: "600" as const },
  body: { fontSize: 13, color: theme.colors.black[500], lineHeight: 19 },
  infoBox: {
    backgroundColor: theme.colors.black[50],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  infoText: { fontSize: 12, color: theme.colors.black[500], lineHeight: 17 },
  option: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  radioDot: {
    marginTop: 1,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: theme.colors.black[400],
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  radioDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.brand },
  optionTitle: { fontSize: 14, fontWeight: "600" as const, color: theme.colors.black[900] },
  optionSub: { fontSize: 12, color: theme.colors.black[400], marginTop: 2 },
  muted: { fontSize: 12, color: theme.colors.black[400] },
  previewText: { fontSize: 13, color: theme.colors.black[500] },
  previewNumber: { fontWeight: "700" as const, color: theme.colors.black[900] },
  warnBox: {
    backgroundColor: theme.colors.dixie[100],
    borderWidth: 1,
    borderColor: theme.colors.dixie[500],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  warnText: { fontSize: 12, color: theme.colors.black[900], lineHeight: 17 },
  tip: { fontSize: 11, color: theme.colors.black[400], lineHeight: 16 },
};
