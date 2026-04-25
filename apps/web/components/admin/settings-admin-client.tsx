"use client";

import { useState } from "react";

type PlatformSettings = {
  service_charge_pct: number;
  service_charge_fixed_kobo: number;
  settlement_hold_hours: number;
  delivery_base_fee_kobo?: number | null;
  delivery_per_km_rate_kobo?: number | null;
  delivery_max_radius_km?: number | null;
  delivery_max_fee_kobo?: number | null;
  delivery_commission_pct?: number | null;
  admin_whatsapp_number?: string | null;
  admin_alert_email?: string | null;
} | null;

interface SettingsAdminClientProps {
  settings: PlatformSettings;
}

export function SettingsAdminClient({ settings }: SettingsAdminClientProps) {
  // Service charge config form state
  const [pct, setPct] = useState(
    settings ? (Number(settings.service_charge_pct) * 100).toFixed(1) : "3.0"
  );
  const [fixedNgn, setFixedNgn] = useState(
    settings ? (settings.service_charge_fixed_kobo / 100).toFixed(0) : "0"
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">
                Service charge %
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
              <label className="block text-xs font-medium text-black-500 mb-1">Delivery commission (%)</label>
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
    </div>
  );
}
