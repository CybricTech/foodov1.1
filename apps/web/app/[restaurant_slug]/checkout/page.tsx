"use client";

import { useState, useEffect, useRef } from "react";
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
  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "delivery">("delivery");

  // Delivery address
  const [addressInput, setAddressInput] = useState("");
  const [selectedPlaceAddress, setSelectedPlaceAddress] = useState("");
  const [predictions, setPredictions] = useState<Array<{ description: string; place_id: string }>>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [deliveryFeeKobo, setDeliveryFeeKobo] = useState<number | null>(null);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);
  const [deliveryFeeError, setDeliveryFeeError] = useState("");
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);

  const placesReadyRef = useRef(false);
  const predictionsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Optional delivery detail fields
  const [aptSuiteFloor, setAptSuiteFloor] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");

  // Platform service fee
  const [serviceChargePct, setServiceChargePct] = useState(0);
  const [serviceChargeFixedKobo, setServiceChargeFixedKobo] = useState(0);

  useEffect(() => {
    fetch("/api/checkout/service-fee")
      .then((r) => r.json())
      .then((d) => {
        setServiceChargePct(Number(d.pct ?? 0));
        setServiceChargeFixedKobo(Number(d.fixedKobo ?? 0));
      })
      .catch(() => {});
  }, []);

  // Customer info
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  // Reset state when switching to pickup
  useEffect(() => {
    if (fulfillmentType === "pickup") {
      setAddressInput("");
      setSelectedPlaceAddress("");
      setPredictions([]);
      setShowPredictions(false);
      setDeliveryFeeKobo(null);
      setDeliveryFeeError("");
      setDistanceKm(null);
      setDurationMinutes(null);
      setAptSuiteFloor("");
      setDeliveryInstructions("");
    }
  }, [fulfillmentType]);

  // Load Google Maps script + Places library (new API) when delivery tab is active
  useEffect(() => {
    if (fulfillmentType !== "delivery") return;
    let cancelled = false;

    async function loadPlaces() {
      if (placesReadyRef.current) return;

      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.warn("[Checkout] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set");
        return;
      }

      // Load the Maps bootstrap script if not already present
      if (!document.getElementById("google-maps-script")) {
        const script = document.createElement("script");
        script.id = "google-maps-script";
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
        script.async = true;
        document.head.appendChild(script);

        // Wait for the script to load
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = (e) => reject(e);
        });
      }

      if (cancelled) return;

      // Wait for google.maps.places to be available
      await new Promise<void>((resolve) => {
        if (window.google?.maps?.places) { resolve(); return; }
        const iv = setInterval(() => {
          if (window.google?.maps?.places) { clearInterval(iv); resolve(); }
        }, 100);
      });

      placesReadyRef.current = true;
      console.log("[Checkout] Google Places library loaded (new API)");
    }

    loadPlaces().catch((err) =>
      console.error("[Checkout] Failed to load Google Places:", err)
    );

    return () => { cancelled = true; };
  }, [fulfillmentType]);

  async function calculateDeliveryFee(address: string) {
    setDeliveryFeeLoading(true);
    setDeliveryFeeError("");
    try {
      const url = `/api/delivery/fee?restaurantId=${restaurant.id}&destinationAddress=${encodeURIComponent(address)}`;
      console.log("[Checkout] Fetching delivery fee:", url);
      const res = await fetch(url);
      const text = await res.text();
      console.log("[Checkout] Delivery fee response:", res.status, text.substring(0, 500));
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setDeliveryFeeError("Server returned an invalid response. Please try again.");
        setDeliveryFeeKobo(null);
        return;
      }
      if (!res.ok) {
        setDeliveryFeeError(data.error ?? "Could not calculate delivery fee");
        setDeliveryFeeKobo(null);
      } else {
        setDeliveryFeeKobo(data.feeKobo);
        setDistanceKm(data.distanceKm);
        setDurationMinutes(data.durationMinutes);
      }
    } catch (err) {
      console.error("[Checkout] Delivery fee fetch error:", err);
      setDeliveryFeeError("Could not calculate delivery fee. Please try again.");
    } finally {
      setDeliveryFeeLoading(false);
    }
  }

  // Redirect if cart is empty — but not while payment is processing
  useEffect(() => {
    if (items.length === 0 && !loading) router.replace(`/${restaurant.slug}`);
  }, [items.length, restaurant.slug, router, loading]);

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
    if (fulfillmentType === "delivery") {
      if (!selectedPlaceAddress) {
        errors.deliveryAddress = "Select a delivery address from the suggestions";
      } else if (deliveryFeeKobo === null) {
        errors.deliveryAddress = "Delivery fee could not be calculated for this address";
      }
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
          deliveryAddress: selectedPlaceAddress
            ? aptSuiteFloor.trim()
              ? `${selectedPlaceAddress}, ${aptSuiteFloor.trim()}`
              : selectedPlaceAddress
            : undefined,
          specialInstructions: deliveryInstructions.trim() || undefined,
          deliveryFeeKobo: fulfillmentType === "delivery" ? (deliveryFeeKobo ?? 0) : 0,
          deliveryDistanceKm: distanceKm ?? undefined,
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

      const PaystackPop = await loadPaystackScript();
      const handler = PaystackPop.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY!,
        email: email || `${normalizedPhone?.replace(/\D/g, "")}@foodo.ng`,
        amount: initData.totalKobo,
        currency: "NGN",
        ref: initData.paystackRef,
        access_code: initData.accessCode,
        callback: () => {
          clearCart();
          router.push(`/${restaurant.slug}/orders/pending?ref=${initData.paystackRef}`);
        },
        onClose: () => {
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

  const effectiveDeliveryFee =
    fulfillmentType === "delivery" ? (deliveryFeeKobo ?? 0) : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vatPct = (restaurant as any).vat_percentage ? Number((restaurant as any).vat_percentage) : 0;
  const vatKobo = vatPct > 0 ? Math.round(subtotal * vatPct / 100) : 0;
  const serviceFeeKobo =
    serviceChargePct > 0 || serviceChargeFixedKobo > 0
      ? Math.round(subtotal * serviceChargePct) + serviceChargeFixedKobo
      : 0;
  const total = subtotal + effectiveDeliveryFee + vatKobo + serviceFeeKobo;
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  // Pay button is disabled for delivery until a valid fee is calculated
  const payDisabled =
    loading ||
    (fulfillmentType === "delivery" &&
      (deliveryFeeKobo === null || !!deliveryFeeError || deliveryFeeLoading));

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
              {(["delivery", "pickup"] as const).map((type) => (
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

          {/* Pickup info OR delivery address input */}
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
            <div className="px-4 py-4 space-y-2">
              <label className="block text-xs text-black-400">Delivery address</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Start typing your address…"
                  value={addressInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAddressInput(val);
                    setSelectedPlaceAddress("");
                    setDeliveryFeeKobo(null);
                    setDeliveryFeeError("");
                    setDistanceKm(null);
                    setDurationMinutes(null);

                    if (predictionsDebounceRef.current) clearTimeout(predictionsDebounceRef.current);

                    if (val.trim().length < 3) {
                      setPredictions([]);
                      setShowPredictions(false);
                      return;
                    }

                    predictionsDebounceRef.current = setTimeout(async () => {
                      if (!placesReadyRef.current) {
                        console.warn("[Checkout] Places library not ready — typed:", val);
                        return;
                      }
                      try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const ACS = (google.maps.places as any).AutocompleteSuggestion;
                        const { suggestions } = await ACS.fetchAutocompleteSuggestions({
                          input: val,
                          includedRegionCodes: ["ng"],
                          locationBias: {
                            center: { lat: 9.0579, lng: 7.4951 },
                            radius: 50000,
                          },
                        });
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const mapped = (suggestions as any[]).filter((s: any) => s.placePrediction).map((s: any) => ({
                          description: s.placePrediction.text?.text ?? s.placePrediction.description ?? "",
                          place_id: s.placePrediction.placeId ?? "",
                        }));
                        setPredictions(mapped);
                        setShowPredictions(mapped.length > 0);
                      } catch (err) {
                        console.error("[Checkout] Autocomplete error:", err);
                        setPredictions([]);
                        setShowPredictions(false);
                      }
                    }, 300);
                  }}
                  onBlur={() => setTimeout(() => setShowPredictions(false), 150)}
                  onFocus={() => { if (predictions.length > 0) setShowPredictions(true); }}
                  className={cn(inputClass(!!fieldErrors.deliveryAddress), "w-full")}
                  autoComplete="off"
                />
                {showPredictions && predictions.length > 0 && (
                  <div className="absolute z-50 w-full bg-white border border-black-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                    {predictions.map((p) => (
                      <button
                        key={p.place_id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setAddressInput(p.description);
                          setSelectedPlaceAddress(p.description);
                          setPredictions([]);
                          setShowPredictions(false);
                          calculateDeliveryFee(p.description);
                        }}
                        className="w-full text-left px-4 py-3 text-sm text-black-900 hover:bg-black-50 border-b border-black-100 last:border-0"
                      >
                        {p.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {fieldErrors.deliveryAddress && (
                <p className="text-xs text-cinnabar-500">{fieldErrors.deliveryAddress}</p>
              )}
              {deliveryFeeError && (
                <p className="text-xs text-cinnabar-500">{deliveryFeeError}</p>
              )}
              <div>
                <label className="block text-xs text-black-400 mb-1.5">Street / Apt / Floor <span className="text-black-300">(optional)</span></label>
                <input
                  type="text"
                  placeholder="Apt 4B, Suite 200, 3rd floor…"
                  value={aptSuiteFloor}
                  onChange={(e) => setAptSuiteFloor(e.target.value)}
                  className={inputClass(false)}
                />
              </div>
              <div>
                <label className="block text-xs text-black-400 mb-1.5">Delivery instructions <span className="text-black-300">(optional)</span></label>
                <textarea
                  placeholder="Leave at front door, don't ring the bell…"
                  value={deliveryInstructions}
                  onChange={(e) => setDeliveryInstructions(e.target.value)}
                  rows={3}
                  className={cn(inputClass(false), "resize-none")}
                />
              </div>
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
                <div className="text-sm text-black-500">
                  <span>Delivery fee</span>
                  {distanceKm !== null && durationMinutes !== null && (
                    <span className="ml-1.5 text-xs text-black-400">
                      {distanceKm}km · ~{durationMinutes} min
                    </span>
                  )}
                </div>
                <span className="text-sm font-semibold text-black-900">
                  {deliveryFeeLoading ? (
                    <span className="inline-flex items-center gap-1 text-black-400 text-xs">
                      <span className="w-3 h-3 border border-black-300 border-t-transparent rounded-full animate-spin" />
                      Calculating…
                    </span>
                  ) : deliveryFeeKobo !== null ? (
                    formatKobo(deliveryFeeKobo)
                  ) : (
                    <span className="text-black-300 text-xs">—</span>
                  )}
                </span>
              </div>
            )}



            {vatKobo > 0 && (
              <div className="px-4 py-3 flex items-center justify-between border-t border-black-100">
                <span className="text-sm text-black-500">VAT ({vatPct}%)</span>
                <span className="text-sm font-semibold text-black-900">{formatKobo(vatKobo)}</span>
              </div>
            )}

            {serviceFeeKobo > 0 && (
              <div className="px-4 py-3 flex items-center justify-between border-t border-black-100">
                <div className="text-sm text-black-500">
                  <span>Service fee</span>
                  {serviceChargePct > 0 && (
                    <span className="ml-1.5 text-xs text-black-400">
                      ({(serviceChargePct * 100).toFixed(1)}%{serviceChargeFixedKobo > 0 ? ` + ${formatKobo(serviceChargeFixedKobo)}` : ""})
                    </span>
                  )}
                </div>
                <span className="text-sm font-semibold text-black-900">{formatKobo(serviceFeeKobo)}</span>
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
          disabled={payDisabled}
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
