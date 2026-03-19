"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useCartStore } from "@/lib/stores/cart";
import { useRestaurant } from "@/components/storefront/restaurant-context";
import { normalizeToE164, formatKobo } from "@foodo/utils";
import { cn } from "@foodo/ui";

const CustomerSchema = z.object({
  phone: z.string().min(10, "Enter a valid phone number"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

export default function CheckoutPage() {
  const router = useRouter();
  const { restaurant } = useRestaurant();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotalKobo)();
  const clearCart = useCartStore((s) => s.clear);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Fulfillment
  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // Customer info
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  // Redirect if cart is empty
  useEffect(() => {
    if (items.length === 0) router.replace(`/${restaurant.slug}`);
  }, [items.length, restaurant.slug, router]);

  if (items.length === 0) return null;

  // Pre-fill from CRM on phone blur
  async function handlePhoneBlur() {
    const normalized = normalizeToE164(phone);
    if (!normalized) return;
    try {
      const res = await fetch(
        `/api/customers/lookup?phone=${encodeURIComponent(normalized)}&restaurantId=${restaurant.id}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.full_name) {
          const parts = (data.full_name as string).split(" ");
          if (!firstName) setFirstName(parts[0] ?? "");
          if (!lastName) setLastName(parts.slice(1).join(" "));
        }
        if (data.email && !email) setEmail(data.email);
      }
    } catch {
      // silent — pre-fill is best-effort
    }
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    const result = CustomerSchema.safeParse({ phone, firstName, lastName, email });
    if (!result.success) {
      result.error.issues.forEach((i) => {
        errors[i.path[0] as string] = i.message;
      });
    }
    if (fulfillmentType === "delivery" && !deliveryAddress.trim()) {
      errors.deliveryAddress = "Delivery address is required";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handlePay() {
    if (!validate()) return;
    setLoading(true);
    setError("");

    try {
      const normalizedPhone = normalizeToE164(phone);
      const res = await fetch("/api/checkout/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          customerName: `${firstName} ${lastName}`.trim(),
          customerPhone: normalizedPhone,
          customerEmail: email || undefined,
          fulfillmentType,
          deliveryAddress: deliveryAddress || undefined,
          items: items.map((item) => ({
            menuItemId: item.menuItemId,
            name: item.name,
            priceKobo: item.price,
            quantity: item.quantity,
            selectedOptions: item.selectedOptions,
            specialRequest: item.specialRequest,
          })),
        }),
      });

      const initData = await res.json();
      if (!res.ok) {
        setError(initData.error ?? "Payment initialization failed");
        setLoading(false);
        return;
      }

      const PaystackPop = await loadPaystackScript();
      const handler = PaystackPop.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY!,
        email: email || `${normalizedPhone?.replace(/\D/g, "")}@foodo.ng`,
        amount: initData.totalKobo,
        currency: "NGN",
        ref: initData.paystackRef,
        access_code: initData.accessCode,
        onSuccess: () => {
          clearCart();
          router.push(`/${restaurant.slug}/orders/pending?ref=${initData.paystackRef}`);
        },
        onCancel: () => {
          setError("Payment was cancelled. You can try again.");
          setLoading(false);
        },
      });
      handler.openIframe();
    } catch (e) {
      console.error(e);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const deliveryFee = restaurant.delivery_fee ?? 0;
  const total = subtotal + (fulfillmentType === "delivery" ? deliveryFee : 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="min-h-screen bg-black-50 pb-32">
      {/* Header */}
      <div className="bg-white border-b border-black-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-black-500 hover:text-black-900 text-lg">
          ←
        </button>
        <h1 className="font-bold text-black-900 text-lg">Checkout</h1>
      </div>

      <div className="px-4 mt-5 space-y-5">
        {/* Order type card */}
        <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
          {/* Pickup / Delivery toggle */}
          <div className="p-4 border-b border-black-100">
            <div className="flex bg-black-100 rounded-xl p-1 gap-1">
              {(["pickup", "delivery"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFulfillmentType(type)}
                  className={cn(
                    "flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize transition-colors",
                    fulfillmentType === type
                      ? "bg-white text-black-900 shadow-sm"
                      : "text-black-400 hover:text-black-600"
                  )}
                >
                  {type === "pickup" ? "Pickup" : "Delivery"}
                </button>
              ))}
            </div>
          </div>

          {/* Pickup address OR delivery address input */}
          {fulfillmentType === "pickup" ? (
            <div className="px-4 py-4 flex items-start gap-3">
              <span className="text-lg mt-0.5">🏪</span>
              <div>
                <p className="text-xs text-black-400 mb-0.5">Pick up from</p>
                <p className="text-sm font-semibold text-black-900">
                  {restaurant.address ?? restaurant.name}
                </p>
                {restaurant.estimated_delivery_minutes && (
                  <p className="text-xs text-black-400 mt-1">
                    Ready in ~{restaurant.estimated_delivery_minutes} min
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="px-4 py-4">
              <label className="block text-xs text-black-400 mb-1.5">Delivery address</label>
              <textarea
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Enter your full delivery address..."
                rows={2}
                className={inputClass(!!fieldErrors.deliveryAddress)}
              />
              {fieldErrors.deliveryAddress && (
                <p className="mt-1 text-xs text-cinnabar-500">{fieldErrors.deliveryAddress}</p>
              )}
            </div>
          )}

          {/* Order totals */}
          <div className="border-t border-black-100">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-black-500">
                <span>🛒</span>
                <span>{itemCount} {itemCount === 1 ? "item" : "items"}</span>
              </div>
              <span className="text-sm font-semibold text-black-900">{formatKobo(subtotal)}</span>
            </div>
            {fulfillmentType === "delivery" && (
              <div className="px-4 py-3 flex items-center justify-between border-t border-black-100">
                <span className="text-sm text-black-500">Delivery fee</span>
                <span className="text-sm font-semibold text-black-900">{formatKobo(deliveryFee)}</span>
              </div>
            )}
            <div className="px-4 py-3 flex items-center justify-between border-t border-black-100">
              <span className="text-sm font-bold text-black-900">Total</span>
              <span className="text-sm font-bold text-black-900">{formatKobo(total)}</span>
            </div>
          </div>
        </div>

        {/* Your information */}
        <div>
          <h2 className="text-base font-bold text-black-900 mb-3">Your information</h2>
          <div className="space-y-3">
            <Field label="Mobile number" error={fieldErrors.phone}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={handlePhoneBlur}
                placeholder="e.g. 0812 345 6789"
                className={inputClass(!!fieldErrors.phone)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" error={fieldErrors.firstName}>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  className={inputClass(!!fieldErrors.firstName)}
                />
              </Field>
              <Field label="Last name" error={fieldErrors.lastName}>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  className={inputClass(!!fieldErrors.lastName)}
                />
              </Field>
            </div>

            <Field label="Email address" error={fieldErrors.email}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass(!!fieldErrors.email)}
              />
            </Field>
          </div>
        </div>

        {error && (
          <div className="bg-cinnabar-100 text-cinnabar-500 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
      </div>

      {/* Pay now — fixed footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-black-100 px-4 py-4">
        <button
          onClick={handlePay}
          disabled={loading}
          className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-colors text-base"
        >
          {loading ? "Processing..." : `Pay now · ${formatKobo(total)}`}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-black-500 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-cinnabar-500">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return cn(
    "w-full px-4 py-3 rounded-xl border text-sm text-black-900 bg-white",
    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
    "placeholder:text-black-300",
    hasError ? "border-cinnabar-500" : "border-black-200"
  );
}

function loadPaystackScript(): Promise<{
  setup: (config: Record<string, unknown>) => { openIframe: () => void };
}> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as Record<string, unknown>).PaystackPop) {
      resolve((window as unknown as Record<string, unknown>).PaystackPop as ReturnType<typeof loadPaystackScript> extends Promise<infer T> ? T : never);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.onload = () =>
      resolve((window as unknown as Record<string, unknown>).PaystackPop as ReturnType<typeof loadPaystackScript> extends Promise<infer T> ? T : never);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
