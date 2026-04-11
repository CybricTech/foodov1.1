"use client";

import { useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@foodo/ui";
import { ImagePlus } from "lucide-react";
import type { Restaurant } from "@foodo/database";

// Nigerian bank list fetched from Paystack (cached in component state)
type PaystackBank = { id: number; name: string; code: string };

function BankAccountSection({ restaurantId, initialData }: {
  restaurantId: string;
  initialData: {
    bank_code: string | null;
    bank_account_number: string | null;
    bank_account_name: string | null;
    paystack_recipient_code: string | null;
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

  const maskedAccount = saved?.bank_account_number
    ? `${saved.bank_account_number.slice(0, 3)}***${saved.bank_account_number.slice(-3)}`
    : null;

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
            <p className="text-sm font-semibold text-black-900 mt-0.5">{maskedAccount}</p>
          </div>
          {saved.paystack_recipient_code && (
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

type RestaurantExtended = Restaurant & {
  city?: string | null;
  state?: string | null;
  delivery_fee?: number;
  instagram_url?: string | null;
  facebook_url?: string | null;
  twitter_url?: string | null;
  youtube_url?: string | null;
  whatsapp_number?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  max_delivery_radius_km?: number | null;
};

export function SettingsClient({ restaurant }: { restaurant: Restaurant }) {
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
  const [logisticsDefault, setLogisticsDefault] = useState(r.logistics_default);
  const [acceptsOrders, setAcceptsOrders] = useState(r.accepts_orders);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Banner upload state
  const [bannerUrl, setBannerUrl] = useState(r.banner_url ?? "");
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerError, setBannerError] = useState("");
  const bannerInputRef = useRef<HTMLInputElement>(null);

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

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${r.id}/banner-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("menu-images")
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setBannerError(uploadError.message);
      setBannerUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("menu-images").getPublicUrl(path);

    const { error: dbError } = await supabase
      .from("restaurants")
      .update({ banner_url: urlData.publicUrl })
      .eq("id", r.id);

    if (dbError) {
      setBannerError(dbError.message);
    } else {
      setBannerUrl(urlData.publicUrl);
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
        logistics_default: logisticsDefault,
        accepts_orders: acceptsOrders,
        instagram_url: instagramUrl || null,
        facebook_url: facebookUrl || null,
        twitter_url: twitterUrl || null,
        youtube_url: youtubeUrl || null,
        whatsapp_number: whatsappNumber || null,
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
                  <div className="relative w-full aspect-[3/1] rounded-xl overflow-hidden border border-black-100 bg-black-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={bannerUrl} alt="Hero banner preview" className="w-full h-full object-cover" />
                  </div>
                  <p className="text-xs text-black-400">Preview — this is how it appears as the storefront hero</p>
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
            <Field label="WhatsApp number" hint="Include country code e.g. 2348012345678">
              <input
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className={inputCls}
                placeholder="2348012345678"
                type="tel"
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
            <div className="flex items-center justify-between py-3 border-t border-black-100 mb-1">
              <div>
                <p className="text-sm font-medium text-black-900">Accept orders</p>
                <p className="text-xs text-black-400">Toggle off to pause ordering without deleting anything</p>
              </div>
              <button
                type="button"
                onClick={() => setAcceptsOrders((v) => !v)}
                aria-label={acceptsOrders ? "Accepting orders — tap to pause" : "Orders paused — tap to accept"}
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
          </Section>

          {/* Bank account */}
          <BankAccountSection
            restaurantId={r.id}
            initialData={{
              bank_code: (r as RestaurantExtended & { bank_code?: string | null }).bank_code ?? null,
              bank_account_number: (r as RestaurantExtended & { bank_account_number?: string | null }).bank_account_number ?? null,
              bank_account_name: (r as RestaurantExtended & { bank_account_name?: string | null }).bank_account_name ?? null,
              paystack_recipient_code: (r as RestaurantExtended & { paystack_recipient_code?: string | null }).paystack_recipient_code ?? null,
            }}
          />

          {/* Restaurant location */}
          <RestaurantLocationSection
            initialLat={r.latitude ?? null}
            initialLng={r.longitude ?? null}
            initialMaxRadius={r.max_delivery_radius_km ?? null}
          />

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
