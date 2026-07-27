"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/images";
import { cn } from "@foodo/ui";
import { ImagePlus, UserPlus, Trash2, KeyRound, Eye, EyeOff, ExternalLink, Plus, X } from "lucide-react";
import type { Restaurant } from "@foodo/database";
import { FocalPointPicker, type FocalPoint } from "./focal-point-picker";
import {
  normalizeSchedulingSettings,
  SCHEDULING_DEFAULTS,
  type SchedulingSettings,
  type PausedRange,
} from "@foodo/utils";

// Nigerian bank list fetched from Paystack (cached in component state)
type PaystackBank = { id: number; name: string; code: string };

export type MerchantAgreementRow = {
  id: string;
  status: string;
  legal_name: string | null;
  merchant_signed_at: string | null;
  countersigned_at: string | null;
  final_pdf_path: string | null;
  created_at: string;
};

const AGREEMENT_STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: "Preparing", className: "bg-black-100 text-black-500" },
  sent: { label: "Awaiting your signature", className: "bg-purple-100 text-purple-600" },
  merchant_signed: { label: "Awaiting Kitchyn countersignature", className: "bg-dixie-100 text-dixie-600" },
  completed: { label: "Signed", className: "bg-viridian-100 text-viridian-600" },
  declined: { label: "Declined", className: "bg-cinnabar-100 text-cinnabar-600" },
  expired: { label: "Expired — contact Kitchyn", className: "bg-black-100 text-black-400" },
  voided: { label: "Voided — contact Kitchyn", className: "bg-black-100 text-black-400" },
};

function AgreementSection({ agreement }: { agreement: MerchantAgreementRow | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleReviewAndSign() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/merchant/agreement");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load signing link");
      } else if (data.sign_url) {
        window.open(data.sign_url, "_blank", "noopener,noreferrer");
      } else {
        setError("Signing link isn't ready yet — try again shortly.");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  if (!agreement) {
    return (
      <Section title="Merchant agreement">
        <p className="text-sm text-black-400">
          Kitchyn hasn&rsquo;t sent your Merchant Agreement yet — you&rsquo;ll see it here as soon as it&rsquo;s ready to sign.
        </p>
      </Section>
    );
  }

  const meta = AGREEMENT_STATUS_META[agreement.status] ?? AGREEMENT_STATUS_META.draft;

  return (
    <Section title="Merchant agreement">
      <div className="space-y-3">
        <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", meta.className)}>
          {meta.label}
        </span>

        {error && <p className="text-xs text-cinnabar-500">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {agreement.status === "sent" && (
            <button
              type="button"
              onClick={handleReviewAndSign}
              disabled={loading}
              className="text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
            >
              {loading ? "Loading…" : "Review & sign"}
            </button>
          )}
          {agreement.status === "completed" && agreement.final_pdf_path && (
            <a
              href="/api/merchant/agreement/file"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-purple-500 hover:underline"
            >
              View signed agreement
            </a>
          )}
        </div>
      </div>
    </Section>
  );
}

function BankAccountSection({ restaurantId, initialData }: {
  restaurantId: string;
  initialData: {
    bank_code: string | null;
    bank_account_number: string | null;
    bank_account_name: string | null;
    paystack_recipient_code: string | null;
    monnify_bank_verified_at?: string | null;
  } | null;
}) {
  const [banks, setBanks] = useState<PaystackBank[]>([]);
  const [banksLoaded, setBanksLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(initialData);

  async function loadBanks() {
    if (banksLoaded) return;
    try {
      const res = await fetch("https://api.paystack.co/bank?country=nigeria&perPage=100");
      const data = await res.json();
      if (data.status) setBanks(data.data ?? []);
    } catch {
      // ignore
    }
    setBanksLoaded(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/merchant/banking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurant_id: restaurantId, bank_code: bankCode, account_number: accountNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save bank account");
      } else {
        setSaved(data);
        setShowForm(false);
        setBankCode("");
        setAccountNumber("");
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  return (
    <Section title="Bank account">
      {saved?.bank_account_name ? (
        <div className="space-y-3">
          <div className="bg-black-50 rounded-xl px-4 py-3">
            <p className="text-xs text-black-500 font-medium">Account name</p>
            <p className="text-sm font-semibold text-black-900 mt-0.5">{saved.bank_account_name}</p>
          </div>
          <div className="bg-black-50 rounded-xl px-4 py-3">
            <p className="text-xs text-black-500 font-medium">Account number</p>
            <p className="text-sm font-semibold text-black-900 mt-0.5">{saved.bank_account_number}</p>
          </div>
          {(saved.paystack_recipient_code || saved.monnify_bank_verified_at) && (
            <p className="text-xs text-viridian-500">
              Verified — ready for automatic settlement
            </p>
          )}
          <button
            type="button"
            onClick={() => { loadBanks(); setShowForm(true); }}
            className="text-sm text-purple-500 font-medium hover:underline"
          >
            Update bank account
          </button>
        </div>
      ) : (
        !showForm && (
          <button
            type="button"
            onClick={() => { loadBanks(); setShowForm(true); }}
            className="w-full py-2.5 rounded-xl border border-dashed border-black-200 text-sm text-black-500 hover:border-purple-500 hover:text-purple-500 transition-colors"
          >
            + Add bank account
          </button>
        )
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">Bank</label>
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              required
              className={cn(inputCls, "bg-white")}
            >
              <option value="">Select bank…</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">Account number</label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
              required
              maxLength={10}
              pattern="\d{10}"
              placeholder="10-digit account number"
              className={inputCls}
            />
          </div>
          {error && <p className="text-xs text-cinnabar-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              {saving ? "Verifying…" : "Save bank account"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 rounded-xl border border-black-200 text-sm text-black-500 hover:bg-black-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Section>
  );
}

function RestaurantDeliveryPricingSection({
  initialBaseFeeKobo,
  initialPerKmRateKobo,
  initialMaxFeeKobo,
  initialMaxRadiusKm,
}: {
  initialBaseFeeKobo: number | null;
  initialPerKmRateKobo: number | null;
  initialMaxFeeKobo: number | null;
  initialMaxRadiusKm: number | null;
}) {
  const toNgn = (kobo: number | null) => (kobo != null ? String(Math.round(kobo / 100)) : "");

  const [baseFeeNgn, setBaseFeeNgn] = useState(toNgn(initialBaseFeeKobo));
  const [perKmNgn, setPerKmNgn] = useState(toNgn(initialPerKmRateKobo));
  const [maxFeeNgn, setMaxFeeNgn] = useState(toNgn(initialMaxFeeKobo));
  const [maxRadius, setMaxRadius] = useState(initialMaxRadiusKm != null ? String(initialMaxRadiusKm) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function previewFee(km: number): string {
    const base = parseFloat(baseFeeNgn) || 0;
    const rate = parseFloat(perKmNgn) || 0;
    const cap = parseFloat(maxFeeNgn) || 999999;
    const fee = Math.min(base + km * rate, cap);
    return `₦${fee.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/merchant/delivery-pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_base_fee_kobo: baseFeeNgn ? Math.round(parseFloat(baseFeeNgn) * 100) : null,
          restaurant_per_km_rate_kobo: perKmNgn ? Math.round(parseFloat(perKmNgn) * 100) : null,
          restaurant_max_fee_kobo: maxFeeNgn ? Math.round(parseFloat(maxFeeNgn) * 100) : null,
          max_delivery_radius_km: maxRadius ? parseInt(maxRadius) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save delivery pricing");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  return (
    <Section title="Delivery pricing">
      <p className="text-xs text-black-400">
        Set your own delivery pricing. Leave fields blank to use the platform default.
        Formula: Base fee + (distance × per-km rate), capped at max fee.
      </p>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-black-500 mb-1">Base fee (₦)</label>
            <input
              type="number"
              step="1"
              min="0"
              value={baseFeeNgn}
              onChange={(e) => setBaseFeeNgn(e.target.value)}
              placeholder="Platform default"
              className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-black-500 mb-1">Per km rate (₦/km)</label>
            <input
              type="number"
              step="1"
              min="0"
              value={perKmNgn}
              onChange={(e) => setPerKmNgn(e.target.value)}
              placeholder="Platform default"
              className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-black-500 mb-1">Max fee cap (₦)</label>
            <input
              type="number"
              step="1"
              min="0"
              value={maxFeeNgn}
              onChange={(e) => setMaxFeeNgn(e.target.value)}
              placeholder="Platform default"
              className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-black-500 mb-1">Max delivery radius (km)</label>
            <input
              type="number"
              step="1"
              min="1"
              max="100"
              value={maxRadius}
              onChange={(e) => setMaxRadius(e.target.value)}
              placeholder="Platform default"
              className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {(baseFeeNgn || perKmNgn) && (
          <div className="bg-black-50 rounded-xl px-4 py-3 text-xs text-black-500">
            <span className="font-medium text-black-700">Preview: </span>
            at 3km → {previewFee(3)} &nbsp;|&nbsp;
            at 7km → {previewFee(7)} &nbsp;|&nbsp;
            at 15km → {previewFee(15)}
          </div>
        )}

        {error && <p className="text-xs text-cinnabar-500">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
        >
          {saving ? "Saving…" : saved ? "Saved!" : "Save delivery pricing"}
        </button>
      </form>
    </Section>
  );
}

function RestaurantLocationSection({
  initialLat,
  initialLng,
  initialMaxRadius,
}: {
  initialLat: number | null;
  initialLng: number | null;
  initialMaxRadius: number | null;
}) {
  const [lat, setLat] = useState(initialLat ? String(initialLat) : "");
  const [lng, setLng] = useState(initialLng ? String(initialLng) : "");
  const [maxRadius, setMaxRadius] = useState(initialMaxRadius ? String(initialMaxRadius) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      setError("Enter valid latitude and longitude values");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/merchant/location", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: parsedLat,
          longitude: parsedLng,
          max_delivery_radius_km: maxRadius ? parseInt(maxRadius) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save location");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  const hasLocation = initialLat && initialLng;

  return (
    <Section title="Restaurant location">
      <p className="text-xs text-black-400">
        Set your restaurant&apos;s coordinates accurately — this is used to calculate delivery fees for your customers.
        {!hasLocation && (
          <span className="ml-1 text-dixie-600 font-medium">Location not set — delivery fees will use the base rate until this is configured.</span>
        )}
      </p>
      {hasLocation && (
        <div className="bg-black-50 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-viridian-500 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-black-700">Location set</p>
            <p className="text-xs text-black-400">{initialLat}, {initialLng}</p>
          </div>
        </div>
      )}
      <form onSubmit={handleSave} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-black-500 mb-1">Latitude</label>
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="e.g. 9.0579"
              className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-black-500 mb-1">Longitude</label>
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="e.g. 7.4951"
              className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-black-500 mb-1">Max delivery radius (km)</label>
          <input
            type="number"
            step="1"
            min="1"
            max="100"
            value={maxRadius}
            onChange={(e) => setMaxRadius(e.target.value)}
            placeholder="e.g. 15"
            className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
          />
          <p className="text-xs text-black-400 mt-1">
            Orders beyond this distance will be rejected. Leave blank to use the platform default.
          </p>
        </div>
        <p className="text-xs text-black-400">
          Find your coordinates: open Google Maps, right-click your restaurant location, and copy the numbers shown.
        </p>
        {error && <p className="text-xs text-cinnabar-500">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
        >
          {saving ? "Saving…" : saved ? "Saved!" : "Save location"}
        </button>
      </form>
    </Section>
  );
}

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
];

const DEFAULT_HOURS: OpeningHours = Object.fromEntries(
  DAYS.map(({ key }) => [key, { enabled: true, open: "09:00", close: "22:00" }])
);

type RestaurantExtended = Restaurant & {
  city?: string | null;
  state?: string | null;
  delivery_fee?: number;
  instagram_url?: string | null;
  facebook_url?: string | null;
  twitter_url?: string | null;
  youtube_url?: string | null;
  whatsapp_number?: string | null;
  notification_email?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  max_delivery_radius_km?: number | null;
  restaurant_base_fee_kobo?: number | null;
  restaurant_per_km_rate_kobo?: number | null;
  restaurant_max_fee_kobo?: number | null;
  vat_percentage?: number | null;
  opening_hours?: OpeningHours | null;
  closure_message?: string | null;
  scheduling_settings?: unknown;
};

export function SettingsClient({
  restaurant,
  agreement,
}: {
  restaurant: Restaurant;
  agreement: MerchantAgreementRow | null;
}) {
  const supabase = createBrowserClient();
  const r = restaurant as RestaurantExtended;

  const [name, setName] = useState(r.name);
  const [description, setDescription] = useState(r.description ?? "");
  const [phone, setPhone] = useState(r.phone ?? "");
  const [address, setAddress] = useState(r.address ?? "");
  const [city, setCity] = useState(r.city ?? "");
  const [state, setState] = useState(r.state ?? "");
  const [primaryColor, setPrimaryColor] = useState(r.primary_color ?? "#2D6A4F");
  const [minOrderNgn, setMinOrderNgn] = useState(
    r.min_order_amount ? (r.min_order_amount / 100).toString() : ""
  );
  const [deliveryFeeNgn, setDeliveryFeeNgn] = useState(
    r.delivery_fee ? (r.delivery_fee / 100).toString() : ""
  );
  const [instagramUrl, setInstagramUrl] = useState(r.instagram_url ?? "");
  const [facebookUrl, setFacebookUrl] = useState(r.facebook_url ?? "");
  const [twitterUrl, setTwitterUrl] = useState(r.twitter_url ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(r.youtube_url ?? "");
  const [whatsappNumber, setWhatsappNumber] = useState(r.whatsapp_number ?? "");
  const [notificationEmail, setNotificationEmail] = useState(r.notification_email ?? "");
  const [vatPercentage, setVatPercentage] = useState(
    r.vat_percentage != null ? r.vat_percentage.toString() : ""
  );
  const [logisticsDefault, setLogisticsDefault] = useState(r.logistics_default);
  const [acceptsOrders, setAcceptsOrders] = useState(r.accepts_orders);
  const [acceptsDelivery, setAcceptsDelivery] = useState(r.accepts_delivery ?? true);
  const [acceptsPickup, setAcceptsPickup] = useState(r.accepts_pickup ?? true);
  const [fulfillmentHint, setFulfillmentHint] = useState("");
  const [closureMessage, setClosureMessage] = useState(r.closure_message ?? "");
  const [openingHours, setOpeningHours] = useState<OpeningHours>(
    r.opening_hours ?? DEFAULT_HOURS
  );
  const [schedulingSettings, setSchedulingSettings] = useState<SchedulingSettings>(
    normalizeSchedulingSettings(r.scheduling_settings)
  );
  // Draft text for the scheduling number fields — kept separate from
  // schedulingSettings so the field can go blank/mid-edit while typing.
  // Clamping into schedulingSettings only happens on blur; clamping on every
  // keystroke fought the user (clearing the field snapped straight back to
  // the fallback default, so it looked like deleting didn't work).
  const [bookingWindowDraft, setBookingWindowDraft] = useState(
    String(schedulingSettings.booking_horizon_hours)
  );
  const [earliestBookingDraft, setEarliestBookingDraft] = useState(
    String(schedulingSettings.min_lead_minutes)
  );
  const [alertBeforeDraft, setAlertBeforeDraft] = useState(
    String(schedulingSettings.alert_lead_minutes)
  );
  const [selfCancelDraft, setSelfCancelDraft] = useState(
    String(schedulingSettings.self_cancel_cutoff_minutes)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Logo upload state
  const [logoUrl, setLogoUrl] = useState(r.logo_url ?? "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  async function handleLogoUpload(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("File too large — max 2 MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setLogoError("Please select an image file");
      return;
    }

    setLogoUploading(true);
    setLogoError("");

    const compressed = await compressImage(file);
    const ext = compressed.name.split(".").pop() ?? "jpg";
    const path = `${r.id}/logo-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("menu-images")
      .upload(path, compressed, { contentType: compressed.type });

    if (uploadError) {
      setLogoError(uploadError.message);
      setLogoUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("menu-images").getPublicUrl(path);

    const { error: dbError } = await supabase
      .from("restaurants")
      .update({ logo_url: urlData.publicUrl })
      .eq("id", r.id);

    if (dbError) {
      setLogoError(dbError.message);
    } else {
      setLogoUrl(urlData.publicUrl);
    }
    setLogoUploading(false);
  }

  async function handleLogoRemove() {
    setLogoError("");
    const { error: dbError } = await supabase
      .from("restaurants")
      .update({ logo_url: null })
      .eq("id", r.id);
    if (dbError) setLogoError(dbError.message);
    else setLogoUrl("");
  }

  // Banner upload state
  const [bannerUrl, setBannerUrl] = useState(r.banner_url ?? "");
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerError, setBannerError] = useState("");
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Hero focal point (093) — separate anchor for the tall mobile crop vs.
  // the wide desktop crop. Defaults mirror the DB column defaults (center).
  const [mobileFocal, setMobileFocal] = useState<FocalPoint>({
    x: r.banner_focal_x_mobile ?? 50,
    y: r.banner_focal_y_mobile ?? 50,
  });
  const [desktopFocal, setDesktopFocal] = useState<FocalPoint>({
    x: r.banner_focal_x ?? 50,
    y: r.banner_focal_y ?? 50,
  });

  async function handleBannerUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setBannerError("File too large — max 5 MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setBannerError("Please select an image file");
      return;
    }

    setBannerUploading(true);
    setBannerError("");

    const compressed = await compressImage(file, { maxEdge: 2000 });
    const ext = compressed.name.split(".").pop() ?? "jpg";
    const path = `${r.id}/banner-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("menu-images")
      .upload(path, compressed, { contentType: compressed.type });

    if (uploadError) {
      setBannerError(uploadError.message);
      setBannerUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("menu-images").getPublicUrl(path);

    // A new photo makes the old focal point meaningless, so it resets to
    // center on both breakpoints along with the URL.
    const { error: dbError } = await supabase
      .from("restaurants")
      .update({
        banner_url: urlData.publicUrl,
        banner_focal_x: 50,
        banner_focal_y: 50,
        banner_focal_x_mobile: 50,
        banner_focal_y_mobile: 50,
      })
      .eq("id", r.id);

    if (dbError) {
      setBannerError(dbError.message);
    } else {
      setBannerUrl(urlData.publicUrl);
      setMobileFocal({ x: 50, y: 50 });
      setDesktopFocal({ x: 50, y: 50 });
    }
    setBannerUploading(false);
  }

  async function handleBannerRemove() {
    setBannerError("");
    const { error: dbError } = await supabase
      .from("restaurants")
      .update({ banner_url: null })
      .eq("id", r.id);
    if (dbError) setBannerError(dbError.message);
    else setBannerUrl("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    const { error: updateError } = await supabase
      .from("restaurants")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        name,
        description: description || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        primary_color: primaryColor,
        min_order_amount: minOrderNgn ? Math.round(parseFloat(minOrderNgn) * 100) : null,
        vat_percentage: vatPercentage ? parseFloat(vatPercentage) : null,
        logistics_default: logisticsDefault,
        accepts_orders: acceptsOrders,
        accepts_delivery: acceptsDelivery,
        accepts_pickup: acceptsPickup,
        closure_message: closureMessage || null,
        opening_hours: openingHours,
        scheduling_settings: schedulingSettings,
        instagram_url: instagramUrl || null,
        facebook_url: facebookUrl || null,
        twitter_url: twitterUrl || null,
        youtube_url: youtubeUrl || null,
        whatsapp_number: whatsappNumber || null,
        notification_email: notificationEmail || null,
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
        banner_focal_x: desktopFocal.x,
        banner_focal_y: desktopFocal.y,
        banner_focal_x_mobile: mobileFocal.x,
        banner_focal_y_mobile: mobileFocal.y,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .eq("id", r.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 md:pt-6 md:px-6 pb-6">
        <div className="bg-white md:rounded-2xl border-b md:border border-black-100 px-4 py-4">
          <h1 className="font-bold text-black-900 text-lg">Settings</h1>
        </div>

        <div className="mt-4 px-4 md:px-0 space-y-6">
          {/* Restaurant profile */}
          <Section title="Restaurant profile">
            <Field label="Restaurant name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={inputCls}
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputCls}
                placeholder="+2348012345678"
              />
            </Field>
            <Field label="Address" hint="Street address shown on your storefront">
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                className={inputCls}
                placeholder="e.g. 14 Adeola Hopewell Street, Maitama"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Abuja"
                />
              </Field>
              <Field label="State">
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. FCT"
                />
              </Field>
            </div>
            <Field label="Brand colour">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-12 h-10 rounded-lg border border-black-200 cursor-pointer p-0.5"
                />
                <span className="text-sm text-black-500">{primaryColor}</span>
              </div>
            </Field>

            {/* Store logo upload */}
            <Field label="Store logo" hint="Recommended square aspect ratio e.g., 500x500">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                  e.target.value = "";
                }}
              />

              {logoUrl ? (
                <div className="space-y-3">
                  <div className="relative w-24 h-24 rounded-full overflow-hidden border border-black-100 bg-black-100 mx-auto sm:mx-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="Store logo preview" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoUploading}
                      className="py-2 px-4 rounded-xl border border-black-200 text-sm font-medium text-black-900 hover:bg-black-50 disabled:opacity-50 transition-colors"
                    >
                      {logoUploading ? "Uploading…" : "Replace logo"}
                    </button>
                    <button
                      type="button"
                      onClick={handleLogoRemove}
                      disabled={logoUploading}
                      className="py-2 px-4 rounded-xl border border-cinnabar-500/30 text-sm font-medium text-cinnabar-500 hover:bg-cinnabar-100 disabled:opacity-50 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  className={cn(
                    "w-full h-28 rounded-xl border-2 border-dashed border-black-200",
                    "flex flex-col items-center justify-center gap-1.5",
                    "text-black-400 hover:border-purple-500 hover:text-purple-500",
                    "disabled:opacity-50 transition-colors"
                  )}
                >
                  <ImagePlus size={28} />
                  <span className="text-sm font-medium">
                    {logoUploading ? "Uploading…" : "Upload store logo"}
                  </span>
                  <span className="text-xs">JPG, PNG or WebP · max 2 MB</span>
                </button>
              )}

              {logoError && (
                <p className="text-xs text-cinnabar-500 mt-1">{logoError}</p>
              )}
            </Field>

            {/* Hero banner upload */}
            <Field label="Hero photo">
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBannerUpload(file);
                  e.target.value = "";
                }}
              />

              {bannerUrl ? (
                <div className="space-y-3">
                  <FocalPointPicker
                    imageUrl={bannerUrl}
                    mobileValue={mobileFocal}
                    desktopValue={desktopFocal}
                    onMobileChange={setMobileFocal}
                    onDesktopChange={setDesktopFocal}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => bannerInputRef.current?.click()}
                      disabled={bannerUploading}
                      className="flex-1 py-2 rounded-xl border border-black-200 text-sm font-medium text-black-900 hover:bg-black-50 disabled:opacity-50 transition-colors"
                    >
                      {bannerUploading ? "Uploading…" : "Replace photo"}
                    </button>
                    <button
                      type="button"
                      onClick={handleBannerRemove}
                      disabled={bannerUploading}
                      className="py-2 px-4 rounded-xl border border-cinnabar-500/30 text-sm font-medium text-cinnabar-500 hover:bg-cinnabar-100 disabled:opacity-50 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={bannerUploading}
                  className={cn(
                    "w-full h-28 rounded-xl border-2 border-dashed border-black-200",
                    "flex flex-col items-center justify-center gap-1.5",
                    "text-black-400 hover:border-purple-500 hover:text-purple-500",
                    "disabled:opacity-50 transition-colors"
                  )}
                >
                  <ImagePlus size={28} />
                  <span className="text-sm font-medium">
                    {bannerUploading ? "Uploading…" : "Upload hero photo"}
                  </span>
                  <span className="text-xs">JPG, PNG or WebP · max 5 MB</span>
                </button>
              )}

              {bannerError && (
                <p className="text-xs text-cinnabar-500 mt-1">{bannerError}</p>
              )}
            </Field>
          </Section>

          {/* Notifications */}
          <Section title="Notifications">
            <Field label="Order Alert Email" hint="New order alerts will be sent to this email address">
              <input
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                className={inputCls}
                placeholder="orders@yourrestaurant.com"
                type="email"
              />
              {notificationEmail ? (
                <p className="text-xs text-viridian-500 font-medium mt-1.5 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-viridian-500" />
                  ✓ Email alerts active
                </p>
              ) : (
                <p className="text-xs text-black-400 mt-1.5">No notification email set</p>
              )}
            </Field>
            <Field label="WhatsApp Alert Number" hint="Order alerts will be sent to this WhatsApp number. Must be in international format (e.g. +2348012345678)">
              <input
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className={cn(
                  inputCls,
                  whatsappNumber && !/^\+[0-9]{9,14}$/.test(whatsappNumber)
                    ? "border-cinnabar-500 focus:border-cinnabar-500"
                    : ""
                )}
                placeholder="+2348012345678"
                type="tel"
              />
              {whatsappNumber && /^\+[0-9]{9,14}$/.test(whatsappNumber) && (
                <p className="text-xs text-viridian-500 font-medium mt-1.5 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-viridian-500" />
                  ✓ WhatsApp alerts active
                </p>
              )}
              {whatsappNumber && !/^\+[0-9]{9,14}$/.test(whatsappNumber) && (
                <p className="text-xs text-cinnabar-500 mt-1.5">
                  Invalid format — must start with + followed by 10-15 digits (e.g. +2348012345678)
                </p>
              )}
              {!whatsappNumber && (
                <p className="text-xs text-black-400 mt-1.5">
                  No WhatsApp number set — alerts will be sent via SMS
                </p>
              )}
            </Field>
          </Section>

          {/* Social media */}
          <Section title="Social media">
            <Field label="Instagram" hint="Full URL e.g. https://instagram.com/yourhandle">
              <input
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                className={inputCls}
                placeholder="https://instagram.com/yourhandle"
                type="url"
              />
            </Field>
            <Field label="Facebook" hint="Full URL e.g. https://facebook.com/yourpage">
              <input
                value={facebookUrl}
                onChange={(e) => setFacebookUrl(e.target.value)}
                className={inputCls}
                placeholder="https://facebook.com/yourpage"
                type="url"
              />
            </Field>
            <Field label="Twitter / X" hint="Full URL e.g. https://x.com/yourhandle">
              <input
                value={twitterUrl}
                onChange={(e) => setTwitterUrl(e.target.value)}
                className={inputCls}
                placeholder="https://x.com/yourhandle"
                type="url"
              />
            </Field>
            <Field label="YouTube" hint="Full URL e.g. https://youtube.com/@yourchannel">
              <input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className={inputCls}
                placeholder="https://youtube.com/@yourchannel"
                type="url"
              />
            </Field>
          </Section>

          {/* Ordering settings */}
          <Section title="Ordering">
            <Field label="Minimum order (₦)">
              <input
                type="number"
                min="0"
                value={minOrderNgn}
                onChange={(e) => setMinOrderNgn(e.target.value)}
                className={inputCls}
                placeholder="0"
              />
            </Field>
            <Field label="Delivery fee (₦)">
              <input
                type="number"
                min="0"
                value={deliveryFeeNgn}
                onChange={(e) => setDeliveryFeeNgn(e.target.value)}
                className={inputCls}
                placeholder="0"
              />
            </Field>
            <Field
              label="VAT (%)"
              hint="Applied to the order subtotal. Leave blank if you don't charge VAT."
            >
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={vatPercentage}
                onChange={(e) => setVatPercentage(e.target.value)}
                className={inputCls}
                placeholder="e.g. 7.5"
              />
            </Field>
            <Field label="Default logistics mode">
              <select
                value={logisticsDefault}
                onChange={(e) => setLogisticsDefault(e.target.value as Restaurant["logistics_default"])}
                className={cn(inputCls, "bg-white")}
              >
                <option value="platform_rider">Platform Rider</option>
                <option value="own_rider">Own Rider</option>
                <option value="third_party">Third-Party (Kwik etc.)</option>
              </select>
            </Field>
          </Section>

          {/* Fulfillment methods */}
          <Section title="Fulfillment methods">
            <p className="text-xs text-black-400 -mt-1 mb-1">
              Choose how customers can receive orders. At least one method must stay on.
            </p>
            {(
              [
                {
                  key: "delivery" as const,
                  title: "Delivery",
                  sub: "Customers can order for delivery",
                  value: acceptsDelivery,
                },
                {
                  key: "pickup" as const,
                  title: "Pickup",
                  sub: "Customers can collect orders themselves",
                  value: acceptsPickup,
                },
              ]
            ).map(({ key, title, sub, value }) => (
              <div key={key} className="flex items-center justify-between py-3 border-b border-black-100 last:border-b-0">
                <div>
                  <p className="text-sm font-medium text-black-900">{title}</p>
                  <p className="text-xs text-black-400">{sub}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const other = key === "delivery" ? acceptsPickup : acceptsDelivery;
                    if (value && !other) {
                      setFulfillmentHint("At least one method must stay on");
                      return;
                    }
                    setFulfillmentHint("");
                    if (key === "delivery") setAcceptsDelivery(!value);
                    else setAcceptsPickup(!value);
                  }}
                  aria-label={value ? `${title} is on — tap to turn off` : `${title} is off — tap to turn on`}
                  aria-checked={value}
                  role="switch"
                  className={cn(
                    "relative w-12 h-6 rounded-full transition-colors flex-shrink-0",
                    value ? "bg-purple-500" : "bg-black-200"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                      value ? "left-7" : "left-1"
                    )}
                  />
                </button>
              </div>
            ))}
            {fulfillmentHint && (
              <p className="text-xs text-cinnabar-500 mt-1">{fulfillmentHint}</p>
            )}
          </Section>

          {/* Close store */}
          <Section title="Close store">
            <p className="text-xs text-black-400 -mt-1 mb-1">
              Manually close the store at any time. This is separate from your operating hours — use it for unexpected closures, breaks, or holidays.
            </p>
            <div className="flex items-center justify-between py-3 border-b border-black-100">
              <div>
                <p className="text-sm font-medium text-black-900">Store is open</p>
                <p className="text-xs text-black-400">Toggle off to close the store immediately</p>
              </div>
              <button
                type="button"
                onClick={() => setAcceptsOrders((v) => !v)}
                aria-label={acceptsOrders ? "Store is open — tap to close" : "Store is closed — tap to open"}
                aria-checked={acceptsOrders}
                role="switch"
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors flex-shrink-0",
                  acceptsOrders ? "bg-purple-500" : "bg-black-200"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                    acceptsOrders ? "left-7" : "left-1"
                  )}
                />
              </button>
            </div>
            <Field
              label="Closure message"
              hint="Shown to customers when they visit while the store is manually closed. Leave blank for the default message."
            >
              <textarea
                value={closureMessage}
                onChange={(e) => setClosureMessage(e.target.value)}
                className={cn(inputCls, "resize-none")}
                rows={3}
                maxLength={200}
                placeholder="e.g. We're taking a short break — back tomorrow at noon!"
              />
            </Field>
          </Section>

          {/* Operating hours */}
          <Section title="Operating hours">
            <p className="text-xs text-black-400 mb-3">
              Customers will see a &quot;closed&quot; notice outside these hours. Disabled days are treated as closed all day.
            </p>
            <div className="space-y-2">
              {DAYS.map(({ key, label }) => {
                const day = openingHours[key] ?? { enabled: true, open: "09:00", close: "22:00" };
                return (
                  <div key={key} className="flex items-center gap-3">
                    {/* Day toggle */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={day.enabled}
                      onClick={() =>
                        setOpeningHours((prev) => ({
                          ...prev,
                          [key]: { ...day, enabled: !day.enabled },
                        }))
                      }
                      className={cn(
                        "relative w-10 h-5 rounded-full flex-shrink-0 transition-colors",
                        day.enabled ? "bg-purple-500" : "bg-black-200"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                          day.enabled ? "left-5" : "left-0.5"
                        )}
                      />
                    </button>
                    {/* Day label */}
                    <span className={cn("text-sm w-24 flex-shrink-0", day.enabled ? "text-black-900 font-medium" : "text-black-400")}>
                      {label}
                    </span>
                    {/* Time pickers */}
                    {day.enabled ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="time"
                          value={day.open}
                          onChange={(e) =>
                            setOpeningHours((prev) => ({
                              ...prev,
                              [key]: { ...day, open: e.target.value },
                            }))
                          }
                          className="flex-1 text-sm border border-black-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
                        />
                        <span className="text-xs text-black-400">to</span>
                        <input
                          type="time"
                          value={day.close}
                          onChange={(e) =>
                            setOpeningHours((prev) => ({
                              ...prev,
                              [key]: { ...day, close: e.target.value },
                            }))
                          }
                          className="flex-1 text-sm border border-black-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-black-400 italic">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Pre-orders (scheduled orders) */}
          <Section title="Pre-orders">
            <p className="text-xs text-black-400 -mt-1 mb-1">
              Let customers book a future time slot at checkout — even while
              you&rsquo;re closed, so they can order ahead for when you open.
              A pre-order is paid in full up front and enters your live queue
              automatically at the booked time.
            </p>
            <div className="flex items-center justify-between py-3 border-b border-black-100">
              <div>
                <p className="text-sm font-medium text-black-900">Accept scheduled orders</p>
                <p className="text-xs text-black-400">Adds a &ldquo;Schedule for later&rdquo; option at checkout</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSchedulingSettings((s) => ({ ...s, enabled: !s.enabled }))
                }
                aria-label={
                  schedulingSettings.enabled
                    ? "Pre-orders on — tap to turn off"
                    : "Pre-orders off — tap to turn on"
                }
                aria-checked={schedulingSettings.enabled}
                role="switch"
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors flex-shrink-0",
                  schedulingSettings.enabled ? "bg-purple-500" : "bg-black-200"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                    schedulingSettings.enabled ? "left-7" : "left-1"
                  )}
                />
              </button>
            </div>

            {schedulingSettings.enabled && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Booking window (hours)" hint="How far ahead customers can book">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={720}
                      value={bookingWindowDraft}
                      onChange={(e) => setBookingWindowDraft(e.target.value)}
                      onBlur={() => {
                        const clamped = clampInt(bookingWindowDraft, 1, 720, SCHEDULING_DEFAULTS.booking_horizon_hours);
                        setBookingWindowDraft(String(clamped));
                        setSchedulingSettings((s) => ({ ...s, booking_horizon_hours: clamped }));
                      }}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Slot size (minutes)">
                    <select
                      value={schedulingSettings.slot_granularity_minutes}
                      onChange={(e) =>
                        setSchedulingSettings((s) => ({
                          ...s,
                          slot_granularity_minutes: parseInt(e.target.value, 10),
                        }))
                      }
                      className={cn(inputCls, "bg-white")}
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>60 minutes</option>
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Earliest booking (minutes)" hint="Minimum lead time from now">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={1440}
                      value={earliestBookingDraft}
                      onChange={(e) => setEarliestBookingDraft(e.target.value)}
                      onBlur={() => {
                        const clamped = clampInt(earliestBookingDraft, 0, 1440, SCHEDULING_DEFAULTS.min_lead_minutes);
                        setEarliestBookingDraft(String(clamped));
                        setSchedulingSettings((s) => ({ ...s, min_lead_minutes: clamped }));
                      }}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Capacity per slot" hint="Optional — soft cap shown to you only">
                    <input
                      type="number"
                      min={1}
                      placeholder="No limit"
                      value={schedulingSettings.capacity_per_slot ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        setSchedulingSettings((s) => ({
                          ...s,
                          capacity_per_slot: v ? Math.max(1, parseInt(v, 10) || 1) : null,
                        }));
                      }}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Alert me before (minutes)" hint="Push notification lead time">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1440}
                      value={alertBeforeDraft}
                      onChange={(e) => setAlertBeforeDraft(e.target.value)}
                      onBlur={() => {
                        const clamped = clampInt(alertBeforeDraft, 1, 1440, SCHEDULING_DEFAULTS.alert_lead_minutes);
                        setAlertBeforeDraft(String(clamped));
                        setSchedulingSettings((s) => ({ ...s, alert_lead_minutes: clamped }));
                      }}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Customer self-cancel cutoff (minutes)" hint="Before the slot">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={1440}
                      value={selfCancelDraft}
                      onChange={(e) => setSelfCancelDraft(e.target.value)}
                      onBlur={() => {
                        const clamped = clampInt(selfCancelDraft, 0, 1440, SCHEDULING_DEFAULTS.self_cancel_cutoff_minutes);
                        setSelfCancelDraft(String(clamped));
                        setSchedulingSettings((s) => ({ ...s, self_cancel_cutoff_minutes: clamped }));
                      }}
                      className={inputCls}
                    />
                  </Field>
                </div>

                <PausedRangesField
                  ranges={schedulingSettings.paused_ranges}
                  onChange={(paused_ranges) =>
                    setSchedulingSettings((s) => ({ ...s, paused_ranges }))
                  }
                />
              </>
            )}
          </Section>

          {/* Bank account */}
          <BankAccountSection
            restaurantId={r.id}
            initialData={{
              bank_code: (r as RestaurantExtended & { bank_code?: string | null }).bank_code ?? null,
              bank_account_number: (r as RestaurantExtended & { bank_account_number?: string | null }).bank_account_number ?? null,
              bank_account_name: (r as RestaurantExtended & { bank_account_name?: string | null }).bank_account_name ?? null,
              paystack_recipient_code: (r as RestaurantExtended & { paystack_recipient_code?: string | null }).paystack_recipient_code ?? null,
              monnify_bank_verified_at: (r as RestaurantExtended & { monnify_bank_verified_at?: string | null }).monnify_bank_verified_at ?? null,
            }}
          />

          {/* Merchant agreement */}
          <AgreementSection agreement={agreement} />

          {/* Delivery pricing */}
          <RestaurantDeliveryPricingSection
            initialBaseFeeKobo={r.restaurant_base_fee_kobo ?? null}
            initialPerKmRateKobo={r.restaurant_per_km_rate_kobo ?? null}
            initialMaxFeeKobo={r.restaurant_max_fee_kobo ?? null}
            initialMaxRadiusKm={r.max_delivery_radius_km ?? null}
          />

          {/* Restaurant location */}
          <RestaurantLocationSection
            initialLat={r.latitude ?? null}
            initialLng={r.longitude ?? null}
            initialMaxRadius={r.max_delivery_radius_km ?? null}
          />

          {/* Staff management */}
          <StaffManagementSection restaurantId={r.id} />

          {error && <p className="text-sm text-cinnabar-500">{error}</p>}
        </div>
      </div>

      <div className="sticky bottom-16 md:bottom-0 bg-white border-t border-black-100 px-4 md:px-6 py-4 z-10">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full md:max-w-xs bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {saving ? "Saving…" : saved ? "✓ Saved!" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Staff Management Section                                           */
/* ------------------------------------------------------------------ */

type StaffUser = {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
};

function StaffManagementSection({ restaurantId: _restaurantId }: { restaurantId: string }) {
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);

  // Create form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  // Reset password state
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  // Delete state
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/staff");
      const data = await res.json();
      if (res.ok) {
        setStaff(data.staff ?? null);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    setCreateSuccess("");

    try {
      const res = await fetch("/api/dashboard/staff/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName }),
      });
      const data = await res.json();

      if (!res.ok) {
        setCreateError(data.error ?? "Failed to create staff account");
      } else {
        setCreateSuccess("Staff account created successfully!");
        setEmail("");
        setPassword("");
        setFullName("");
        setShowCreateForm(false);
        fetchStaff();
      }
    } catch {
      setCreateError("Network error");
    }
    setCreating(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetting(true);
    setResetError("");
    setResetSuccess("");

    try {
      const res = await fetch("/api/dashboard/staff/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setResetError(data.error ?? "Failed to reset password");
      } else {
        setResetSuccess("Password updated successfully!");
        setNewPassword("");
        setShowResetForm(false);
        setTimeout(() => setResetSuccess(""), 4000);
      }
    } catch {
      setResetError("Network error");
    }
    setResetting(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this staff account? This action cannot be undone.")) return;
    setDeleting(true);
    setDeleteError("");

    try {
      const res = await fetch("/api/dashboard/staff/delete", {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        setDeleteError(data.error ?? "Failed to delete staff account");
      } else {
        setStaff(null);
        setShowResetForm(false);
      }
    } catch {
      setDeleteError("Network error");
    }
    setDeleting(false);
  }

  if (loading) {
    return (
      <Section title="Frontline staff">
        <div className="py-6 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Section>
    );
  }

  return (
    <Section title="Frontline staff">
      <p className="text-xs text-black-400 -mt-1">
        Create a staff account for your operations team. They&apos;ll get a simplified dashboard with
        just Orders and Menu.
      </p>

      {/* Success messages */}
      {createSuccess && (
        <div className="bg-viridian-50 text-viridian-600 text-sm px-4 py-3 rounded-xl border border-viridian-200">
          {createSuccess}
        </div>
      )}
      {resetSuccess && (
        <div className="bg-viridian-50 text-viridian-600 text-sm px-4 py-3 rounded-xl border border-viridian-200">
          {resetSuccess}
        </div>
      )}

      {staff ? (
        /* ── Existing staff view ── */
        <div className="space-y-4">
          <div className="bg-black-50 rounded-xl px-4 py-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-purple-600">
                {staff.full_name
                  .split(/\s+/)
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-black-900">{staff.full_name}</p>
              <p className="text-xs text-black-500 truncate">{staff.email}</p>
            </div>
            <span className="text-[10px] font-semibold text-viridian-600 bg-viridian-50 border border-viridian-200 px-2 py-0.5 rounded-full flex-shrink-0">
              Active
            </span>
          </div>

          {/* Preview frontline link */}
          <a
            href="/dashboard/frontline/orders"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium text-purple-500 hover:text-purple-400 transition-colors"
          >
            <ExternalLink size={14} />
            Preview frontline view
          </a>

          {/* Reset password */}
          {showResetForm ? (
            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-black-500 mb-1">New password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className={cn(inputCls, "pr-10")}
                    placeholder="Minimum 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-black-400 hover:text-black-600 cursor-pointer"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {resetError && <p className="text-xs text-cinnabar-500">{resetError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={resetting}
                  className="flex-1 bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  {resetting ? "Updating…" : "Update password"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetForm(false);
                    setResetError("");
                    setNewPassword("");
                  }}
                  className="px-4 py-2.5 rounded-xl border border-black-200 text-sm text-black-500 hover:bg-black-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowResetForm(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-black-500 hover:text-purple-500 border border-black-200 hover:border-purple-300 px-3 py-2 rounded-xl transition-colors cursor-pointer"
              >
                <KeyRound size={14} />
                Reset password
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 text-sm font-medium text-cinnabar-500 hover:text-cinnabar-400 border border-cinnabar-200 hover:bg-cinnabar-50 disabled:opacity-60 px-3 py-2 rounded-xl transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
                {deleting ? "Deleting…" : "Remove"}
              </button>
            </div>
          )}

          {deleteError && <p className="text-xs text-cinnabar-500">{deleteError}</p>}
        </div>
      ) : showCreateForm ? (
        /* ── Create staff form ── */
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">Full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              className={inputCls}
              placeholder="e.g. Adamu Ibrahim"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputCls}
              placeholder="staff@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={cn(inputCls, "pr-10")}
                placeholder="Minimum 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black-400 hover:text-black-600 cursor-pointer"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {createError && <p className="text-xs text-cinnabar-500">{createError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="flex-1 bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              {creating ? "Creating…" : "Create staff account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setCreateError("");
              }}
              className="px-4 py-2.5 rounded-xl border border-black-200 text-sm text-black-500 hover:bg-black-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        /* ── No staff yet — show add button ── */
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-black-200 text-sm font-medium text-black-500 hover:border-purple-500 hover:text-purple-500 transition-colors cursor-pointer"
        >
          <UserPlus size={16} />
          Add staff member
        </button>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-black-100">
        <h2 className="font-semibold text-black-900 text-sm">{title}</h2>
      </div>
      <div className="px-4 py-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-black-500 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-black-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500";

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const v = parseInt(raw, 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/** Add/remove list of blackout windows (holidays, private events) — no
 *  bookable slots fall inside a paused range. */
function PausedRangesField({
  ranges,
  onChange,
}: {
  ranges: PausedRange[];
  onChange: (ranges: PausedRange[]) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function addRange() {
    if (!from || !to) return;
    const fromIso = new Date(from).toISOString();
    const toIso = new Date(to).toISOString();
    if (new Date(toIso) <= new Date(fromIso)) return;
    onChange([...ranges, { from: fromIso, to: toIso }]);
    setFrom("");
    setTo("");
  }

  function removeRange(idx: number) {
    onChange(ranges.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-black-500 mb-1">
        Blackout windows
      </label>
      <p className="text-xs text-black-400 mb-2">
        No slots will be offered inside these ranges (holidays, private events).
      </p>
      {ranges.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {ranges.map((r, idx) => (
            <div
              key={`${r.from}-${r.to}`}
              className="flex items-center justify-between gap-2 bg-black-50 rounded-lg px-3 py-2"
            >
              <span className="text-xs text-black-700">
                {new Date(r.from).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                {" – "}
                {new Date(r.to).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
              </span>
              <button
                type="button"
                onClick={() => removeRange(idx)}
                className="text-black-400 hover:text-cinnabar-500 transition-colors cursor-pointer flex-shrink-0"
                aria-label="Remove blackout window"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="datetime-local"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="flex-1 text-sm border border-black-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
        <span className="text-xs text-black-400">to</span>
        <input
          type="datetime-local"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="flex-1 text-sm border border-black-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
        <button
          type="button"
          onClick={addRange}
          disabled={!from || !to}
          className="w-8 h-8 flex-shrink-0 rounded-lg bg-purple-500 hover:bg-purple-400 disabled:opacity-40 text-white flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Add blackout window"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
