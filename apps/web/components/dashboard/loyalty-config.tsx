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
import {
  Stamp,
  Gift,
  Check,
  Search,
  X,
  ShoppingBag,
  Coffee,
  Sparkles,
  Tag,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatLoyaltyReward } from "@foodo/utils";
import type { LoyaltyProgram } from "@foodo/database";
import { StampGrid } from "@/components/storefront/loyalty-progress-card";

const BRAND_GRADIENT = "linear-gradient(140deg, #10002B 0%, #3C096C 55%, #7B2CBF 100%)";

const INPUT_CLS =
  "w-full px-3.5 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 bg-white transition";

/** Minimal menu item shape used by the loyalty item pickers. */
export type LoyaltyMenuItem = {
  id: string;
  name: string;
  price_kobo: number;
  category_id: string | null;
  is_available: boolean;
};

const REWARD_TYPES: { value: string; label: string; hint: string }[] = [
  { value: "free_delivery", label: "Free delivery", hint: "Waive the delivery fee" },
  { value: "free_item", label: "A free item", hint: "Give a menu item on the house" },
  { value: "percentage", label: "% off the order", hint: "A percentage discount" },
  { value: "fixed", label: "Fixed amount off", hint: "A flat naira discount" },
];

type FormState = {
  is_active: boolean;
  stamps_required: string;
  earn_min_order_naira: string;
  earn_scope: string; // "order" | "item"
  earn_item_ids: string[];
  reward_type: string;
  reward_value: string; // percent, or naira for fixed
  reward_max_discount_naira: string;
  reward_item_ids: string[];
  reward_label: string;
};

function toForm(p: LoyaltyProgram | null): FormState {
  return {
    is_active: p?.is_active ?? false,
    stamps_required: String(p?.stamps_required ?? 10),
    earn_min_order_naira: p?.earn_min_order_kobo ? String(p.earn_min_order_kobo / 100) : "",
    earn_scope: p?.earn_scope ?? "order",
    earn_item_ids: p?.earn_item_ids ?? [],
    reward_type: p?.reward_type ?? "free_delivery",
    reward_value:
      p?.reward_type === "fixed" && p.reward_value != null
        ? String(p.reward_value / 100)
        : p?.reward_value != null
        ? String(p.reward_value)
        : "",
    reward_max_discount_naira: p?.reward_max_discount_kobo ? String(p.reward_max_discount_kobo / 100) : "",
    reward_item_ids: p?.reward_item_ids ?? [],
    reward_label: p?.reward_label ?? "",
  };
}

export function LoyaltyConfig({
  restaurantId,
  initialProgram,
  menuItems,
}: {
  restaurantId: string;
  initialProgram: LoyaltyProgram | null;
  menuItems: LoyaltyMenuItem[];
}) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [program, setProgram] = useState<LoyaltyProgram | null>(initialProgram);
  const [form, setForm] = useState<FormState>(toForm(initialProgram));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(0);

  const usesValue = form.reward_type === "percentage" || form.reward_type === "fixed";
  const stampsNum = parseInt(form.stamps_required, 10) || 0;

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

  function toggleId(key: "earn_item_ids" | "reward_item_ids", id: string) {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id],
    }));
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
      earn_scope: form.earn_scope,
      earn_item_ids: form.earn_scope === "item" ? form.earn_item_ids : [],
      reward_item_ids: form.reward_type === "free_item" ? form.reward_item_ids : [],
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
    <div className="mt-4 grid max-w-5xl grid-cols-1 gap-5 px-4 lg:grid-cols-[1fr_320px]">
      {/* ── Form column ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-cinnabar-200 bg-cinnabar-100 px-4 py-2.5 text-sm text-cinnabar-500">
            <X size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Section: enable */}
        <Section
          icon={<Sparkles size={16} />}
          title="Stamp card"
          subtitle="Reward repeat customers automatically — no codes, no apps."
        >
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-black-900">Enable loyalty program</p>
              <p className="mt-0.5 text-xs text-black-400">
                Customers start earning stamps on every paid order, keyed by their phone.
              </p>
            </div>
            <button
              type="button"
              onClick={() => set("is_active", !form.is_active)}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
                form.is_active ? "bg-purple-500" : "bg-black-200"
              }`}
              aria-pressed={form.is_active}
              aria-label="Enable loyalty program"
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  form.is_active ? "translate-x-5" : ""
                }`}
              />
            </button>
          </label>
        </Section>

        {/* Section: how customers earn */}
        <Section
          icon={<Stamp size={16} />}
          title="How customers earn"
          subtitle="Set the goal and what counts toward a stamp."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stamps to unlock">
              <input
                type="number"
                min={2}
                max={100}
                value={form.stamps_required}
                onChange={(e) => set("stamps_required", e.target.value)}
                className={INPUT_CLS}
                placeholder="10"
              />
            </Field>
            <Field label="Min order to earn (₦)">
              <input
                type="number"
                min={0}
                value={form.earn_min_order_naira}
                onChange={(e) => set("earn_min_order_naira", e.target.value)}
                className={INPUT_CLS}
                placeholder="Any order"
              />
            </Field>
          </div>

          <Field label="What earns a stamp">
            <div className="grid grid-cols-2 gap-2">
              <ScopeChoice
                active={form.earn_scope === "order"}
                onClick={() => set("earn_scope", "order")}
                icon={<ShoppingBag size={16} />}
                title="Any order"
                desc="1 stamp per order"
              />
              <ScopeChoice
                active={form.earn_scope === "item"}
                onClick={() => set("earn_scope", "item")}
                icon={<Coffee size={16} />}
                title="Specific item"
                desc="e.g. each coffee"
              />
            </div>
          </Field>

          {form.earn_scope === "item" && (
            <Field label="Items that earn a stamp">
              <ItemPicker
                items={menuItems}
                selected={form.earn_item_ids}
                onToggle={(id) => toggleId("earn_item_ids", id)}
                emptyHint="Add menu items first to choose which ones earn a stamp."
              />
            </Field>
          )}
        </Section>

        {/* Section: the reward */}
        <Section
          icon={<Gift size={16} />}
          title="The reward"
          subtitle="What customers get when the card is full."
        >
          <Field label="Reward type">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REWARD_TYPES.map((r) => (
                <ScopeChoice
                  key={r.value}
                  active={form.reward_type === r.value}
                  onClick={() => set("reward_type", r.value)}
                  icon={<Tag size={16} />}
                  title={r.label}
                  desc={r.hint}
                />
              ))}
            </div>
          </Field>

          {form.reward_type === "free_item" && (
            <Field label="Which item is free">
              <ItemPicker
                items={menuItems}
                selected={form.reward_item_ids}
                onToggle={(id) => toggleId("reward_item_ids", id)}
                emptyHint="Add menu items first to choose which one is free."
              />
            </Field>
          )}

          {usesValue && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={form.reward_type === "percentage" ? "Percent off (%)" : "Amount off (₦)"}>
                <input
                  type="number"
                  min={0}
                  value={form.reward_value}
                  onChange={(e) => set("reward_value", e.target.value)}
                  className={INPUT_CLS}
                  placeholder={form.reward_type === "percentage" ? "20" : "1000"}
                />
              </Field>
              {form.reward_type === "percentage" && (
                <Field label="Max discount (₦, optional)">
                  <input
                    type="number"
                    min={0}
                    value={form.reward_max_discount_naira}
                    onChange={(e) => set("reward_max_discount_naira", e.target.value)}
                    className={INPUT_CLS}
                    placeholder="No cap"
                  />
                </Field>
              )}
            </div>
          )}

          <Field
            label={
              form.reward_type === "free_item"
                ? "Reward label (name the item)"
                : "Reward label (optional)"
            }
          >
            <input
              value={form.reward_label}
              onChange={(e) => set("reward_label", e.target.value)}
              className={INPUT_CLS}
              placeholder={
                form.reward_type === "free_item" ? "e.g. Free regular meal" : "Shown to customers"
              }
            />
          </Field>
        </Section>

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={save}
            disabled={saving}
            className="cursor-pointer rounded-xl bg-purple-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-600 disabled:opacity-60"
          >
            {saving ? "Saving…" : program ? "Save changes" : "Create program"}
          </button>
          {justSaved && (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-viridian-500">
              <Check size={15} strokeWidth={3} /> Saved
            </span>
          )}
        </div>
      </div>

      {/* ── Live preview column (sticky on desktop) ─────────────────── */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-black-400">
          <Sparkles size={12} /> Live preview
        </p>
        <div
          className="relative overflow-hidden rounded-3xl p-5 text-white shadow-lg"
          style={{ background: BRAND_GRADIENT }}
        >
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full"
            style={{ background: "rgba(255,255,255,0.07)" }}
          />
          <div
            className="pointer-events-none absolute -bottom-12 -left-10 h-36 w-36 rounded-full"
            style={{ background: "rgba(255,255,255,0.05)" }}
          />
          <div className="relative">
            <div className="mb-3 flex items-center gap-1.5">
              <Stamp size={14} className="text-white/80" strokeWidth={2.5} />
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/70">
                Loyalty card
              </span>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  form.is_active ? "bg-viridian-100 text-viridian-500" : "bg-white/15 text-white/70"
                }`}
              >
                {form.is_active ? "Active" : "Off"}
              </span>
            </div>

            <p className="text-xl font-black leading-tight text-white">
              Collect {stampsNum || "—"} stamps
            </p>
            <p className="mt-1 text-sm text-white/70">
              Reward: <span className="font-bold text-white">{previewLabel}</span>
            </p>

            <div className="mt-4">
              <StampGrid required={stampsNum} filled={0} variant="dark" />
            </div>

            <p className="mt-3 text-[11px] leading-snug text-white/50">
              {stampsNum > 12
                ? `Showing 12 of ${stampsNum} stamps · the last one is the reward.`
                : "The last slot is the reward."}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-black-400">
          Customers earn stamps automatically on paid orders. The reward applies itself at checkout
          once they qualify.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Layout helpers                                                      */
/* ------------------------------------------------------------------ */

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-black-100 bg-white p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-500">
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-bold text-black-900">{title}</h3>
          <p className="mt-0.5 text-xs text-black-400">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-black-500">
        {label}
      </label>
      {children}
    </div>
  );
}

/** A selectable tile used for earn-scope and reward-type choices. */
function ScopeChoice({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-left transition ${
        active
          ? "border-purple-500 bg-purple-50 ring-1 ring-purple-500"
          : "border-black-200 bg-white hover:border-purple-200 hover:bg-purple-50"
      }`}
      aria-pressed={active}
    >
      <span
        className={`mt-0.5 flex-shrink-0 ${active ? "text-purple-500" : "text-black-400"}`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${active ? "text-purple-700" : "text-black-900"}`}>
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-black-400">{desc}</span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Premium multi-select item picker                                   */
/*  Selected items shown as removable chips; searchable scrollable list */
/* ------------------------------------------------------------------ */

function ItemPicker({
  items,
  selected,
  onToggle,
  emptyHint,
}: {
  items: LoyaltyMenuItem[];
  selected: string[];
  onToggle: (id: string) => void;
  emptyHint: string;
}) {
  const [query, setQuery] = useState("");

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-black-200 bg-black-50 px-3.5 py-3 text-xs text-black-400">
        {emptyHint}
      </p>
    );
  }

  const selectedItems = items.filter((i) => selected.includes(i.id));
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;

  return (
    <div className="space-y-2.5">
      {/* Selected chips */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 py-1 pl-3 pr-1.5 text-xs font-semibold text-purple-700 ring-1 ring-purple-100"
            >
              {item.name}
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                aria-label={`Remove ${item.name}`}
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-purple-400 transition hover:bg-purple-100 hover:text-purple-700"
              >
                <X size={11} strokeWidth={3} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search + list */}
      <div className="overflow-hidden rounded-xl border border-black-200">
        <div className="flex items-center gap-2 border-b border-black-100 px-3 py-2">
          <Search size={14} className="flex-shrink-0 text-black-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search menu items…"
            className="w-full bg-transparent text-sm text-black-900 placeholder:text-black-400 focus:outline-none"
          />
        </div>
        <div className="max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3.5 py-4 text-center text-xs text-black-400">
              No items match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            filtered.map((item) => {
              const on = selected.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggle(item.id)}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition ${
                    on ? "bg-purple-50" : "hover:bg-black-50"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-md border transition ${
                      on ? "border-purple-500 bg-purple-500" : "border-black-200 bg-white"
                    }`}
                  >
                    {on && <Check size={11} strokeWidth={3} className="text-white" />}
                  </span>
                  <span
                    className={`flex-1 truncate text-sm ${
                      on ? "font-semibold text-purple-700" : "text-black-900"
                    }`}
                  >
                    {item.name}
                    {!item.is_available && (
                      <span className="ml-1.5 text-[11px] font-medium text-black-400">
                        (unavailable)
                      </span>
                    )}
                  </span>
                  {item.price_kobo > 0 && (
                    <span className="flex-shrink-0 text-xs text-black-400">
                      ₦{(item.price_kobo / 100).toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
