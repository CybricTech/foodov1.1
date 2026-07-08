/**
 * Owner Settings — RN port of the web `SettingsClient` (full parity).
 *
 * Read components/dashboard/settings-client.tsx for the canonical behaviour.
 * Mirrored here:
 *   - Restaurant profile: name/description/phone/address/city/state/brand colour
 *     + min order + VAT + default logistics mode, saved with ONE `restaurants`
 *     update via the authed `getSupabase()` client (RLS), same columns as web.
 *   - Logo + hero banner upload to the `menu-images` bucket — reuses the
 *     menu-manager image-upload helper (pick → downscale → ArrayBuffer → upload),
 *     banner downscaled to 2000px like web, then the public URL persisted.
 *   - Notifications: order-alert email + WhatsApp number (with the same format
 *     validation as web).
 *   - Social links, "close store" toggle + closure message, and per-day
 *     operating hours (the same `opening_hours` JSON shape web writes).
 *   - Password change via `getSupabase().auth.updateUser({ password })`.
 *   - Bank account, delivery pricing, location and staff are their own sections
 *     (delivery/location/staff/bank go through Bearer'd routes).
 *
 * Money fields are entered/stored in naira → kobo with the same `* 100` web
 * uses; no kobo math is hand-rolled beyond that.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";

import {
  Store,
  Bell,
  Share2,
  ShoppingBag,
  Power,
  Clock,
  Banknote,
  MapPin,
  Lock,
  ImagePlus,
  Bike,
} from "lucide-react-native";

import { router } from "expo-router";

import type { Restaurant } from "@foodo/database";

import { getSupabase } from "../../lib/supabase";
import { ScreenHeader } from "../../components/screen-header";
import { saveDeliveryPricing, saveLocation, ApiError } from "../../lib/api";
import { theme } from "../../theme";
import { pickMenuImage, uploadMenuImage } from "../menu-manager/image-upload";
import {
  Section,
  Field,
  Input,
  PrimaryButton,
  SecondaryButton,
  ErrorText,
} from "./ui";
import { BankSection } from "./bank-section";
import { StaffSection } from "./staff-section";

type DayHours = { enabled: boolean; open: string; close: string };
type OpeningHours = Record<string, DayHours>;

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;

const DEFAULT_HOURS: OpeningHours = Object.fromEntries(
  DAYS.map(({ key }) => [key, { enabled: true, open: "09:00", close: "22:00" }])
);

const WHATSAPP_RE = /^\+[0-9]{9,14}$/;

export function SettingsScreen({ restaurantId }: { restaurantId: string }) {
  const supabase = getSupabase();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [r, setR] = useState<Restaurant | null>(null);

  // Profile
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateField, setStateField] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#7B2CBF");
  const [minOrderNgn, setMinOrderNgn] = useState("");
  const [vatPercentage, setVatPercentage] = useState("");
  const [logisticsDefault, setLogisticsDefault] = useState("platform_rider");
  const [acceptsOrders, setAcceptsOrders] = useState(true);
  const [acceptsDelivery, setAcceptsDelivery] = useState(true);
  const [acceptsPickup, setAcceptsPickup] = useState(true);
  const [fulfillmentHint, setFulfillmentHint] = useState("");
  const [closureMessage, setClosureMessage] = useState("");
  const [openingHours, setOpeningHours] = useState<OpeningHours>(DEFAULT_HOURS);

  // Notifications + social
  const [notificationEmail, setNotificationEmail] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  // Images (committed immediately on pick, like web)
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [imageError, setImageError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Delivery pricing
  const [baseFeeNgn, setBaseFeeNgn] = useState("");
  const [perKmNgn, setPerKmNgn] = useState("");
  const [maxFeeNgn, setMaxFeeNgn] = useState("");
  const [pricingRadius, setPricingRadius] = useState("");
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingSaved, setPricingSaved] = useState(false);
  const [pricingError, setPricingError] = useState("");

  // Location
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locRadius, setLocRadius] = useState("");
  const [locSaving, setLocSaving] = useState(false);
  const [locSaved, setLocSaved] = useState(false);
  const [locError, setLocError] = useState("");
  const [hasLocation, setHasLocation] = useState(false);

  // Password
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const toNgn = (kobo: number | null | undefined) =>
    kobo != null ? String(Math.round(kobo / 100)) : "";

  const load = useCallback(async () => {
    if (!supabase) {
      setLoadError("App is not configured.");
      setLoading(false);
      return;
    }
    setLoadError(null);
    const { data, error: err } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", restaurantId)
      .single();
    if (err || !data) {
      setLoadError(err?.message ?? "Could not load your settings.");
      setLoading(false);
      return;
    }
    const row = data as Restaurant & {
      restaurant_base_fee_kobo?: number | null;
      restaurant_per_km_rate_kobo?: number | null;
      restaurant_max_fee_kobo?: number | null;
    };
    setR(row);
    setName(row.name ?? "");
    setDescription(row.description ?? "");
    setPhone(row.phone ?? "");
    setAddress(row.address ?? "");
    setCity(row.city ?? "");
    setStateField(row.state ?? "");
    setPrimaryColor(row.primary_color ?? "#7B2CBF");
    setMinOrderNgn(row.min_order_amount ? String(row.min_order_amount / 100) : "");
    setVatPercentage(row.vat_percentage != null ? String(row.vat_percentage) : "");
    setLogisticsDefault(row.logistics_default ?? "platform_rider");
    setAcceptsOrders(row.accepts_orders);
    setAcceptsDelivery(row.accepts_delivery ?? true);
    setAcceptsPickup(row.accepts_pickup ?? true);
    setClosureMessage(row.closure_message ?? "");
    setOpeningHours((row.opening_hours as OpeningHours | null) ?? DEFAULT_HOURS);
    setNotificationEmail(row.notification_email ?? "");
    setWhatsappNumber(row.whatsapp_number ?? "");
    setInstagramUrl(row.instagram_url ?? "");
    setFacebookUrl(row.facebook_url ?? "");
    setTwitterUrl(row.twitter_url ?? "");
    setYoutubeUrl(row.youtube_url ?? "");
    setLogoUrl(row.logo_url ?? "");
    setBannerUrl(row.banner_url ?? "");

    setBaseFeeNgn(toNgn(row.restaurant_base_fee_kobo));
    setPerKmNgn(toNgn(row.restaurant_per_km_rate_kobo));
    setMaxFeeNgn(toNgn(row.restaurant_max_fee_kobo));
    setPricingRadius(row.max_delivery_radius_km != null ? String(row.max_delivery_radius_km) : "");

    setHasLocation(row.latitude != null && row.longitude != null);
    setLat(row.latitude != null ? String(row.latitude) : "");
    setLng(row.longitude != null ? String(row.longitude) : "");
    setLocRadius(row.max_delivery_radius_km != null ? String(row.max_delivery_radius_km) : "");

    setLoading(false);
  }, [restaurantId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Image uploads (commit immediately, mirroring web) ────────────────────────
  async function handleImage(kind: "logo" | "banner") {
    if (!supabase) return;
    setImageError("");
    let picked;
    try {
      picked = await pickMenuImage();
    } catch (e) {
      setImageError((e as Error).message ?? "Could not open the photo library.");
      return;
    }
    if (!picked) return;

    const setUploading = kind === "logo" ? setLogoUploading : setBannerUploading;
    setUploading(true);
    try {
      const url = await uploadMenuImage(supabase, restaurantId, picked, {
        prefix: kind === "logo" ? "logo-" : "banner-",
        maxEdge: kind === "banner" ? 2000 : undefined,
      });
      const column = kind === "logo" ? "logo_url" : "banner_url";
      const { error: dbErr } = await supabase
        .from("restaurants")
        .update({ [column]: url })
        .eq("id", restaurantId);
      if (dbErr) {
        setImageError(dbErr.message);
      } else if (kind === "logo") {
        setLogoUrl(url);
      } else {
        setBannerUrl(url);
      }
    } catch (e) {
      setImageError((e as Error).message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(kind: "logo" | "banner") {
    if (!supabase) return;
    const column = kind === "logo" ? "logo_url" : "banner_url";
    const { error: dbErr } = await supabase
      .from("restaurants")
      .update({ [column]: null })
      .eq("id", restaurantId);
    if (dbErr) setImageError(dbErr.message);
    else if (kind === "logo") setLogoUrl("");
    else setBannerUrl("");
  }

  // ── Save the profile (one restaurants update, same columns as web) ───────────
  async function handleSave() {
    if (!supabase) return;
    setSaving(true);
    setError("");
    const { error: updateErr } = await supabase
      .from("restaurants")
      .update({
        name,
        description: description || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: stateField || null,
        primary_color: primaryColor,
        min_order_amount: minOrderNgn ? Math.round(parseFloat(minOrderNgn) * 100) : null,
        vat_percentage: vatPercentage ? parseFloat(vatPercentage) : null,
        logistics_default: logisticsDefault,
        accepts_orders: acceptsOrders,
        accepts_delivery: acceptsDelivery,
        accepts_pickup: acceptsPickup,
        closure_message: closureMessage || null,
        opening_hours: openingHours,
        instagram_url: instagramUrl || null,
        facebook_url: facebookUrl || null,
        twitter_url: twitterUrl || null,
        youtube_url: youtubeUrl || null,
        whatsapp_number: whatsappNumber || null,
        notification_email: notificationEmail || null,
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
      })
      .eq("id", restaurantId);
    setSaving(false);
    if (updateErr) {
      setError(updateErr.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  async function handleSavePricing() {
    setPricingSaving(true);
    setPricingError("");
    try {
      await saveDeliveryPricing({
        restaurant_base_fee_kobo: baseFeeNgn ? Math.round(parseFloat(baseFeeNgn) * 100) : null,
        restaurant_per_km_rate_kobo: perKmNgn ? Math.round(parseFloat(perKmNgn) * 100) : null,
        restaurant_max_fee_kobo: maxFeeNgn ? Math.round(parseFloat(maxFeeNgn) * 100) : null,
        max_delivery_radius_km: pricingRadius ? parseInt(pricingRadius, 10) : null,
      });
      setPricingSaved(true);
      setTimeout(() => setPricingSaved(false), 3000);
    } catch (e) {
      setPricingError(e instanceof ApiError ? e.message : "Failed to save delivery pricing.");
    } finally {
      setPricingSaving(false);
    }
  }

  async function handleSaveLocation() {
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      setLocError("Enter valid latitude and longitude values.");
      return;
    }
    setLocSaving(true);
    setLocError("");
    try {
      await saveLocation({
        latitude: parsedLat,
        longitude: parsedLng,
        max_delivery_radius_km: locRadius ? parseInt(locRadius, 10) : null,
      });
      setHasLocation(true);
      setLocSaved(true);
      setTimeout(() => setLocSaved(false), 3000);
    } catch (e) {
      setLocError(e instanceof ApiError ? e.message : "Failed to save location.");
    } finally {
      setLocSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!supabase) return;
    if (pw1.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    if (pw1 !== pw2) {
      setPwError("Passwords do not match.");
      return;
    }
    setPwSaving(true);
    setPwError("");
    setPwSuccess("");
    const { error: pwErr } = await supabase.auth.updateUser({ password: pw1 });
    setPwSaving(false);
    if (pwErr) {
      setPwError(pwErr.message);
    } else {
      setPwSuccess("Password updated successfully.");
      setPw1("");
      setPw2("");
      setTimeout(() => setPwSuccess(""), 4000);
    }
  }

  const pricingPreview = useMemo(() => {
    const base = parseFloat(baseFeeNgn) || 0;
    const rate = parseFloat(perKmNgn) || 0;
    const cap = parseFloat(maxFeeNgn) || 999999;
    const fee = (km: number) => Math.round(Math.min(base + km * rate, cap));
    return `3km → ₦${fee(3).toLocaleString()}  ·  7km → ₦${fee(7).toLocaleString()}  ·  15km → ₦${fee(15).toLocaleString()}`;
  }, [baseFeeNgn, perKmNgn, maxFeeNgn]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.brand} size="large" />
      </View>
    );
  }

  if (loadError || !r) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 14, color: theme.colors.cinnabar[500], textAlign: "center" }}>
          {loadError ?? "Could not load your settings."}
        </Text>
        <Pressable
          onPress={() => {
            setLoading(true);
            void load();
          }}
          style={styles.retryBtn}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const whatsappValid = !whatsappNumber || WHATSAPP_RE.test(whatsappNumber);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.black[50] }}>
      <ScreenHeader title="Settings" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Restaurant profile */}
        <Section
          title="Restaurant profile"
          icon={<Store size={18} color={theme.colors.brand} strokeWidth={2.25} />}
        >
          <Field label="Restaurant name">
            <Input value={name} onChangeText={setName} />
          </Field>
          <Field label="Description">
            <Input value={description} onChangeText={setDescription} multiline />
          </Field>
          <Field label="Phone">
            <Input
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+2348012345678"
            />
          </Field>
          <Field label="Address" hint="Street address shown on your storefront">
            <Input value={address} onChangeText={setAddress} multiline placeholder="e.g. 14 Adeola Hopewell Street, Maitama" />
          </Field>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="City">
                <Input value={city} onChangeText={setCity} placeholder="e.g. Abuja" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="State">
                <Input value={stateField} onChangeText={setStateField} placeholder="e.g. FCT" />
              </Field>
            </View>
          </View>
          <Field label="Brand colour" hint="Hex value, e.g. #7B2CBF">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.black[200],
                  backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(primaryColor)
                    ? primaryColor
                    : theme.colors.black[100],
                }}
              />
              <Input
                value={primaryColor}
                onChangeText={setPrimaryColor}
                autoCapitalize="characters"
                style={{ flex: 1 }}
              />
            </View>
          </Field>

          {/* Logo */}
          <Field label="Store logo" hint="Recommended square, e.g. 500x500">
            {logoUrl ? (
              <View style={{ gap: 8 }}>
                <Image source={{ uri: logoUrl }} style={styles.logoPreview} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <SecondaryButton
                    label={logoUploading ? "Uploading…" : "Replace logo"}
                    onPress={() => handleImage("logo")}
                    busy={logoUploading}
                  />
                  <SecondaryButton label="Remove" onPress={() => removeImage("logo")} destructive />
                </View>
              </View>
            ) : (
              <Pressable onPress={() => handleImage("logo")} style={styles.uploadBox} disabled={logoUploading}>
                <ImagePlus size={24} color={theme.colors.black[400]} strokeWidth={1.75} />
                <Text style={styles.uploadHint}>{logoUploading ? "Uploading…" : "Upload store logo"}</Text>
                <Text style={styles.uploadSub}>JPG, PNG or WebP</Text>
              </Pressable>
            )}
          </Field>

          {/* Banner */}
          <Field label="Hero photo">
            {bannerUrl ? (
              <View style={{ gap: 8 }}>
                <Image source={{ uri: bannerUrl }} style={styles.bannerPreview} resizeMode="cover" />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <SecondaryButton
                      label={bannerUploading ? "Uploading…" : "Replace photo"}
                      onPress={() => handleImage("banner")}
                      busy={bannerUploading}
                    />
                  </View>
                  <SecondaryButton label="Remove" onPress={() => removeImage("banner")} destructive />
                </View>
              </View>
            ) : (
              <Pressable onPress={() => handleImage("banner")} style={styles.uploadBox} disabled={bannerUploading}>
                <ImagePlus size={24} color={theme.colors.black[400]} strokeWidth={1.75} />
                <Text style={styles.uploadHint}>{bannerUploading ? "Uploading…" : "Upload hero photo"}</Text>
                <Text style={styles.uploadSub}>JPG, PNG or WebP</Text>
              </Pressable>
            )}
          </Field>
          {imageError ? <ErrorText>{imageError}</ErrorText> : null}
        </Section>

        {/* Notifications */}
        <Section
          title="Notifications"
          icon={<Bell size={18} color={theme.colors.brand} strokeWidth={2.25} />}
        >
          <Field
            label="Order alert email"
            hint="New order alerts will be sent to this email address"
          >
            <Input
              value={notificationEmail}
              onChangeText={setNotificationEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="orders@yourrestaurant.com"
            />
          </Field>
          <Field
            label="WhatsApp alert number"
            hint="International format, e.g. +2348012345678. Leave blank to receive alerts via SMS."
          >
            <Input
              value={whatsappNumber}
              onChangeText={setWhatsappNumber}
              keyboardType="phone-pad"
              placeholder="+2348012345678"
              style={!whatsappValid ? { borderColor: theme.colors.cinnabar[500] } : undefined}
            />
            {!whatsappValid && (
              <ErrorText>Invalid format — start with + then 10-15 digits.</ErrorText>
            )}
          </Field>
        </Section>

        {/* Social */}
        <Section
          title="Social media"
          icon={<Share2 size={18} color={theme.colors.brand} strokeWidth={2.25} />}
        >
          <Field label="Instagram">
            <Input value={instagramUrl} onChangeText={setInstagramUrl} autoCapitalize="none" placeholder="https://instagram.com/yourhandle" />
          </Field>
          <Field label="Facebook">
            <Input value={facebookUrl} onChangeText={setFacebookUrl} autoCapitalize="none" placeholder="https://facebook.com/yourpage" />
          </Field>
          <Field label="Twitter / X">
            <Input value={twitterUrl} onChangeText={setTwitterUrl} autoCapitalize="none" placeholder="https://x.com/yourhandle" />
          </Field>
          <Field label="YouTube">
            <Input value={youtubeUrl} onChangeText={setYoutubeUrl} autoCapitalize="none" placeholder="https://youtube.com/@yourchannel" />
          </Field>
        </Section>

        {/* Ordering */}
        <Section
          title="Ordering"
          icon={<ShoppingBag size={18} color={theme.colors.brand} strokeWidth={2.25} />}
        >
          <Field label="Minimum order (₦)">
            <Input value={minOrderNgn} onChangeText={setMinOrderNgn} keyboardType="numeric" placeholder="0" />
          </Field>
          <Field label="VAT (%)" hint="Applied to the order subtotal. Leave blank if you don't charge VAT.">
            <Input value={vatPercentage} onChangeText={setVatPercentage} keyboardType="numeric" placeholder="e.g. 7.5" />
          </Field>
          <Field label="Default logistics mode">
            <View style={{ gap: 8 }}>
              {(
                [
                  { value: "platform_rider", label: "Platform Rider" },
                  { value: "own_rider", label: "Own Rider" },
                  { value: "third_party", label: "Third-Party (Kwik etc.)" },
                ] as const
              ).map((opt) => (
                <RadioRow
                  key={opt.value}
                  label={opt.label}
                  selected={logisticsDefault === opt.value}
                  onPress={() => setLogisticsDefault(opt.value)}
                />
              ))}
            </View>
          </Field>
        </Section>

        {/* Fulfillment methods */}
        <Section
          title="Fulfillment methods"
          icon={<Bike size={18} color={theme.colors.brand} strokeWidth={2.25} />}
          subtitle="Choose how customers can receive orders. At least one method must stay on."
        >
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Delivery</Text>
              <Text style={styles.toggleSub}>Customers can order for delivery</Text>
            </View>
            <Switch
              value={acceptsDelivery}
              onValueChange={(v) => {
                if (!v && !acceptsPickup) {
                  setFulfillmentHint("At least one method must stay on");
                  return;
                }
                setFulfillmentHint("");
                setAcceptsDelivery(v);
              }}
              trackColor={{ false: theme.colors.black[200], true: theme.colors.brand }}
              thumbColor={theme.colors.white}
            />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Pickup</Text>
              <Text style={styles.toggleSub}>Customers can collect orders themselves</Text>
            </View>
            <Switch
              value={acceptsPickup}
              onValueChange={(v) => {
                if (!v && !acceptsDelivery) {
                  setFulfillmentHint("At least one method must stay on");
                  return;
                }
                setFulfillmentHint("");
                setAcceptsPickup(v);
              }}
              trackColor={{ false: theme.colors.black[200], true: theme.colors.brand }}
              thumbColor={theme.colors.white}
            />
          </View>
          {fulfillmentHint ? <ErrorText>{fulfillmentHint}</ErrorText> : null}
        </Section>

        {/* Close store */}
        <Section
          title="Close store"
          icon={<Power size={18} color={theme.colors.brand} strokeWidth={2.25} />}
          subtitle="Manually close the store at any time — separate from operating hours. Use it for unexpected closures, breaks or holidays."
        >
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Store is open</Text>
              <Text style={styles.toggleSub}>Toggle off to close the store immediately</Text>
            </View>
            <Switch
              value={acceptsOrders}
              onValueChange={setAcceptsOrders}
              trackColor={{ false: theme.colors.black[200], true: theme.colors.brand }}
              thumbColor={theme.colors.white}
            />
          </View>
          <Field label="Closure message" hint="Shown to customers when the store is manually closed. Leave blank for the default.">
            <Input
              value={closureMessage}
              onChangeText={setClosureMessage}
              multiline
              maxLength={200}
              placeholder="e.g. We're taking a short break — back tomorrow at noon!"
            />
          </Field>
        </Section>

        {/* Operating hours */}
        <Section
          title="Operating hours"
          icon={<Clock size={18} color={theme.colors.brand} strokeWidth={2.25} />}
          subtitle="Customers see a closed notice outside these hours. Disabled days are closed all day."
        >
          {DAYS.map(({ key, label }) => {
            const day = openingHours[key] ?? { enabled: true, open: "09:00", close: "22:00" };
            return (
              <View key={key} style={styles.dayRow}>
                <Switch
                  value={day.enabled}
                  onValueChange={(v) =>
                    setOpeningHours((prev) => ({ ...prev, [key]: { ...day, enabled: v } }))
                  }
                  trackColor={{ false: theme.colors.black[200], true: theme.colors.brand }}
                  thumbColor={theme.colors.white}
                />
                <Text
                  style={[
                    styles.dayLabel,
                    !day.enabled && { color: theme.colors.black[400] },
                  ]}
                >
                  {label}
                </Text>
                {day.enabled ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                    <Input
                      value={day.open}
                      onChangeText={(t) =>
                        setOpeningHours((prev) => ({ ...prev, [key]: { ...day, open: t } }))
                      }
                      placeholder="09:00"
                      style={{ flex: 1, paddingVertical: 8, textAlign: "center" }}
                    />
                    <Text style={{ fontSize: 12, color: theme.colors.black[400] }}>to</Text>
                    <Input
                      value={day.close}
                      onChangeText={(t) =>
                        setOpeningHours((prev) => ({ ...prev, [key]: { ...day, close: t } }))
                      }
                      placeholder="22:00"
                      style={{ flex: 1, paddingVertical: 8, textAlign: "center" }}
                    />
                  </View>
                ) : (
                  <Text style={{ flex: 1, fontSize: 12, color: theme.colors.black[400], fontStyle: "italic" }}>
                    Closed
                  </Text>
                )}
              </View>
            );
          })}
        </Section>

        {/* Save profile */}
        <PrimaryButton
          label={saved ? "✓ Saved!" : "Save changes"}
          onPress={handleSave}
          busy={saving}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}

        {/* Bank account */}
        <BankSection restaurantId={restaurantId} />

        {/* Delivery pricing */}
        <Section
          title="Delivery pricing"
          icon={<Banknote size={18} color={theme.colors.brand} strokeWidth={2.25} />}
          subtitle="Leave blank to use the platform default. Formula: base fee + (distance × per-km rate), capped at the max fee."
        >
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Base fee (₦)">
                <Input value={baseFeeNgn} onChangeText={setBaseFeeNgn} keyboardType="numeric" placeholder="Default" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Per km (₦/km)">
                <Input value={perKmNgn} onChangeText={setPerKmNgn} keyboardType="numeric" placeholder="Default" />
              </Field>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Max fee cap (₦)">
                <Input value={maxFeeNgn} onChangeText={setMaxFeeNgn} keyboardType="numeric" placeholder="Default" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Max radius (km)">
                <Input value={pricingRadius} onChangeText={setPricingRadius} keyboardType="numeric" placeholder="Default" />
              </Field>
            </View>
          </View>
          {(baseFeeNgn || perKmNgn) ? (
            <View style={styles.previewBox}>
              <Text style={styles.previewText}>{pricingPreview}</Text>
            </View>
          ) : null}
          {pricingError ? <ErrorText>{pricingError}</ErrorText> : null}
          <PrimaryButton
            label={pricingSaved ? "Saved!" : "Save delivery pricing"}
            onPress={handleSavePricing}
            busy={pricingSaving}
          />
        </Section>

        {/* Location */}
        <Section
          title="Restaurant location"
          icon={<MapPin size={18} color={theme.colors.brand} strokeWidth={2.25} />}
          subtitle="Set your coordinates accurately — used to calculate delivery fees. In Google Maps, long-press your location and copy the numbers."
        >
          {hasLocation && (
            <View style={styles.locSetRow}>
              <View style={styles.locDot} />
              <Text style={{ fontSize: 12, color: theme.colors.black[500] }}>
                Location set: {lat}, {lng}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Latitude">
                <Input value={lat} onChangeText={setLat} keyboardType="numeric" placeholder="e.g. 9.0579" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Longitude">
                <Input value={lng} onChangeText={setLng} keyboardType="numeric" placeholder="e.g. 7.4951" />
              </Field>
            </View>
          </View>
          <Field label="Max delivery radius (km)" hint="Orders beyond this distance are rejected. Leave blank for the platform default.">
            <Input value={locRadius} onChangeText={setLocRadius} keyboardType="numeric" placeholder="e.g. 15" />
          </Field>
          {locError ? <ErrorText>{locError}</ErrorText> : null}
          <PrimaryButton
            label={locSaved ? "Saved!" : "Save location"}
            onPress={handleSaveLocation}
            busy={locSaving}
          />
        </Section>

        {/* Staff */}
        <StaffSection />

        {/* Password */}
        <Section
          title="Change password"
          icon={<Lock size={18} color={theme.colors.brand} strokeWidth={2.25} />}
        >
          {pwSuccess ? (
            <View style={styles.pwSuccessBox}>
              <Text style={styles.pwSuccessText}>{pwSuccess}</Text>
            </View>
          ) : null}
          <Field label="New password">
            <Input value={pw1} onChangeText={setPw1} secureTextEntry autoCapitalize="none" placeholder="Minimum 8 characters" />
          </Field>
          <Field label="Confirm new password">
            <Input value={pw2} onChangeText={setPw2} secureTextEntry autoCapitalize="none" placeholder="Re-enter password" />
          </Field>
          {pwError ? <ErrorText>{pwError}</ErrorText> : null}
          <PrimaryButton label="Update password" onPress={handleChangePassword} busy={pwSaving} />
        </Section>
      </ScrollView>
    </View>
  );
}

function RadioRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.radioRow,
        selected && { borderColor: theme.colors.brand, backgroundColor: theme.colors.primary[50] },
      ]}
    >
      <View style={[styles.radioDot, selected && { borderColor: theme.colors.brand }]}>
        {selected && <View style={styles.radioDotInner} />}
      </View>
      <Text style={[styles.radioLabel, selected && { color: theme.colors.brand, fontWeight: "700" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = {
  retryBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { fontSize: 13, fontWeight: "700" as const, color: theme.colors.black[500] },
  uploadBox: {
    borderWidth: 2,
    borderColor: theme.colors.black[200],
    borderStyle: "dashed" as const,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 4,
    paddingVertical: 24,
  },
  uploadHint: { fontSize: 14, fontWeight: "600" as const, color: theme.colors.black[500] },
  uploadSub: { fontSize: 11, color: theme.colors.black[400] },
  logoPreview: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: theme.colors.black[100],
    backgroundColor: theme.colors.black[100],
  },
  bannerPreview: {
    width: "100%" as const,
    aspectRatio: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.black[100],
    backgroundColor: theme.colors.black[100],
  },
  toggleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingBottom: 4,
  },
  toggleTitle: { fontSize: 14, fontWeight: "600" as const, color: theme.colors.black[900] },
  toggleSub: { fontSize: 12, color: theme.colors.black[400], marginTop: 1 },
  dayRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
  dayLabel: { width: 78, fontSize: 13, fontWeight: "600" as const, color: theme.colors.black[900] },
  previewBox: { backgroundColor: theme.colors.black[50], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  previewText: { fontSize: 12, color: theme.colors.black[500] },
  locSetRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: theme.colors.black[50],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  locDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.viridian[500] },
  radioRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: theme.colors.black[400],
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  radioDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.brand },
  radioLabel: { fontSize: 14, color: theme.colors.black[900] },
  pwSuccessBox: {
    backgroundColor: theme.colors.viridian[100],
    borderWidth: 1,
    borderColor: theme.colors.viridian[500],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pwSuccessText: { fontSize: 13, color: theme.colors.viridian[500], fontWeight: "600" as const },
};
