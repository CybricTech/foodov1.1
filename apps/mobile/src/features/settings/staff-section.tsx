/**
 * Frontline staff section — RN mirror of the web `StaffManagementSection`.
 *
 * A restaurant may have at most ONE frontline-staff account (the route enforces
 * this). All four operations go through Bearer'd dashboard routes that run
 * Supabase Auth admin calls server-side:
 *   - GET    /api/dashboard/staff               → load the staff account (or none)
 *   - POST   /api/dashboard/staff/create        → create the account
 *   - DELETE /api/dashboard/staff/delete        → remove it (confirmed)
 *   - POST   /api/dashboard/staff/reset-password → set a new password
 *
 * The route re-derives the restaurant from the caller's own profile, so the
 * staff account is always scoped to the owner's restaurant.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import {
  fetchStaff,
  createStaff,
  deleteStaff,
  resetStaffPassword,
  ApiError,
  type StaffUser,
} from "../../lib/api";
import { Users } from "lucide-react-native";

import { theme } from "../../theme";
import { Section, Field, Input, PrimaryButton, SecondaryButton, ErrorText } from "./ui";

const STAFF_SECTION_ICON = (
  <Users size={18} color={theme.colors.brand} strokeWidth={2.25} />
);

export function StaffSection() {
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [showReset, setShowReset] = useState(false);

  // Create form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Reset form
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { staff: s } = await fetchStaff();
        if (alive) setStaff(s);
      } catch {
        // ignore — owner can still create
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function handleCreate() {
    setCreating(true);
    setCreateError("");
    setSuccessMsg("");
    try {
      await createStaff({ email: email.trim(), password, fullName: fullName.trim() });
      const { staff: s } = await fetchStaff();
      setStaff(s);
      setSuccessMsg("Staff account created successfully!");
      setEmail("");
      setPassword("");
      setFullName("");
      setShowCreate(false);
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : "Failed to create staff account.");
    } finally {
      setCreating(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    setResetError("");
    setSuccessMsg("");
    try {
      await resetStaffPassword(newPassword);
      setSuccessMsg("Password updated successfully!");
      setNewPassword("");
      setShowReset(false);
    } catch (e) {
      setResetError(e instanceof ApiError ? e.message : "Failed to reset password.");
    } finally {
      setResetting(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Remove staff account",
      "Delete this staff account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteStaff();
              setStaff(null);
              setShowReset(false);
            } catch (e) {
              Alert.alert(
                "Delete failed",
                e instanceof ApiError ? e.message : "Could not delete the staff account."
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <Section title="Frontline staff" icon={STAFF_SECTION_ICON}>
        <View style={{ paddingVertical: 16, alignItems: "center" }}>
          <ActivityIndicator color={theme.colors.brand} />
        </View>
      </Section>
    );
  }

  return (
    <Section
      title="Frontline staff"
      icon={STAFF_SECTION_ICON}
      subtitle="Create a staff account for your operations team. They'll get a simplified app with just Orders and Menu."
    >
      {successMsg ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{successMsg}</Text>
        </View>
      ) : null}

      {staff ? (
        <View style={{ gap: 12 }}>
          <View style={styles.staffCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(staff.full_name)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.staffName} numberOfLines={1}>
                {staff.full_name}
              </Text>
              <Text style={styles.staffEmail} numberOfLines={1}>
                {staff.email}
              </Text>
            </View>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          </View>

          {showReset ? (
            <View style={{ gap: 10 }}>
              <Field label="New password">
                <Input
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="Minimum 8 characters"
                  autoCapitalize="none"
                />
              </Field>
              {resetError ? <ErrorText>{resetError}</ErrorText> : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label="Update password"
                    onPress={handleReset}
                    busy={resetting}
                    disabled={newPassword.length < 8}
                  />
                </View>
                <SecondaryButton
                  label="Cancel"
                  onPress={() => {
                    setShowReset(false);
                    setResetError("");
                    setNewPassword("");
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <SecondaryButton label="Reset password" onPress={() => setShowReset(true)} />
              <SecondaryButton
                label={deleting ? "Removing…" : "Remove"}
                onPress={confirmDelete}
                busy={deleting}
                destructive
              />
            </View>
          )}
        </View>
      ) : showCreate ? (
        <View style={{ gap: 12 }}>
          <Field label="Full name">
            <Input
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Adamu Ibrahim"
            />
          </Field>
          <Field label="Email address">
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="staff@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </Field>
          <Field label="Password">
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Minimum 8 characters"
              autoCapitalize="none"
            />
          </Field>
          {createError ? <ErrorText>{createError}</ErrorText> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label="Create staff account"
                onPress={handleCreate}
                busy={creating}
                disabled={
                  fullName.trim().length < 2 ||
                  !email.trim() ||
                  password.length < 8
                }
              />
            </View>
            <SecondaryButton
              label="Cancel"
              onPress={() => {
                setShowCreate(false);
                setCreateError("");
              }}
            />
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setShowCreate(true)} style={styles.addBtn}>
          <Text style={styles.addBtnText}>＋ Add staff member</Text>
        </Pressable>
      )}
    </Section>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const styles = {
  successBox: {
    backgroundColor: theme.colors.viridian[100],
    borderWidth: 1,
    borderColor: theme.colors.viridian[500],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  successText: { fontSize: 13, color: theme.colors.viridian[500], fontWeight: "600" as const },
  staffCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    backgroundColor: theme.colors.black[50],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary[50],
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  avatarText: { fontSize: 13, fontWeight: "800" as const, color: theme.colors.brand },
  staffName: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.black[900] },
  staffEmail: { fontSize: 12, color: theme.colors.black[500], marginTop: 1 },
  activeBadge: {
    backgroundColor: theme.colors.viridian[100],
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activeBadgeText: { fontSize: 10, fontWeight: "700" as const, color: theme.colors.viridian[500] },
  addBtn: {
    paddingVertical: 12,
    alignItems: "center" as const,
    borderWidth: 1,
    borderStyle: "dashed" as const,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
  },
  addBtnText: { fontSize: 13, fontWeight: "600" as const, color: theme.colors.black[500] },
};
