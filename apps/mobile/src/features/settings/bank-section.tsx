/**
 * Bank account section — RN mirror of the web settings `BankAccountSection`.
 *
 * Reads the saved bank details via the Bearer'd `/api/merchant/banking` route
 * and, on save, posts the bank code + account number there; the route runs the
 * Monnify name-enquiry and persists the verified account name (mobile never
 * touches Monnify directly). The bank picker list comes from Paystack's public
 * bank API (no auth needed), exactly like web.
 */
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { Banknote } from "lucide-react-native";

import { fetchBanking, saveBanking, ApiError, type BankingInfo } from "../../lib/api";
import { theme } from "../../theme";
import { Section, Field, Input, PrimaryButton, SecondaryButton, ErrorText } from "./ui";

interface PaystackBank {
  id: number;
  name: string;
  code: string;
}

export function BankSection({ restaurantId }: { restaurantId: string }) {
  const [saved, setSaved] = useState<BankingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [banks, setBanks] = useState<PaystackBank[]>([]);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchBanking(restaurantId);
        if (alive) setSaved(data);
      } catch {
        // Non-fatal: the merchant can still add an account.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  async function loadBanks() {
    if (banks.length > 0) return;
    try {
      const res = await fetch(
        "https://api.paystack.co/bank?country=nigeria&perPage=100"
      );
      const data = await res.json();
      if (data.status) setBanks((data.data ?? []) as PaystackBank[]);
    } catch {
      // ignore — merchant can retry
    }
  }

  function openForm() {
    void loadBanks();
    setError("");
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!bankCode || accountNumber.length !== 10) {
      setError("Choose a bank and enter a 10-digit account number.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = await saveBanking(restaurantId, bankCode, accountNumber);
      setSaved(data);
      setShowForm(false);
      setBankCode("");
      setBankName("");
      setAccountNumber("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save bank account.");
    } finally {
      setSaving(false);
    }
  }

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
          {!showForm && (
            <Pressable onPress={openForm} hitSlop={6}>
              <Text style={styles.linkText}>Update bank account</Text>
            </Pressable>
          )}
        </View>
      ) : (
        !showForm && (
          <Pressable onPress={openForm} style={styles.dashedBtn}>
            <Text style={styles.dashedBtnText}>＋ Add bank account</Text>
          </Pressable>
        )
      )}

      {showForm && (
        <View style={{ gap: 12 }}>
          <Field label="Bank">
            <Pressable onPress={() => setBankPickerOpen(true)} style={styles.select}>
              <Text
                style={{
                  fontSize: 14,
                  color: bankName ? theme.colors.black[900] : theme.colors.black[400],
                }}
              >
                {bankName || "Select bank…"}
              </Text>
            </Pressable>
          </Field>
          <Field label="Account number">
            <Input
              value={accountNumber}
              onChangeText={(t) => setAccountNumber(t.replace(/\D/g, "").slice(0, 10))}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="10-digit account number"
            />
          </Field>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label={saving ? "Verifying…" : "Save bank account"}
                onPress={handleSubmit}
                busy={saving}
              />
            </View>
            <SecondaryButton label="Cancel" onPress={() => setShowForm(false)} />
          </View>
        </View>
      )}

      {/* Bank picker */}
      <Modal visible={bankPickerOpen} animationType="slide" transparent onRequestClose={() => setBankPickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Choose your bank</Text>
              <Pressable onPress={() => setBankPickerOpen(false)} hitSlop={8}>
                <Text style={{ fontSize: 16, color: theme.colors.black[400] }}>✕</Text>
              </Pressable>
            </View>
            <ScrollView>
              {banks.map((b) => (
                <Pressable
                  key={b.code}
                  onPress={() => {
                    setBankCode(b.code);
                    setBankName(b.name);
                    setBankPickerOpen(false);
                  }}
                  style={styles.pickerRow}
                >
                  <Text style={{ fontSize: 14, color: theme.colors.black[900] }}>{b.name}</Text>
                </Pressable>
              ))}
              {banks.length === 0 && (
                <Text style={{ padding: 16, color: theme.colors.black[400], fontSize: 13 }}>
                  Loading banks…
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  dashedBtn: {
    paddingVertical: 12,
    alignItems: "center" as const,
    borderWidth: 1,
    borderStyle: "dashed" as const,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
  },
  dashedBtnText: { fontSize: 13, fontWeight: "600" as const, color: theme.colors.black[500] },
  readonlyRow: { backgroundColor: theme.colors.black[50], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  readonlyLabel: { fontSize: 11, fontWeight: "600" as const, color: theme.colors.black[500] },
  readonlyValue: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.black[900], marginTop: 2 },
  select: {
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.colors.white,
  },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(17,17,17,0.5)", justifyContent: "flex-end" as const },
  pickerSheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%" as const,
  },
  pickerHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.black[100],
  },
  pickerTitle: { fontSize: 16, fontWeight: "800" as const, color: theme.colors.black[900] },
  pickerRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.black[50],
  },
};
