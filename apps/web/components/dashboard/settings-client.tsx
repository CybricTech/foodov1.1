"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@foodo/ui";
import type { Restaurant } from "@foodo/database";

export function SettingsClient({ restaurant }: { restaurant: Restaurant }) {
  const supabase = createBrowserClient();

  const [name, setName] = useState(restaurant.name);
  const [description, setDescription] = useState(restaurant.description ?? "");
  const [phone, setPhone] = useState(restaurant.phone ?? "");
  const [address, setAddress] = useState(restaurant.address ?? "");
  const [primaryColor, setPrimaryColor] = useState(
    restaurant.primary_color ?? "#2D6A4F"
  );
  const [minOrderNgn, setMinOrderNgn] = useState(
    restaurant.min_order_amount
      ? (restaurant.min_order_amount / 100).toString()
      : ""
  );
  const [deliveryFeeNgn, setDeliveryFeeNgn] = useState(
    (restaurant as Restaurant & { delivery_fee?: number }).delivery_fee
      ? (((restaurant as Restaurant & { delivery_fee?: number }).delivery_fee ?? 0) / 100).toString()
      : ""
  );
  const [logisticsDefault, setLogisticsDefault] = useState(
    restaurant.logistics_default
  );
  const [acceptsOrders, setAcceptsOrders] = useState(
    restaurant.accepts_orders
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");

    const { error: updateError } = await supabase
      .from("restaurants")
      .update({
        name,
        description: description || null,
        phone: phone || null,
        address: address || null,
        primary_color: primaryColor,
        min_order_amount: minOrderNgn
          ? Math.round(parseFloat(minOrderNgn) * 100)
          : null,
        logistics_default: logisticsDefault,
        accepts_orders: acceptsOrders,
      })
      .eq("id", restaurant.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  return (
    <div className="md:p-6 pb-32">
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
          <Field label="Address">
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Field>
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
              onChange={(e) =>
                setLogisticsDefault(
                  e.target.value as Restaurant["logistics_default"]
                )
              }
              className={cn(inputCls, "bg-white")}
            >
              <option value="platform_rider">Platform Rider</option>
              <option value="own_rider">Own Rider</option>
              <option value="third_party">Third-Party (Kwik etc.)</option>
            </select>
          </Field>
          <div className="flex items-center justify-between py-3 border-t border-black-100">
            <div>
              <p className="text-sm font-medium text-black-900">
                Accept orders
              </p>
              <p className="text-xs text-black-400">
                Toggle off to pause ordering without deleting anything
              </p>
            </div>
            <button
              onClick={() => setAcceptsOrders((v) => !v)}
              className={cn(
                "relative w-12 h-6 rounded-full transition-colors flex-shrink-0",
                acceptsOrders ? "bg-viridian-500" : "bg-black-200"
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

        {error && (
          <p className="text-sm text-cinnabar-500">{error}</p>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:left-60 bg-white border-t border-black-100 px-4 md:px-6 py-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full md:max-w-xs bg-viridian-500 hover:bg-viridian-500/90 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {saving ? "Saving…" : saved ? "✓ Saved!" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-black-100">
        <h2 className="font-semibold text-black-900 text-sm">{title}</h2>
      </div>
      <div className="px-4 py-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-black-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-viridian-500";
