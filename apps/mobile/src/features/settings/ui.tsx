/**
 * Shared presentational primitives for the owner Settings + Marketing screens.
 *
 * These mirror the small `Section` / `Field` / input helpers the web clients
 * use (settings-client.tsx, marketing-client.tsx), but as native components so
 * both screens share one brand-consistent look (card sections, labelled fields,
 * the purple primary button, inline errors). Pure UI — no data access.
 */
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { theme } from "../../theme";

/** A titled white card that groups related settings (web `Section`). */
export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>
        {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
        {children}
      </View>
    </View>
  );
}

/** A labelled field with optional hint text below (web `Field`). */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Brand-themed text input matching the menu-manager input styling. */
export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={theme.colors.black[400]}
      {...props}
      style={[styles.input, props.multiline && styles.inputMultiline, props.style]}
    />
  );
}

/** Full-width primary action button with a built-in busy spinner. */
export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.primaryBtn, isDisabled && { opacity: 0.6 }]}
    >
      {busy ? (
        <ActivityIndicator color={theme.colors.white} />
      ) : (
        <Text style={styles.primaryBtnText}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Secondary (outlined) button. */
export function SecondaryButton({
  label,
  onPress,
  busy,
  destructive,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.secondaryBtn,
        destructive && { borderColor: theme.colors.cinnabar[500] },
        isDisabled && { opacity: 0.5 },
      ]}
    >
      <Text
        style={[
          styles.secondaryBtnText,
          destructive && { color: theme.colors.cinnabar[500] },
        ]}
      >
        {busy ? "Working…" : label}
      </Text>
    </Pressable>
  );
}

/** Inline error message (cinnabar). */
export function ErrorText({ children }: { children: string }) {
  return <Text style={styles.errorText}>{children}</Text>;
}

export const styles = {
  section: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.black[100],
    overflow: "hidden" as const,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.black[100],
  },
  sectionTitle: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.black[900] },
  sectionBody: { paddingHorizontal: 16, paddingVertical: 16, gap: 14 },
  sectionSub: { fontSize: 12, color: theme.colors.black[400], lineHeight: 17 },
  label: { fontSize: 13, fontWeight: "600" as const, color: theme.colors.black[500] },
  hint: { fontSize: 11, color: theme.colors.black[400], lineHeight: 15 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.black[900],
    backgroundColor: theme.colors.white,
  },
  inputMultiline: { minHeight: 64, textAlignVertical: "top" as const },
  primaryBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center" as const,
  },
  primaryBtnText: { fontSize: 15, fontWeight: "700" as const, color: theme.colors.white },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: "center" as const,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "700" as const, color: theme.colors.black[900] },
  errorText: { fontSize: 13, color: theme.colors.cinnabar[500] },
};
