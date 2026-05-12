"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Store, ShoppingBag, MapPin, Loader2 } from "lucide-react";
import { z } from "zod";
import { useCartStore } from "@/lib/stores/cart";
import { useRestaurant } from "@/components/storefront/restaurant-context";
import { normalizeToE164, formatKobo, isValidNigerianPhone } from "@foodo/utils";
import { cn } from "@foodo/ui";

const CustomerSchema = z.object({
  phone: z.string().refine(isValidNigerianPhone, "Enter a valid Nigerian number (e.g. 08012345678)"),
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

  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "delivery">("delivery");

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
  const deliveryFeeAbortRef = useRef<AbortController | null>(null);
  // Set in onSuccess so the empty-cart redirect below doesn't race the
  // navigation to /orders/pending. Without this guard a slow live Paystack
  // payment trips the 30s timeout (which flips loading → false), and when
  // onSuccess later clears the cart the effect fires router.replace → storefront.
  const paidRef = useRef(false);

  const [aptSuiteFloor, setAptSuiteFloor] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");

  const [serviceChargePct, setServiceChargePct] = useState(0);
  const [serviceChargeFixedKobo, setServiceChargeFixedKobo] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    fetch("/api/checkout/service-fee")
      .then((r) => r.json())
      .then((d) => {
        setServiceChargePct(Number(d.pct ?? 0));
        setServiceChargeFixedKobo(Number(d.fixedKobo ?? 0));
      })
      .catch(() => {});
  }, []);

  // Detect bfcache restore (iOS Safari) and reload to prevent stale checkout bundles
  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        window.location.reload();
      }
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // Auto-calculate delivery fee when user stops typing an address.
  // Uses an abort-controller pattern so that if the address changes while a
  // request is already in-flight the stale response is discarded and a fresh
  // calculation is kicked off for the latest address.
  useEffect(() => {
    if (fulfillmentType !== "delivery") return;
    if (addressInput.trim().length < 10) return;

    // Abort any previous in-flight request immediately.
    if (deliveryFeeAbortRef.current) {
      deliveryFeeAbortRef.current.abort();
    }
    const controller = new AbortController();
    deliveryFeeAbortRef.current = controller;

    const id = setTimeout(() => {
      if (deliveryFeeKobo === null && !deliveryFeeError) {
        calculateDeliveryFee(addressInput.trim(), controller.signal);
      }
    }, 1200);

    return () => {
      clearTimeout(id);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressInput, fulfillmentType]);

  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const [step, setStep] = useState<"phone" | "checkout">("phone");
  const [savedAddresses, setSavedAddresses] = useState<
    Array<{ id: string; address: string; label: string | null; is_default: boolean }>
  >([]);
  const [phoneLoading, setPhoneLoading] = useState(false);

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

      if (!document.getElementById("google-maps-script")) {
        const script = document.createElement("script");
        script.id = "google-maps-script";
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
        script.async = true;
        document.head.appendChild(script);

        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = (e) => reject(e);
        });
      }

      if (cancelled) return;

      await new Promise<void>((resolve) => {
        if (window.google?.maps?.places) { resolve(); return; }
        const iv = setInterval(() => {
          if (window.google?.maps?.places) { clearInterval(iv); resolve(); }
        }, 100);
      });

      placesReadyRef.current = true;
    }

    loadPlaces().catch((err) =>
      console.error("[Checkout] Failed to load Google Places:", err)
    );

    return () => { cancelled = true; };
  }, [fulfillmentType]);

  async function calculateDeliveryFee(address: string, signal?: AbortSignal) {
    setDeliveryFeeLoading(true);
    setDeliveryFeeError("");
    try {
      const url = `/api/delivery/fee?restaurantId=${restaurant.id}&destinationAddress=${encodeURIComponent(address)}`;
      const res = await fetch(url, signal ? { signal } : undefined);
      // If this request was aborted after it completed, discard the response so
      // the result for a stale address is never committed to state.
      if (signal?.aborted) return;
      const text = await res.text();
      if (signal?.aborted) return;
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
        // Accept manually-typed addresses too — not just Google Places predictions
        setSelectedPlaceAddress(address);
      }
    } catch (err) {
      // AbortError is expected when the effect cleans up — don't surface it as a UI error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setDeliveryFeeError("Could not calculate delivery fee. Please try again.");
    } finally {
      // Only clear the loading spinner if this request wasn't superseded.
      if (!signal?.aborted) {
        setDeliveryFeeLoading(false);
      }
    }
  }

  useEffect(() => {
    if (items.length === 0 && !loading && !paidRef.current) {
      router.replace(`/${restaurant.slug}`);
    }
  }, [items.length, restaurant.slug, router, loading]);

  if (items.length === 0) return null;

  async function lookupCustomer() {
    if (!isValidNigerianPhone(phone)) return;
    setPhoneLoading(true);
    const normalized = normalizeToE164(phone);
    try {
      const res = await fetch(
        `/api/customers/lookup?phone=${encodeURIComponent(normalized)}&restaurantId=${restaurant.id}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.full_name) {
          const parts = (data.full_name as string).split(" ");
          setFirstName(parts[0] ?? "");
          setLastName(parts.slice(1).join(" "));
        }
        if (data.email) setEmail(data.email);
        if (data.addresses) {
          setSavedAddresses(data.addresses);
        }
      }
    } catch {
      // silent
    } finally {
      setPhoneLoading(false);
    }
  }

  function selectSavedAddress(addr: string) {
    setAddressInput(addr);
    setSelectedPlaceAddress(addr);
    calculateDeliveryFee(addr);
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
      if (!addressInput.trim()) {
        errors.deliveryAddress = "Enter a delivery address";
      } else if (deliveryFeeKobo === null) {
        errors.deliveryAddress = "Delivery fee could not be calculated — please check your address";
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
          deliveryBaseAddress: selectedPlaceAddress || undefined,
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

      const popupEmail = email || `${normalizedPhone?.replace(/\D/g, "")}@foodo.ng`;

      if (initData.provider === "paystack") {
        // ── Paystack inline.js v2 flow ────────────────────────────────────
        const PaystackPop = await loadPaystackScript();
        let paystackTimeout: ReturnType<typeof setTimeout> | null = null;
        const clearPaystackTimeout = () => {
          if (paystackTimeout) clearTimeout(paystackTimeout);
        };

        const callbacks = {
          // Fires when the inline iframe finishes loading — clears the
          // safety-net timeout so a slow 3DS/OTP handoff doesn't trip it.
          onLoad: () => {
            clearPaystackTimeout();
          },
          onSuccess: () => {
            paidRef.current = true;
            clearPaystackTimeout();
            clearCart();
            router.push(
              `/${restaurant.slug}/orders/pending?ref=${initData.paystackRef}&provider=paystack`
            );
          },
          onCancel: () => {
            clearPaystackTimeout();
            setError("Payment was cancelled. You can try again.");
            setLoading(false);
          },
          onError: (err: { message: string }) => {
            clearPaystackTimeout();
            console.error("[Checkout] Paystack onError:", err);
            setError(err.message || "Payment gateway error. Please try again.");
            setLoading(false);
          },
        };

        try {
          const popup = new PaystackPop();
          if (initData.accessCode) {
            popup.resumeTransaction(initData.accessCode, callbacks);
          } else {
            popup.newTransaction({
              key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY!,
              email: popupEmail,
              amount: initData.totalKobo,
              currency: "NGN",
              reference: initData.paystackRef,
              ...callbacks,
            });
          }
        } catch (e) {
          clearPaystackTimeout();
          console.error("[Checkout] Paystack popup failed to open:", e);
          setError("Payment gateway failed to open. Please try again.");
          setLoading(false);
          return;
        }

        paystackTimeout = setTimeout(() => {
          setLoading(false);
          setError(
            "Payment gateway timed out. If this keeps happening, the site domain may need to be registered with Paystack."
          );
        }, 30000);
        return;
      }

      // ── Monnify Web SDK flow ────────────────────────────────────────────
      const MonnifySDK = await loadMonnifyScript();
      let monnifyTimeout: ReturnType<typeof setTimeout> | null = null;
      const clearMonnifyTimeout = () => {
        if (monnifyTimeout) clearTimeout(monnifyTimeout);
      };

      // The SDK opens an inline checkout pane. Server-side we already pre-
      // initialized the transaction (paymentReference bound to a payment row);
      // the SDK call here just drives the UI.
      try {
        MonnifySDK.initialize({
          // Monnify amounts are in NGN (decimals), not kobo.
          amount: initData.totalKobo / 100,
          currency: "NGN",
          reference: initData.monnifyRef,
          customerFullName: `${firstName} ${lastName}`.trim(),
          customerEmail: popupEmail,
          apiKey: process.env.NEXT_PUBLIC_MONNIFY_API_KEY!,
          contractCode: process.env.NEXT_PUBLIC_MONNIFY_CONTRACT_CODE!,
          paymentDescription: `Order at ${restaurant.name}`,
          paymentMethods: ["ACCOUNT_TRANSFER", "CARD"],
          metadata: { paymentId: initData.paymentId },
          onLoadComplete: () => {
            clearMonnifyTimeout();
          },
          onComplete: (response: { paymentStatus?: string; paymentReference?: string }) => {
            clearMonnifyTimeout();
            if (
              response?.paymentStatus === "PAID" ||
              response?.paymentStatus === "OVERPAID"
            ) {
              paidRef.current = true;
              clearCart();
            }
            const actualRef = response?.paymentReference ?? initData.monnifyRef;
            router.push(
              `/${restaurant.slug}/orders/pending?ref=${actualRef}&pid=${initData.paymentId}&provider=monnify`
            );
          },
          onClose: (data: { paymentStatus?: string }) => {
            clearMonnifyTimeout();
            if (data?.paymentStatus !== "PAID" && data?.paymentStatus !== "OVERPAID") {
              setError("Payment was cancelled. You can try again.");
              setLoading(false);
            }
          },
        });
      } catch (e) {
        clearMonnifyTimeout();
        console.error("[Checkout] Monnify popup failed to open:", e);
        setError("Payment gateway failed to open. Please try again.");
        setLoading(false);
        return;
      }
      monnifyTimeout = setTimeout(() => {
        setLoading(false);
        setError(
          "Payment gateway timed out. If this keeps happening, please refresh and try again."
        );
      }, 30000);
    } catch (e) {
      console.error(e);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const effectiveDeliveryFee = fulfillmentType === "delivery" ? (deliveryFeeKobo ?? 0) : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vatPct = (restaurant as any).vat_percentage ? Number((restaurant as any).vat_percentage) : 0;
  const vatKobo = vatPct > 0 ? Math.round(subtotal * vatPct / 100) : 0;
  const serviceFeeKobo =
    serviceChargePct > 0 || serviceChargeFixedKobo > 0
      ? Math.round(subtotal * serviceChargePct) + serviceChargeFixedKobo
      : 0;
  const total = subtotal + effectiveDeliveryFee + vatKobo + serviceFeeKobo;
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  const storeClosed = !restaurant.accepts_orders;

  const payDisabled =
    loading ||
    storeClosed ||
    (fulfillmentType === "delivery" &&
      (deliveryFeeKobo === null || !!deliveryFeeError || deliveryFeeLoading));

  return (
    <div className="min-h-screen bg-black-50 pb-32">
      {/* Phone gate overlay — rendered at root JSX level, outside any scrollable
          container, so that `position: fixed` is anchored to the viewport on iOS
          Safari. Nesting a fixed element inside a parent that has transform,
          overflow:hidden, or -webkit-overflow-scrolling clips it to the parent
          instead of the viewport. */}
      {step === "phone" && (
        <div
          className="fixed inset-0 z-[100] bg-black-50 flex flex-col items-center justify-center px-4"
          style={{ WebkitTransform: "translateZ(0)" }}
        >
          <div className="bg-white rounded-2xl border border-black-100 p-6 space-y-5 w-full max-w-sm shadow-xl">
            <div className="text-center space-y-2">
              {restaurant.logo_url && (
                <div className="relative w-16 h-16 rounded-2xl overflow-hidden mx-auto border border-black-100">
                  <Image
                    src={restaurant.logo_url}
                    alt={restaurant.name}
                    width={64}
                    height={64}
                    className="object-cover w-full h-full"
                    unoptimized
                  />
                </div>
              )}
              <h2 className="text-lg font-bold text-black-900">
                {restaurant.name}
              </h2>
              <p className="text-sm text-black-500">
                Enter your phone number to continue
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lookupCustomer().then(() => setStep("checkout"));
                  }
                }}
                placeholder="e.g. 0812 345 6789"
                className={cn(
                  "w-full px-4 py-3 rounded-xl border text-base text-black-900 bg-white",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                  "placeholder:text-black-300 transition-colors",
                  "border-black-200"
                )}
              />
              <button
                onClick={() => {
                  lookupCustomer().then(() => setStep("checkout"));
                }}
                disabled={phoneLoading || !isValidNigerianPhone(phone)}
                className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-2xl transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {phoneLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Looking you up…
                  </>
                ) : (
                  "Continue"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-black-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-black-500 hover:bg-black-100 transition-colors cursor-pointer"
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-black-900">Checkout</h1>
          <p className="text-xs text-black-400">{restaurant.name}</p>
        </div>
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
                    "flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize transition-colors cursor-pointer",
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

          {/* Pickup info OR delivery address */}
          {fulfillmentType === "pickup" ? (
            <div className="px-4 py-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Store size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-xs text-black-400 mb-0.5 font-medium">Pick up from</p>
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
            <div className="px-4 py-4 space-y-3">
              {/* Saved addresses */}
              {savedAddresses.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-black-500">Saved addresses</p>
                  <div className="flex flex-wrap gap-2">
                    {savedAddresses.map((addr) => (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => selectSavedAddress(addr.address)}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-lg border transition-colors",
                          addressInput === addr.address
                            ? "bg-primary/10 border-primary text-primary font-medium"
                            : "bg-black-50 border-black-200 text-black-600 hover:border-black-300"
                        )}
                      >
                        {addr.label ? `${addr.label}: ` : ""}
                        {addr.address}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-black-700 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <MapPin size={13} className="text-black-400" />
                    Delivery address
                  </span>
                </label>
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
                        if (!placesReadyRef.current) return;
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
                        } catch {
                          setPredictions([]);
                          setShowPredictions(false);
                        }
                      }, 300);
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowPredictions(false), 150);
                    }}
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
                          className="w-full text-left px-4 py-3 text-sm text-black-900 hover:bg-black-50 border-b border-black-50 last:border-0 cursor-pointer transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <MapPin size={13} className="text-black-400 mt-0.5 flex-shrink-0" />
                            {p.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {fieldErrors.deliveryAddress && (
                  <p className="text-xs text-cinnabar-500 mt-1">{fieldErrors.deliveryAddress}</p>
                )}
                {deliveryFeeError && (
                  <p className="text-xs text-cinnabar-500 mt-1">{deliveryFeeError}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-black-500 mb-1.5">
                  Street / Apt / Floor <span className="text-black-300 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Apt 4B, Suite 200, 3rd floor…"
                  value={aptSuiteFloor}
                  onChange={(e) => setAptSuiteFloor(e.target.value)}
                  className={inputClass(false)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-black-500 mb-1.5">
                  Delivery instructions <span className="text-black-300 font-normal">(optional)</span>
                </label>
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

          {/* Order summary */}
          <div className="border-t border-black-100 divide-y divide-black-50">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-black-500">
                <ShoppingBag size={14} className="text-black-400" />
                <span>{itemCount} {itemCount === 1 ? "item" : "items"}</span>
              </div>
              <span className="text-sm font-semibold text-black-900">{formatKobo(subtotal)}</span>
            </div>

            {fulfillmentType === "delivery" && (
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="text-sm text-black-500">
                  Delivery fee
                  {distanceKm !== null && durationMinutes !== null && (
                    <span className="ml-1.5 text-xs text-black-400">
                      {distanceKm}km · ~{durationMinutes} min
                    </span>
                  )}
                </div>
                <span className="text-sm font-semibold text-black-900">
                  {deliveryFeeLoading ? (
                    <span className="inline-flex items-center gap-1 text-black-400 text-xs">
                      <Loader2 size={12} className="animate-spin" />
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
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-black-500">VAT ({vatPct}%)</span>
                <span className="text-sm font-semibold text-black-900">{formatKobo(vatKobo)}</span>
              </div>
            )}

            {serviceFeeKobo > 0 && (
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="text-sm text-black-500">
                  Service fee
                </div>
                <span className="text-sm font-semibold text-black-900">{formatKobo(serviceFeeKobo)}</span>
              </div>
            )}

            <div className="px-4 py-3 flex items-center justify-between bg-black-50/50">
              <span className="text-sm font-bold text-black-900">Total</span>
              <span className="text-sm font-bold text-black-900">{formatKobo(total)}</span>
            </div>
          </div>
        </div>

        {/* Customer info */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-black-900">Your information</h2>
            <button
              onClick={() => setStep("phone")}
              className="text-xs text-primary font-medium hover:underline cursor-pointer"
            >
              Change number
            </button>
          </div>
          <div className="space-y-3">
            <Field label="Mobile number" error={fieldErrors.phone}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
                placeholder="you@example.com (optional)"
                className={inputClass(!!fieldErrors.email)}
              />
            </Field>
          </div>
        </div>

        {error && (
          <div className="bg-cinnabar-50 border border-cinnabar-200 text-cinnabar-600 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
      </div>

      {/* Fixed pay footer */}
      {step === "checkout" && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-black-100 px-4 py-4 shadow-lg">
          {storeClosed && (
            <p className="text-center text-sm font-semibold text-cinnabar-500 mb-3">
              {restaurant.name} is currently closed and not accepting orders.
            </p>
          )}
          <button
            onClick={handlePay}
            disabled={payDisabled}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-colors text-base flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Processing…
              </>
            ) : storeClosed ? (
              "Store is closed"
            ) : fulfillmentType === "delivery" && deliveryFeeLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Calculating delivery fee…
              </>
            ) : fulfillmentType === "delivery" && deliveryFeeKobo === null ? (
              <>
                <MapPin size={18} />
                Enter address to continue
              </>
            ) : (
              `Pay now · ${formatKobo(total)}`
            )}
          </button>
        </div>
      )}
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
      <label className="block text-sm font-medium text-black-600 mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-cinnabar-500">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return cn(
    "w-full px-4 py-3 rounded-xl border text-base text-black-900 bg-white",
    "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
    "placeholder:text-black-300 transition-colors",
    hasError ? "border-cinnabar-400 bg-cinnabar-50/30" : "border-black-200"
  );
}

// Monnify Web SDK surface (only the bits we use).
// Docs: https://developers.monnify.com/docs/integration-tools/sdk
type MonnifySDKConfig = {
  amount: number;
  currency: string;
  reference: string;
  customerFullName: string;
  customerEmail: string;
  apiKey: string;
  contractCode: string;
  paymentDescription: string;
  paymentMethods?: Array<"ACCOUNT_TRANSFER" | "CARD" | "USSD" | "PHONE_NUMBER">;
  metadata?: Record<string, unknown>;
  onLoadStart?: () => void;
  onLoadComplete?: () => void;
  onComplete?: (response: {
    paymentStatus?: string;
    transactionReference?: string;
    paymentReference?: string;
    amountPaid?: number;
    [key: string]: unknown;
  }) => void;
  onClose?: (data: { paymentStatus?: string; redirectUrl?: string }) => void;
};
type MonnifySDKInstance = {
  initialize: (config: MonnifySDKConfig) => void;
};

function loadMonnifyScript(): Promise<MonnifySDKInstance> {
  return new Promise((resolve, reject) => {
    const existing = (window as unknown as { MonnifySDK?: MonnifySDKInstance }).MonnifySDK;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.monnify.com/plugin/monnify.js";
    script.onload = () => {
      const sdk = (window as unknown as { MonnifySDK?: MonnifySDKInstance }).MonnifySDK;
      if (sdk) resolve(sdk);
      else reject(new Error("MonnifySDK did not register on window"));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Paystack inline.js v2 API surface (only the bits we use).
// Docs: https://github.com/PaystackHQ/inline-js
type PaystackPopCallbacks = {
  onSuccess?: (txn: { id: number; reference: string; message: string }) => void;
  onCancel?: () => void;
  onError?: (err: { message: string }) => void;
  onLoad?: (txn: { id: number; customer: unknown; accessCode: string }) => void;
};
type PaystackPopInstance = {
  resumeTransaction: (accessCode: string, callbacks: PaystackPopCallbacks) => void;
  newTransaction: (
    config: Record<string, unknown> & PaystackPopCallbacks
  ) => void;
};
type PaystackPopConstructor = new () => PaystackPopInstance;

function loadPaystackScript(): Promise<PaystackPopConstructor> {
  return new Promise((resolve, reject) => {
    const existing = (window as unknown as { PaystackPop?: PaystackPopConstructor })
      .PaystackPop;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v2/inline.js";
    script.onload = () => {
      const ctor = (window as unknown as { PaystackPop?: PaystackPopConstructor })
        .PaystackPop;
      if (ctor) resolve(ctor);
      else reject(new Error("PaystackPop did not register on window"));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
