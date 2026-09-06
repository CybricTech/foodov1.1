import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatKobo, pricePaymentLinkItems, type MerchantPaymentLinksData, type PaymentLinkLine, type PaymentLinkMenuItem } from "@foodo/utils";
import { ScreenHeader } from "../../components/screen-header";
import { cancelPaymentLink, createPaymentLink, fetchPaymentLinks } from "../../lib/api";
import { theme } from "../../theme";

const labels = { awaiting_payment: "Awaiting payment", payment_started: "Payment started", payment_failed: "Payment failed", paid: "Paid", cancelled: "Cancelled", expired: "Expired" };
/** Still usable: the customer can pay (or pay again) and staff can still cancel. */
const isOpen = (status: keyof typeof labels) => status === "awaiting_payment" || status === "payment_failed";
const message = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
export function PaymentLinksScreen() {
  const [data, setData] = useState<MerchantPaymentLinksData | null>(null);
  const [creating, setCreating] = useState(false);
  const [lines, setLines] = useState<PaymentLinkLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PaymentLinkMenuItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const requestKey = useRef<string | null>(null);
  const submitting = useRef(false);
  const refresh = useCallback(async () => { setData(await fetchPaymentLinks()); }, []);
  useFocusEffect(useCallback(() => {
    void refresh().catch((e) => setError(message(e)));
    const timer = setInterval(() => { void refresh().catch(() => {}); }, 20_000);
    return () => clearInterval(timer);
  }, [refresh]));
  async function create() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    // Non-secret idempotency key: retained on an uncertain response/retry.
    requestKey.current ??= `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await createPaymentLink({ requestKey: requestKey.current, customerName, items: lines });
      requestKey.current = null; setCreating(false); setLines([]); setCustomerName("");
      await refresh();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); submitting.current = false; }
  }
  async function cancel(id: string) {
    setBusy(true); setError("");
    try { await cancelPaymentLink(id); await refresh(); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  return <View style={styles.screen}>
    <ScreenHeader title="Payment links" subtitle="Prepare an order and share its checkout" onBack={() => creating ? setCreating(false) : router.back()} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); try { await refresh(); } catch (e) { setError(message(e)); } finally { setRefreshing(false); } }} />}>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!data && <ActivityIndicator color={theme.colors.brand} />}
      {!creating && <Action label="+ Create order" onPress={() => { setCreating(true); setError(""); }} />}
      {creating && data && <>
        <View style={styles.card}><Text style={styles.heading}>Who is this for?</Text><TextInput accessibilityLabel="Customer name (optional)" placeholder="Customer name (optional)" maxLength={100} editable={!busy} value={customerName} onChangeText={(text) => { setCustomerName(text); requestKey.current = null; }} style={styles.input} />
          <Text style={styles.caption}>They’ll confirm their contact details and choose delivery or pickup at checkout.</Text></View>
        <View style={styles.card}><Text style={styles.heading}>Choose meals</Text><TextInput accessibilityLabel="Search menu" placeholder="Search your menu" value={search} onChangeText={setSearch} style={styles.input} />
          {data.menu.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).map((item) => <Pressable key={item.id} disabled={busy} onPress={() => setSelected(item)} style={styles.row}><View style={{ flex: 1 }}><Text style={styles.bold}>{item.name}</Text><Text style={styles.caption}>{formatKobo(item.price_kobo)}</Text></View><Text style={styles.link}>+ Add</Text></Pressable>)}
          {!data.menu.length && <Text style={styles.caption}>Make a menu item available to create an order.</Text>}
        </View>
        <View style={styles.card}><Text style={styles.heading}>Prepared order</Text>{!lines.length && <Text style={styles.caption}>Add meals from your menu.</Text>}
          {lines.map((line, index) => <View key={index} style={styles.row}><View style={{ flex: 1 }}><Text style={styles.bold}>{line.quantity} × {line.name}</Text>{line.selectedOptions.flatMap((option) => option.choices).map((choice) => <Text key={choice.choiceId} style={styles.caption}>{choice.quantity} × {choice.choiceName}</Text>)}{!!line.specialRequest && <Text style={styles.caption}>Note: {line.specialRequest}</Text>}<Text>{formatKobo(line.priceKobo * line.quantity)}</Text></View><Pressable disabled={busy} accessibilityLabel={`Remove ${line.name}`} onPress={() => { setLines((prev) => prev.filter((_, i) => i !== index)); requestKey.current = null; }} style={{ padding: 10 }}><Text style={styles.link}>Remove</Text></Pressable></View>)}
          <Text style={styles.heading}>Food subtotal: {formatKobo(lines.reduce((sum, line) => sum + line.priceKobo * line.quantity, 0))}</Text><Text style={styles.caption}>Delivery, fees and eligible discounts are calculated at checkout. Links expire in 24 hours. Stock is checked when the customer pays.</Text><Action label={busy ? "Creating link…" : "Create payment link"} disabled={busy || !lines.length} onPress={create} />
        </View>
      </>}
      {!creating && data && <>
        {!data.links.length && <View style={styles.card}><Text style={styles.heading}>Turn a conversation into an order</Text><Text style={styles.caption}>Choose what the customer asked for and share their checkout link. Only paid orders appear in your kitchen queue.</Text></View>}
        {data.links.map((link) => <View key={link.id} style={styles.card}><View style={styles.row}><Text style={[styles.heading, { flex: 1 }]}>{link.customerName || "Prepared order"}</Text><Text style={styles.link}>{labels[link.status]}</Text></View><Text style={styles.caption}>{link.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}</Text><Text style={styles.bold}>{formatKobo(link.subtotalKobo)} food subtotal</Text><Text style={styles.caption}>Created {new Date(link.createdAt).toLocaleString()}</Text>
          {link.status === "payment_failed" && <Text style={styles.caption}>The customer’s last payment was declined. The same link still works — they can try again.</Text>}
          {isOpen(link.status) && <><Text selectable style={styles.caption}>{link.url}</Text><Action label="Share payment link" onPress={() => { void Share.share({ message: `Your order from ${data.restaurant.name} is ready to review. Confirm your details and pay here: ${link.url}` }).catch((e) => setError(message(e))); }} /><Pressable disabled={busy} onPress={() => Alert.alert("Cancel payment link?", "The customer will no longer be able to start payment with this link.", [{ text: "Keep link", style: "cancel" }, { text: "Cancel link", style: "destructive", onPress: () => { void cancel(link.id); } }])} style={{ padding: 10 }}><Text style={{ textAlign: "center", color: theme.colors.cinnabar[500] }}>Cancel link</Text></Pressable></>}
          {link.status === "payment_started" && <Text style={styles.caption}>Checkout has started. Reopening the link resumes the same payment.</Text>}
        </View>)}
      </>}
    </ScrollView>
    {selected && <MealEditor item={selected} onClose={() => setSelected(null)} onAdd={(line) => { setLines((prev) => [...prev, line]); requestKey.current = null; setSelected(null); }} />}
  </View>;
}

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, disabled && { opacity: 0.4 }]}><Text style={{ color: "white", fontWeight: "700", textAlign: "center" }}>{label}</Text></Pressable>;
}
function MealEditor({ item, onClose, onAdd }: { item: PaymentLinkMenuItem; onClose: () => void; onAdd: (line: PaymentLinkLine) => void }) {
  const [quantity, setQuantity] = useState(1);
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  function add() {
    try {
      const [line] = pricePaymentLinkItems([{ menuItemId: item.id, quantity, specialRequest: note, selectedOptions: (item.options ?? []).map((option) => ({ optionId: option.id, choices: option.choices.filter((choice) => choices[choice.id] > 0).map((choice) => ({ choiceId: choice.id, quantity: choices[choice.id] })) })) }], [item]);
      onAdd(line);
    } catch (e) { setError(message(e)); }
  }
  return <Modal animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}><View style={styles.row}><Text style={[styles.heading, { flex: 1 }]}>{item.name}</Text><Pressable onPress={onClose} style={{ padding: 10 }}><Text style={styles.link}>Close</Text></Pressable></View><Text>{formatKobo(item.price_kobo)}</Text>
    {(item.options ?? []).map((option) => <View key={option.id} style={styles.card}><Text style={styles.bold}>{option.name}</Text><Text style={styles.caption}>Choose at least {option.min_selections}{option.max_selections ? `, up to ${option.max_selections}` : ""}</Text>{option.choices.map((choice) => <View key={choice.id} style={styles.row}><View style={{ flex: 1 }}><Text>{choice.name}</Text><Text style={styles.caption}>{choice.price_modifier_kobo ? `+${formatKobo(choice.price_modifier_kobo)}` : "Included"}</Text></View>{option.max_selections === 1 ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: choices[choice.id] === 1 }} onPress={() => setChoices((prev) => ({ ...prev, ...Object.fromEntries(option.choices.map((c) => [c.id, c.id === choice.id && !prev[c.id] ? 1 : 0])) }))} style={{ padding: 12 }}><Text style={styles.link}>{choices[choice.id] ? "Selected ✓" : "Select"}</Text></Pressable> : <Counter label={choice.name} value={choices[choice.id] ?? 0} max={20} min={0} onChange={(value) => setChoices((prev) => ({ ...prev, [choice.id]: value }))} />}</View>)}</View>)}
    <View style={styles.row}><Text style={styles.bold}>Quantity</Text><Counter label={item.name} value={quantity} min={1} max={99} onChange={setQuantity} /></View><TextInput accessibilityLabel="Special request" placeholder="Special request, e.g. no onions" maxLength={300} multiline value={note} onChangeText={setNote} style={styles.input} />{!!error && <Text style={styles.error}>{error}</Text>}<Action label="Add to order" onPress={add} />
  </ScrollView></SafeAreaView></Modal>;
}
function Counter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Pressable accessibilityLabel={`Decrease ${label}`} disabled={value <= min} onPress={() => onChange(value - 1)} style={{ padding: 12 }}><Text style={styles.link}>−</Text></Pressable><Text>{value}</Text><Pressable accessibilityLabel={`Increase ${label}`} disabled={value >= max} onPress={() => onChange(value + 1)} style={{ padding: 12 }}><Text style={styles.link}>+</Text></Pressable></View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.black[50] },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  card: { backgroundColor: "white", borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: theme.colors.black[100] },
  heading: { fontSize: 18, fontWeight: "800", color: theme.colors.black[900] },
  bold: { fontSize: 14, fontWeight: "700", color: theme.colors.black[900] },
  caption: { fontSize: 13, lineHeight: 20, color: theme.colors.black[500] },
  input: { backgroundColor: "white", borderWidth: 1, borderColor: theme.colors.black[200], borderRadius: 12, padding: 12, fontSize: 16, color: theme.colors.black[900] },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 6 },
  action: { backgroundColor: theme.colors.brand, padding: 15, borderRadius: 12 },
  link: { fontSize: 13, fontWeight: "700", color: theme.colors.brand },
  error: { color: theme.colors.cinnabar[500], fontSize: 14, padding: 12 },
});
