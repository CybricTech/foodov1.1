"use client";

import { useState } from "react";

type PlatformSettings = {
  service_charge_pct: number;
  service_charge_fixed_kobo: number;
  merchant_charge_pct?: number | null;
  settlement_hold_hours: number;
  delivery_base_fee_kobo?: number | null;
  delivery_per_km_rate_kobo?: number | null;
  delivery_max_radius_km?: number | null;
  delivery_max_fee_kobo?: number | null;
  delivery_commission_pct?: number | null;
  admin_whatsapp_number?: string | null;
  admin_alert_email?: string | null;
  // Dispatch (migrations 095 / 101)
  bolt_booking_enabled?: boolean | null;
  bolt_booking_shadow?: boolean | null;
  bolt_environment?: string | null;
  bolt_rider_contact_phone?: string | null;
  timed_rider_request_enabled?: boolean | null;
  rider_request_lead_minutes?: number | null;
} | null;

interface SettingsAdminClientProps {
  settings: PlatformSettings;
}

export function SettingsAdminClient({ settings }: SettingsAdminClientProps) {
  // Test-order helper (dev tool) — drops a fake new order on CopperPot.
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function sendTestOrder(fulfillment: "pickup" | "delivery" = "pickup") {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/test-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fulfillment }),
      });
      const data = await res.json();
      setTestResult(
        res.ok
          ? `✅ Sent ${fulfillment} order ${data.orderNumber} to ${data.restaurant}` +
            (data.warning ? `\n⚠️ ${data.warning}` : "")
          : `❌ ${data.error ?? "Failed to send test order"}`
      );
    } catch (e) {
      setTestResult(`❌ ${e instanceof Error ? e.message : "Network error"}`);
    } finally {
      setTestLoading(false);
    }
  }

  // Service charge config form state
  const [pct, setPct] = useState(
    settings ? (Number(settings.service_charge_pct) * 100).toFixed(1) : "3.0"
  );
  const [fixedNgn, setFixedNgn] = useState(
    settings ? (settings.service_charge_fixed_kobo / 100).toFixed(0) : "0"
  );
  const [merchantChargePct, setMerchantChargePct] = useState(
    settings?.merchant_charge_pct != null
      ? (Number(settings.merchant_charge_pct) * 100).toFixed(1)
      : "1.0"
  );
  const [holdHours, setHoldHours] = useState(
    settings ? String(settings.settlement_hold_hours) : "24"
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  // Delivery pricing form state
  const [baseFeeNgn, setBaseFeeNgn] = useState(
    settings?.delivery_base_fee_kobo ? String(Math.round(Number(settings.delivery_base_fee_kobo) / 100)) : "2300"
  );
  const [perKmNgn, setPerKmNgn] = useState(
    settings?.delivery_per_km_rate_kobo ? String(Math.round(Number(settings.delivery_per_km_rate_kobo) / 100)) : "150"
  );
  const [maxRadius, setMaxRadius] = useState(
    settings?.delivery_max_radius_km ? String(settings.delivery_max_radius_km) : "25"
  );
  const [maxFeeNgn, setMaxFeeNgn] = useState(
    settings?.delivery_max_fee_kobo ? String(Math.round(Number(settings.delivery_max_fee_kobo) / 100)) : "15000"
  );
  const [deliveryCommissionPct, setDeliveryCommissionPct] = useState(
    settings?.delivery_commission_pct != null
      ? (Number(settings.delivery_commission_pct) * 100).toFixed(1)
      : "10.0"
  );
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deliverySaved, setDeliverySaved] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");

  // Admin WhatsApp number state
  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState(
    settings?.admin_whatsapp_number ?? ""
  );
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [whatsappSaved, setWhatsappSaved] = useState(false);
  const [whatsappError, setWhatsappError] = useState("");

  // Admin alert email state
  const [adminAlertEmail, setAdminAlertEmail] = useState(
    settings?.admin_alert_email ?? ""
  );
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState("");

  // ── Dispatch ──────────────────────────────────────────────────────────────
  const [timedRequests, setTimedRequests] = useState(
    settings?.timed_rider_request_enabled ?? false
  );
  const [leadMinutes, setLeadMinutes] = useState(
    String(settings?.rider_request_lead_minutes ?? 10)
  );
  const [boltEnabled, setBoltEnabled] = useState(settings?.bolt_booking_enabled ?? false);
  const [boltShadow, setBoltShadow] = useState(settings?.bolt_booking_shadow ?? true);
  const [boltEnv, setBoltEnv] = useState(settings?.bolt_environment ?? "sandbox");
  const [boltRiderPhone, setBoltRiderPhone] = useState(
    settings?.bolt_rider_contact_phone ?? ""
  );
  const [savingDispatch, setSavingDispatch] = useState(false);
  const [dispatchSaved, setDispatchSaved] = useState(false);
  const [dispatchError, setDispatchError] = useState("");

  async function saveDispatchSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingDispatch(true);
    setDispatchError("");
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timed_rider_request_enabled: timedRequests,
          rider_request_lead_minutes: parseInt(leadMinutes, 10),
          bolt_booking_enabled: boltEnabled,
          bolt_booking_shadow: boltShadow,
          bolt_environment: boltEnv,
          bolt_rider_contact_phone: boltRiderPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDispatchError(data.error ?? "Failed to save");
      } else {
        setDispatchSaved(true);
        setTimeout(() => setDispatchSaved(false), 3000);
      }
    } catch {
      setDispatchError("Network error");
    }
    setSavingDispatch(false);
  }

  // Live formula preview at 3km, 7km, 15km
  function previewFee(km: number): string {
    const base = parseFloat(baseFeeNgn) || 0;
    const rate = parseFloat(perKmNgn) || 0;
    const cap = parseFloat(maxFeeNgn) || 999999;
    const fee = Math.min(base + km * rate, cap);
    return `₦${fee.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError("");
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_charge_pct: parseFloat(pct) / 100,
          service_charge_fixed_kobo: Math.round(parseFloat(fixedNgn) * 100),
          merchant_charge_pct: parseFloat(merchantChargePct) / 100,
          settlement_hold_hours: parseInt(holdHours),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSettingsError(data.error ?? "Failed to save");
      } else {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 3000);
      }
    } catch {
      setSettingsError("Network error");
    }
    setSavingSettings(false);
  }

  async function saveDeliverySettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingDelivery(true);
    setDeliveryError("");
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delivery_base_fee_kobo: Math.round(parseFloat(baseFeeNgn) * 100),
          delivery_per_km_rate_kobo: Math.round(parseFloat(perKmNgn) * 100),
          delivery_max_radius_km: parseInt(maxRadius),
          delivery_max_fee_kobo: Math.round(parseFloat(maxFeeNgn) * 100),
          delivery_commission_pct: parseFloat(deliveryCommissionPct) / 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeliveryError(data.error ?? "Failed to save");
      } else {
        setDeliverySaved(true);
        setTimeout(() => setDeliverySaved(false), 3000);
      }
    } catch {
      setDeliveryError("Network error");
    }
    setSavingDelivery(false);
  }

  async function saveAdminWhatsapp(e: React.FormEvent) {
    e.preventDefault();
    if (adminWhatsappNumber && !/^\+[0-9]{9,14}$/.test(adminWhatsappNumber)) {
      setWhatsappError("Invalid format — must start with + followed by 10-15 digits");
      return;
    }
    setSavingWhatsapp(true);
    setWhatsappError("");
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_whatsapp_number: adminWhatsappNumber || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWhatsappError(data.error ?? "Failed to save");
      } else {
        setWhatsappSaved(true);
        setTimeout(() => setWhatsappSaved(false), 3000);
      }
    } catch {
      setWhatsappError("Network error");
    }
    setSavingWhatsapp(false);
  }

  async function saveAdminEmail(e: React.FormEvent) {
    e.preventDefault();
    setSavingEmail(true);
    setEmailError("");
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_alert_email: adminAlertEmail || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error ?? "Failed to save");
      } else {
        setEmailSaved(true);
        setTimeout(() => setEmailSaved(false), 3000);
      }
    } catch {
      setEmailError("Network error");
    }
    setSavingEmail(false);
  }

  return (
    <div className="space-y-8">
      {/* Admin notifications */}
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200">
          <h2 className="font-bold text-black-900 text-sm">Admin Notifications</h2>
          <p className="text-xs text-black-400 mt-0.5">
            Receive alerts for all new orders across all restaurants
          </p>
        </div>
        <div className="divide-y divide-black-100">
          {/* WhatsApp */}
          <form onSubmit={saveAdminWhatsapp} className="px-4 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">
                Admin WhatsApp Alert Number
              </label>
              <input
                type="tel"
                value={adminWhatsappNumber}
                onChange={(e) => setAdminWhatsappNumber(e.target.value)}
                placeholder="+2348012345678"
                className={`w-full px-3 py-2.5 rounded-xl border text-sm text-black-900 focus:outline-none ${
                  adminWhatsappNumber && !/^\+[0-9]{9,14}$/.test(adminWhatsappNumber)
                    ? "border-cinnabar-500 focus:border-cinnabar-500"
                    : "border-black-200 focus:border-black-400"
                }`}
              />
              <p className="text-xs text-black-400 mt-1">
                All new orders from all restaurants will be sent to this number
              </p>
              {adminWhatsappNumber && /^\+[0-9]{9,14}$/.test(adminWhatsappNumber) && (
                <p className="text-xs text-viridian-500 font-medium mt-1.5 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-viridian-500" />
                  ✓ Active — receiving all order alerts
                </p>
              )}
            </div>
            {whatsappError && <p className="text-xs text-cinnabar-500">{whatsappError}</p>}
            <button
              type="submit"
              disabled={savingWhatsapp}
              className="bg-black-900 hover:bg-black-700 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {savingWhatsapp ? "Saving…" : whatsappSaved ? "✓ Saved!" : "Save WhatsApp number"}
            </button>
          </form>

          {/* Email */}
          <form onSubmit={saveAdminEmail} className="px-4 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">
                Admin Alert Email
              </label>
              <input
                type="email"
                value={adminAlertEmail}
                onChange={(e) => setAdminAlertEmail(e.target.value)}
                placeholder="admin@cybric.tech"
                className="w-full px-3 py-2.5 rounded-xl border border-black-200 focus:border-black-400 text-sm text-black-900 focus:outline-none"
              />
              <p className="text-xs text-black-400 mt-1">
                All new orders from all restaurants will be sent to this email
              </p>
              {adminAlertEmail && (
                <p className="text-xs text-viridian-500 font-medium mt-1.5 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-viridian-500" />
                  ✓ Active — receiving all order alerts
                </p>
              )}
            </div>
            {emailError && <p className="text-xs text-cinnabar-500">{emailError}</p>}
            <button
              type="submit"
              disabled={savingEmail}
              className="bg-black-900 hover:bg-black-700 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {savingEmail ? "Saving…" : emailSaved ? "✓ Saved!" : "Save email address"}
            </button>
          </form>
        </div>
      </div>

      {/* Platform Fee Configuration */}
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200">
          <h2 className="font-bold text-black-900 text-sm">Platform Fee Configuration</h2>
          <p className="text-xs text-black-400 mt-0.5">
            Changes apply to new orders only
          </p>
        </div>
        <form onSubmit={saveSettings} className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">
                Customer service charge %
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  className="w-full px-4 py-2.5 pr-8 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-black-400">%</span>
              </div>
              <p className="text-[10px] text-black-400 mt-1">Charged to customer at checkout</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">
                Fixed fee (₦)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={fixedNgn}
                onChange={(e) => setFixedNgn(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
              />
              <p className="text-[10px] text-black-400 mt-1">Flat fee added to customer total</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">
                Merchant charge %
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={merchantChargePct}
                  onChange={(e) => setMerchantChargePct(e.target.value)}
                  className="w-full px-4 py-2.5 pr-8 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-black-400">%</span>
              </div>
              <p className="text-[10px] text-black-400 mt-1">Deducted from merchant settlement (% of order total)</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">
                Hold period (hours)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={holdHours}
                onChange={(e) => setHoldHours(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          {settingsError && (
            <p className="text-xs text-cinnabar-500">{settingsError}</p>
          )}
          <button
            type="submit"
            disabled={savingSettings}
            className="bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            {savingSettings ? "Saving…" : settingsSaved ? "✓ Saved!" : "Save configuration"}
          </button>
        </form>
      </div>

      {/* Delivery pricing config */}
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200">
          <h2 className="font-bold text-black-900 text-sm">Delivery Pricing</h2>
          <p className="text-xs text-black-400 mt-0.5">
            Formula: Base fee + (distance × per-km rate), capped at max fee
          </p>
        </div>
        <form onSubmit={saveDeliverySettings} className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">Base fee (₦)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={baseFeeNgn}
                onChange={(e) => setBaseFeeNgn(e.target.value)}
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
                className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">Max radius (km)</label>
              <input
                type="number"
                step="1"
                min="1"
                max="100"
                value={maxRadius}
                onChange={(e) => setMaxRadius(e.target.value)}
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
                className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">Delivery commission — default (%)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={deliveryCommissionPct}
                  onChange={(e) => setDeliveryCommissionPct(e.target.value)}
                  className="w-full px-3 py-2.5 pr-8 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-black-400">%</span>
              </div>
              <p className="text-[10px] text-black-400 mt-1">
                Platform-wide default for in-house (own/3rd-party rider) deliveries. Per-merchant
                overrides are set on Settlements → Merchants.
              </p>
            </div>
          </div>

          {/* Live formula preview */}
          <div className="bg-black-50 rounded-xl px-4 py-3 text-xs text-black-500">
            <span className="font-medium text-black-700">Preview: </span>
            at 3km → {previewFee(3)} &nbsp;|&nbsp;
            at 7km → {previewFee(7)} &nbsp;|&nbsp;
            at 15km → {previewFee(15)}
          </div>

          {deliveryError && <p className="text-xs text-cinnabar-500">{deliveryError}</p>}
          <button
            type="submit"
            disabled={savingDelivery}
            className="bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            {savingDelivery ? "Saving…" : deliverySaved ? "Saved!" : "Save delivery pricing"}
          </button>
        </form>
      </div>

      {/* ── Dispatch ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200">
          <h2 className="font-bold text-black-900 text-sm">Dispatch</h2>
          <p className="text-xs text-black-400 mt-0.5">
            Two independent things. <strong>When</strong> we go looking for a
            rider is the timer below. <strong>How</strong> we ask — our system
            booking the Bolt ride itself, or a note in the Telegram group for
            someone to book by hand — is the automated-booking switch. Merchants
            can&apos;t tell the difference either way, so the switch is safe to
            flip mid-service.
          </p>
        </div>
        <form onSubmit={saveDispatchSettings} className="px-4 py-4 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={timedRequests}
              onChange={(e) => setTimedRequests(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-purple-500 cursor-pointer"
            />
            <span>
              <span className="block text-sm font-semibold text-black-900">
                Request riders on a timer
              </span>
              <span className="block text-xs text-black-400 mt-0.5 leading-relaxed">
                For merchants set to &ldquo;Kitchyn delivers&rdquo;, go and get a
                rider shortly before the food is ready instead of waiting for the
                merchant to mark it ready. Off = riders are requested exactly as
                they were before — this is the kill switch.
              </span>
            </span>
          </label>

          <div>
            <label className="block text-xs font-semibold text-black-500 mb-1">
              Lead time (minutes before food is ready)
            </label>
            <input
              type="number"
              min="0"
              max="120"
              value={leadMinutes}
              onChange={(e) => setLeadMinutes(e.target.value)}
              className="w-32 border border-black-200 rounded-xl px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-black-400 mt-1">
              Platform default. Individual merchants can override it — a store far
              from where riders wait needs longer.
            </p>
          </div>

          <hr className="border-black-100" />

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={boltEnabled}
              onChange={(e) => setBoltEnabled(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-purple-500 cursor-pointer"
            />
            <span>
              <span className="block text-sm font-semibold text-black-900">
                Automated Bolt booking
              </span>
              <span className="block text-xs text-black-400 mt-0.5 leading-relaxed">
                On = we book the ride through Bolt&apos;s API. Off = the request
                goes to the Telegram group and a person books it, exactly as
                today.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={boltShadow}
              onChange={(e) => setBoltShadow(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-purple-500 cursor-pointer"
            />
            <span>
              <span className="block text-sm font-semibold text-black-900">
                Shadow mode
              </span>
              <span className="block text-xs text-black-400 mt-0.5 leading-relaxed">
                Work out and record what we <em>would</em> book, and book nothing.
                No money moves. The Telegram note still goes out, so deliveries
                keep happening.
              </span>
            </span>
          </label>

          <div>
            <label className="block text-xs font-semibold text-black-500 mb-1">
              Bolt environment
            </label>
            <select
              value={boltEnv}
              onChange={(e) => setBoltEnv(e.target.value)}
              className="border border-black-200 rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="sandbox">Sandbox (fake rides, no cost)</option>
              <option value="production">Production (real rides, real money)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-black-500 mb-1">
              Rider contact number
            </label>
            <input
              type="tel"
              value={boltRiderPhone}
              onChange={(e) => setBoltRiderPhone(e.target.value)}
              placeholder="+2348012345678"
              className="w-48 border border-black-200 rounded-xl px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-black-400 mt-1">
              Registered as the &ldquo;rider&rdquo; on every automated Bolt
              booking — never the customer&apos;s number. Bolt calls/SMSes this
              line directly. Takes effect on the next booking as soon as you
              save, no deploy needed.
            </p>
          </div>

          {boltEnabled && !boltShadow && boltEnv === "production" && (
            <p className="text-xs font-semibold text-cinnabar-700 bg-cinnabar-50 rounded-xl px-3 py-2">
              Live: saving this books real Bolt rides and spends real money.
            </p>
          )}

          {dispatchError && (
            <p className="text-xs text-cinnabar-600 font-medium">{dispatchError}</p>
          )}
          <button
            type="submit"
            disabled={savingDispatch}
            className="bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            {savingDispatch ? "Saving…" : dispatchSaved ? "Saved!" : "Save dispatch settings"}
          </button>
        </form>
      </div>

      {/* ── Testing (dev tool) ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-200">
          <h2 className="font-bold text-black-900 text-sm">Testing</h2>
          <p className="text-xs text-black-400 mt-0.5">
            Drop a fake new order on CopperPot. It appears in the live orders
            queue (realtime) and fires a push notification — the fast way to
            test the merchant app without paying for a real order.
          </p>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => sendTestOrder("pickup")}
              disabled={testLoading}
              className="bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {testLoading ? "Sending…" : "Send test PICKUP order"}
            </button>
            <button
              type="button"
              onClick={() => sendTestOrder("delivery")}
              disabled={testLoading}
              className="bg-black-900 hover:bg-black-700 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {testLoading ? "Sending…" : "Send test DELIVERY order"}
            </button>
          </div>
          <p className="text-[11px] text-black-400 leading-relaxed">
            Use the delivery one to test dispatch — a pickup order never gets a
            rider, so it can&apos;t exercise any of it. The delivery order is
            given a drop-off about 1.5km from the store.
          </p>
          {testResult && (
            <p className="text-xs font-medium text-black-700">{testResult}</p>
          )}
        </div>
      </div>
    </div>
  );
}
