"use client";

/**
 * Merchant loyalty (stamp-card) configuration.
 *
 * One program per restaurant. Writes go through the browser Supabase client
 * under the loyalty_programs_merchant RLS policy (own restaurant only), so no
 * extra API route is needed. The form mirrors the discount engine's reward
 * shapes; formatLoyaltyReward keeps the live preview identical to what the
 * customer will eventually see.
 */
import { useMemo, useState } from "react";
import { Stamp, Gift, Check } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatLoyaltyReward } from "@foodo/utils";
import type { LoyaltyProgram } from "@foodo/database";

const INPUT_CLS =
  "w-full px-3.5 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 bg-white";

const REWARD_TYPES: { value: string; label: string }[] = [
  { value: "free_delivery", label: "Free delivery" },
  { value: "free_item", label: "A free item" },
  { value: "percentage", label: "% off the order" },
  { value: "fixed", label: "Fixed amount off" },
];

type FormState = {
  is_active: boolean;
  stamps_required: string;
  earn_min_order_naira: string;
  reward_type: string;
  reward_value: string; // percent, or naira for fixed
  reward_max_discount_naira: string;
  reward_label: string;
};

function toForm(p: LoyaltyProgram | null): FormState {
  return {
    is_active: p?.is_active ?? false,
    stamps_required: String(p?.stamps_required ?? 10),
    earn_min_order_naira: p?.earn_min_order_kobo ? String(p.earn_min_order_kobo / 100) : "",
    reward_type: p?.reward_type ?? "free_delivery",
    reward_value:
      p?.reward_type === "fixed" && p.reward_value != null
        ? String(p.reward_value / 100)
        : p?.reward_value != null
        ? String(p.reward_value)
        : "",
    reward_max_discount_naira: p?.reward_max_discount_kobo ? String(p.reward_max_discount_kobo / 100) : "",
    reward_label: p?.reward_label ?? "",
  };
}

export function LoyaltyConfig({
  restaurantId,
  initialProgram,
}: {
  restaurantId: string;
  initialProgram: LoyaltyProgram | null;
}) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [program, setProgram] = useState<LoyaltyProgram | null>(initialProgram);
  const [form, setForm] = useState<FormState>(toForm(initialProgram));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(0);

  const usesValue = form.reward_type === "percentage" || form.reward_type === "fixed";

  // Live preview reward label from the current form.
  const previewLabel = useMemo(
    () =>
      formatLoyaltyReward({
        reward_type: form.reward_type,
        reward_value:
          form.reward_type === "fixed"
            ? Math.round((parseFloat(form.reward_value) || 0) * 100)
            : parseInt(form.reward_value, 10) || 0,
        reward_label: form.reward_label || null,
      }),
    [form.reward_type, form.reward_value, form.reward_label]
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setError("");
    const stamps = parseInt(form.stamps_required, 10);
    if (!stamps || stamps < 2 || stamps > 100) {
      setError("Stamps required must be between 2 and 100.");
      return;
    }
    if (form.reward_type === "percentage") {
      const v = parseInt(form.reward_value, 10);
      if (!v || v < 1 || v > 100) {
        setError("Percentage must be between 1 and 100.");
        return;
      }
    }
    if (form.reward_type === "fixed") {
      const v = parseFloat(form.reward_value);
      if (!v || v <= 0) {
        setError("Enter a valid amount off.");
        return;
      }
    }

    const payload = {
      restaurant_id: restaurantId,
      is_active: form.is_active,
      stamps_required: stamps,
      earn_min_order_kobo: form.earn_min_order_naira
        ? Math.round(parseFloat(form.earn_min_order_naira) * 100) || 0
        : 0,
      reward_type: form.reward_type,
      reward_value:
        form.reward_type === "percentage"
          ? parseInt(form.reward_value, 10)
          : form.reward_type === "fixed"
          ? Math.round(parseFloat(form.reward_value) * 100)
          : null,
      reward_max_discount_kobo:
        form.reward_type === "percentage" && form.reward_max_discount_naira
          ? Math.round(parseFloat(form.reward_max_discount_naira) * 100)
          : null,
      reward_label: form.reward_label.trim() || null,
    };

    setSaving(true);
    try {
      const { data, error: e } = await supabase
        .from("loyalty_programs")
        .upsert(payload, { onConflict: "restaurant_id" })
        .select("*")
        .single();
      if (e) throw e;
      setProgram(data as LoyaltyProgram);
      setForm(toForm(data as LoyaltyProgram));
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const justSaved = savedAt > 0 && Date.now() - savedAt < 4000;

  return (
    <div className="mt-4 px-4 max-w-2xl">
      {/* Hero preview card */}
      <div
        className="rounded-3xl overflow-hidden relative p-6 mb-5"
        style={{ background: "linear-gradient(140deg, #10002B 0%, #3C096C 55%, #7B2CBF 100%)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Stamp size={15} className="text-white/80" />
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/70">
            Loyalty card
          </span>
          <span
            className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              form.is_active ? "bg-viridian-100 text-viridian-600" : "bg-white/15 text-white/70"
            }`}
          >
            {form.is_active ? "Active" : "Off"}
          </span>
        </div>
        <p className="text-white text-xl font-black leading-tight">
          Collect {form.stamps_required || "—"} stamps
        </p>
        <p className="text-white/70 text-sm mt-1">
          Reward: <span className="font-semibold text-white">{previewLabel}</span>
        </p>
        {/* Stamp dots */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {Array.from({ length: Math.min(parseInt(form.stamps_required, 10) || 0, 20) }).map((_, i) => (
            <span
              key={i}
              className="w-5 h-5 rounded-full border border-white/30 flex items-center justify-center"
            >
              {i === (parseInt(form.stamps_required, 10) || 0) - 1 ? (
                <Gift size={11} className="text-white/80" />
              ) : null}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-cinnabar-600 bg-cinnabar-50 border border-cinnabar-200 rounded-xl px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Form */}
      <div className="space-y-4 bg-white border border-black-100 rounded-2xl p-5">
        {/* Active toggle */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <p className="text-sm font-semibold text-black-900">Enable loyalty program</p>
            <p className="text-xs text-black-400 mt-0.5">Customers start earning stamps on every paid order.</p>
          </div>
          <button
            type="button"
            onClick={() => set("is_active", !form.is_active)}
            className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active ? "bg-purple-600" : "bg-black-200"}`}
            aria-pressed={form.is_active}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${form.is_active ? "translate-x-5" : ""}`}
            />
          </button>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">
              Stamps to unlock
            </label>
            <input
              type="number"
              min={2}
              max={100}
              value={form.stamps_required}
              onChange={(e) => set("stamps_required", e.target.value)}
              className={INPUT_CLS}
              placeholder="10"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">
              Min order to earn (₦)
            </label>
            <input
              type="number"
              min={0}
              value={form.earn_min_order_naira}
              onChange={(e) => set("earn_min_order_naira", e.target.value)}
              className={INPUT_CLS}
              placeholder="Any order"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">
            Reward
          </label>
          <select
            value={form.reward_type}
            onChange={(e) => set("reward_type", e.target.value)}
            className={INPUT_CLS}
          >
            {REWARD_TYPES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {usesValue && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">
                {form.reward_type === "percentage" ? "Percent off (%)" : "Amount off (₦)"}
              </label>
              <input
                type="number"
                min={0}
                value={form.reward_value}
                onChange={(e) => set("reward_value", e.target.value)}
                className={INPUT_CLS}
                placeholder={form.reward_type === "percentage" ? "20" : "1000"}
              />
            </div>
            {form.reward_type === "percentage" && (
              <div>
                <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">
                  Max discount (₦, optional)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.reward_max_discount_naira}
                  onChange={(e) => set("reward_max_discount_naira", e.target.value)}
                  className={INPUT_CLS}
                  placeholder="No cap"
                />
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">
            Reward label {form.reward_type === "free_item" ? "(name the item)" : "(optional)"}
          </label>
          <input
            value={form.reward_label}
            onChange={(e) => set("reward_label", e.target.value)}
            className={INPUT_CLS}
            placeholder={form.reward_type === "free_item" ? "e.g. Free regular meal" : "Shown to customers"}
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={save}
            disabled={saving}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            {saving ? "Saving…" : program ? "Save changes" : "Create program"}
          </button>
          {justSaved && (
            <span className="flex items-center gap-1 text-sm text-viridian-600 font-medium">
              <Check size={15} /> Saved
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-black-400 mt-3">
        Customers earn stamps automatically on paid orders (keyed by phone). Redemption at
        checkout and customer reminders come next.
      </p>
    </div>
  );
}
