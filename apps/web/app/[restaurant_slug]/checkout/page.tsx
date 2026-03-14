"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useCartStore } from "@/lib/stores/cart";
import { useRestaurant } from "@/components/storefront/restaurant-context";
import { normalizeToE164 } from "@foodo/utils";
import { formatKobo } from "@foodo/utils";
import { cn } from "@foodo/ui";

type Step = "identity" | "fulfillment" | "payment";

const IdentitySchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(10, "Enter a valid phone number"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

export default function CheckoutPage() {
  const router = useRouter();
  const { restaurant } = useRestaurant();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotalKobo)();
  const clearCart = useCartStore((s) => s.clear);

  const [step, setStep] = useState<Step>("identity");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Identity fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Fulfillment fields
  const [fulfillmentType, setFulfillmentType] = useState<"delivery" | "pickup">(
    "delivery"
  );
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

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
        if (data.full_name && !fullName) setFullName(data.full_name);
        if (data.email && !email) setEmail(data.email);
      }
    } catch {
      // silent fail — pre-fill is best-effort
    }
  }

  // Redirect if cart is empty
  useEffect(() => {
    if (items.length === 0) {
      router.replace(`/${restaurant.slug}`);
    }
  }, [items.length, restaurant.slug, router]);

  if (items.length === 0) return null;

  function validateIdentity(): boolean {
    const result = IdentitySchema.safeParse({ fullName, phone, email });
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        errors[issue.path[0] as string] = issue.message;
      });
      setFieldErrors(errors);
      return false;
    }
    setFieldErrors({});
    return true;
  }

  function validateFulfillment(): boolean {
    if (fulfillmentType === "delivery" && !deliveryAddress.trim()) {
      setFieldErrors({ deliveryAddress: "Delivery address is required" });
      return false;
    }
    setFieldErrors({});
    return true;
  }

  async function handlePay() {
    setLoading(true);
    setError("");

    try {
      const normalizedPhone = normalizeToE164(phone);

      const res = await fetch("/api/checkout/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          customerName: fullName,
          customerPhone: normalizedPhone,
          customerEmail: email || undefined,
          fulfillmentType,
          deliveryAddress: deliveryAddress || undefined,
          specialInstructions: specialInstructions || undefined,
          items: items.map((item) => ({
            menuItemId: item.menuItemId,
            name: item.name,
            priceKobo: item.price,
            quantity: item.quantity,
            selectedOptions: item.selectedOptions,
          })),
        }),
      });

      const initData = await res.json();

      if (!res.ok) {
        setError(initData.error ?? "Payment initialization failed");
        setLoading(false);
        return;
      }

      // Load Paystack popup
      const PaystackPop = await loadPaystackScript();
      const handler = PaystackPop.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY!,
        email:
          email ||
          `${normalizedPhone.replace(/\D/g, "")}@foodo.ng`,
        amount: initData.totalKobo,
        currency: "NGN",
        ref: initData.paystackRef,
        access_code: initData.accessCode,
        onSuccess: () => {
          clearCart();
          // Optimistically navigate to a confirmation page while webhook processes
          router.push(
            `/${restaurant.slug}/orders/pending?ref=${initData.paystackRef}`
          );
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
  const total =
    subtotal + (fulfillmentType === "delivery" ? deliveryFee : 0);

  return (
    <div className="min-h-screen bg-black-50">
      {/* Header */}
      <div className="bg-white border-b border-black-100 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => {
            if (step === "identity") router.back();
            else if (step === "fulfillment") setStep("identity");
            else setStep("fulfillment");
          }}
          className="text-black-500 hover:text-black-900"
        >
          ←
        </button>
        <h1 className="font-bold text-black-900">Checkout</h1>
      </div>

      {/* Progress indicators */}
      <div className="flex px-4 py-3 gap-2">
        {(["identity", "fulfillment", "payment"] as Step[]).map((s, i) => (
          <div
            key={s}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              step === s
                ? "bg-primary"
                : i < ["identity", "fulfillment", "payment"].indexOf(step)
                ? "bg-primary/40"
                : "bg-black-200"
            )}
          />
        ))}
      </div>

      <div className="px-4 pb-32">
        {/* Step 1 — Identity */}
        {step === "identity" && (
          <div className="space-y-4 mt-4">
            <h2 className="font-semibold text-black-900">Your details</h2>
            <Field
              label="Full name"
              error={fieldErrors.fullName}
            >
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Amina Okafor"
                className={inputClass(!!fieldErrors.fullName)}
              />
            </Field>
            <Field label="Phone number" error={fieldErrors.phone}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={handlePhoneBlur}
                placeholder="e.g. 0812 345 6789"
                className={inputClass(!!fieldErrors.phone)}
              />
            </Field>
            <Field label="Email (optional)" error={fieldErrors.email}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass(!!fieldErrors.email)}
              />
            </Field>
          </div>
        )}

        {/* Step 2 — Fulfillment */}
        {step === "fulfillment" && (
          <div className="space-y-4 mt-4">
            <h2 className="font-semibold text-black-900">Delivery or pickup?</h2>
            <div className="grid grid-cols-2 gap-3">
              {(["delivery", "pickup"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFulfillmentType(type)}
                  className={cn(
                    "py-4 rounded-xl border-2 font-medium text-sm capitalize transition-colors",
                    fulfillmentType === type
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-black-200 text-black-500 hover:border-black-300"
                  )}
                >
                  {type === "delivery" ? "🛵 Delivery" : "🏪 Pickup"}
                </button>
              ))}
            </div>

            {fulfillmentType === "delivery" && (
              <Field label="Delivery address" error={fieldErrors.deliveryAddress}>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Full delivery address..."
                  rows={3}
                  className={inputClass(!!fieldErrors.deliveryAddress)}
                />
              </Field>
            )}

            {fulfillmentType === "pickup" && restaurant.estimated_delivery_minutes && (
              <div className="bg-primary/5 rounded-xl p-4 text-sm text-primary font-medium">
                ⏱ Ready for pickup in ~{restaurant.estimated_delivery_minutes} minutes
              </div>
            )}

            <Field label="Special instructions (optional)">
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="Allergies, gate code, etc."
                rows={2}
                className={inputClass(false)}
              />
            </Field>
          </div>
        )}

        {/* Step 3 — Payment summary */}
        {step === "payment" && (
          <div className="mt-4 space-y-4">
            <h2 className="font-semibold text-black-900">Order summary</h2>
            <div className="bg-white rounded-xl border border-black-100 divide-y divide-black-100">
              {items.map((item) => (
                <div key={`${item.menuItemId}-${item.optionsKey}`} className="px-4 py-3 flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-black-900">
                      {item.quantity}× {item.name}
                    </p>
                    {item.selectedOptions.length > 0 && (
                      <p className="text-xs text-black-400 mt-0.5">
                        {item.selectedOptions
                          .flatMap((o) => o.choices.map((c) => c.choiceName))
                          .join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-medium text-black-900 ml-4">
                    {formatKobo(item.lineTotal)}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-black-100 px-4 py-3 space-y-2">
              <div className="flex justify-between text-sm text-black-500">
                <span>Subtotal</span>
                <span>{formatKobo(subtotal)}</span>
              </div>
              {fulfillmentType === "delivery" && (
                <div className="flex justify-between text-sm text-black-500">
                  <span>Delivery fee</span>
                  <span>{formatKobo(deliveryFee)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-black-900 pt-1 border-t border-black-100">
                <span>Total</span>
                <span>{formatKobo(total)}</span>
              </div>
            </div>

            {error && (
              <div className="bg-cinnabar-100 text-cinnabar-500 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-black-100 px-4 py-4">
        <button
          onClick={() => {
            if (step === "identity") {
              if (validateIdentity()) setStep("fulfillment");
            } else if (step === "fulfillment") {
              if (validateFulfillment()) setStep("payment");
            } else {
              handlePay();
            }
          }}
          disabled={loading}
          className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-semibold py-4 rounded-xl transition-colors"
        >
          {loading
            ? "Processing..."
            : step === "payment"
            ? `Pay ${formatKobo(total)}`
            : "Continue"}
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
      <label className="block text-sm font-medium text-black-500 mb-1">
        {label}
      </label>
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

// Lazy-load Paystack SDK
function loadPaystackScript(): Promise<{
  setup: (config: Record<string, unknown>) => { openIframe: () => void };
}> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as Record<string, unknown>).PaystackPop) {
      resolve(
        (window as unknown as Record<string, unknown>).PaystackPop as ReturnType<typeof loadPaystackScript> extends Promise<infer T> ? T : never
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.onload = () =>
      resolve(
        (window as unknown as Record<string, unknown>).PaystackPop as ReturnType<typeof loadPaystackScript> extends Promise<infer T> ? T : never
      );
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
