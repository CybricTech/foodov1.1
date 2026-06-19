"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Store, ShoppingBag, MapPin, Loader2, Ticket, X, Check, Navigation, Gift } from "lucide-react";
import { z } from "zod";
import posthog from "posthog-js";
import { useCartStore } from "@/lib/stores/cart";
import { transformImage } from "@/lib/images";
import { useRestaurant } from "@/components/storefront/restaurant-context";
import { LoyaltyProgressCard } from "@/components/storefront/loyalty-progress-card";
import { normalizeToE164, formatKobo, isValidNigerianPhone } from "@foodo/utils";
import { cn } from "@foodo/ui";

const CustomerSchema = z.object({
  phone: z.string().refine(isValidNigerianPhone, "Enter a valid Nigerian number (e.g. 08012345678)"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

/**
 * Error payloads from our own API routes are always strings, but a request can
 * also fail at the platform/gateway layer (e.g. a Vercel function timeout in a
 * flaky in-app browser), which returns a JSON body like
 * `{ error: { code, id, message } }`. Putting that object into error state and
 * rendering it as a React child throws "Objects are not valid as a React
 * child", so always coerce an API error field to a string here.
 */
function errorText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { message?: unknown }).message === "string"
  ) {
    return (value as { message: string }).message;
  }
  return fallback;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { restaurant } = useRestaurant();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotalKobo)();
  const clearCart = useCartStore((s) => s.clear);
  const removeItem = useCartStore((s) => s.removeItem);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "delivery">("delivery");

  const [addressInput, setAddressInput] = useState("");
  const [selectedPlaceAddress, setSelectedPlaceAddress] = useState("");
  const [predictions, setPredictions] = useState<Array<{ description: string; place_id: string }>>([]);
  // The Google place_id of the prediction the customer actually picked.
  // Passed to the fee API + checkout so the server measures distance to the
  // exact place — never re-geocoding a free-text string that can snap to a
  // same-named street elsewhere (GD-1331: "Mallam el rufai street …Lugbe"
  // resolved 9.3km to Wuse instead of 22.2km to River Park → ₦1.9k undercharge).
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  // Exact destination coordinates for the picked suggestion or device GPS.
  // When set, these are the priced destination — Distance Matrix measures to
  // the pin, never re-geocoding a string (GD-1331 fix, generalized to coords).
  const [selectedLat, setSelectedLat] = useState<number | null>(null);
  const [selectedLng, setSelectedLng] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);
  const [placesSearching, setPlacesSearching] = useState(false);
  const [deliveryFeeKobo, setDeliveryFeeKobo] = useState<number | null>(null);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);
  const [deliveryFeeError, setDeliveryFeeError] = useState("");
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);

  const predictionsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const predictionsAbortRef = useRef<AbortController | null>(null);
  // Set in onSuccess so the empty-cart redirect below doesn't race the
  // navigation to /orders/pending. Without this guard a slow live Paystack
  // payment trips the 30s timeout (which flips loading → false), and when
  // onSuccess later clears the cart the effect fires router.replace → storefront.
  const paidRef = useRef(false);

  const [aptSuiteFloor, setAptSuiteFloor] = useState("");
  const [restaurantNote, setRestaurantNote] = useState("");

  const [serviceChargePct, setServiceChargePct] = useState(0);
  const [serviceChargeFixedKobo, setServiceChargeFixedKobo] = useState(0);

  // Discounts (preview only — server recomputes the authoritative amount)
  const [promoInput, setPromoInput] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [discount, setDiscount] = useState<{
    label: string;
    code: string | null;
    type: string;
    discountKobo: number;
    freeDelivery: boolean;
  } | null>(null);
  const [discountError, setDiscountError] = useState("");
  const [discountChecking, setDiscountChecking] = useState(false);
  // What the loyalty reward takes off this order (reported by the loyalty card).
  const [loyaltyReward, setLoyaltyReward] = useState<{ subtotalKobo: number; deliveryKobo: number }>(
    { subtotalKobo: 0, deliveryKobo: 0 }
  );

  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"phone" | "checkout">("phone");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (step === "checkout") {
      window.scrollTo(0, 0);
    }
  }, [step]);

  useEffect(() => {
    fetch("/api/checkout/service-fee")
      .then((r) => r.json())
      .then((d) => {
        setServiceChargePct(Number(d.pct ?? 0));
        setServiceChargeFixedKobo(Number(d.fixedKobo ?? 0));
      })
      .catch(() => {});
  }, []);

  // Re-evaluate the best discount (entered code or automatic) whenever the cart
  // basis changes. The server is authoritative — this only powers the preview.
  useEffect(() => {
    if (!restaurant?.id || subtotal <= 0) {
      setDiscount(null);
      return;
    }
    const controller = new AbortController();
    const grossDelivery = fulfillmentType === "delivery" ? (deliveryFeeKobo ?? 0) : 0;
    fetch("/api/checkout/quote-discount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: restaurant.id,
        code: appliedCode || undefined,
        subtotalKobo: subtotal,
        deliveryFeeKobo: grossDelivery,
        fulfillmentType,
        // Exact destination so geo-fenced free-delivery offers preview correctly.
        destLat: fulfillmentType === "delivery" && selectedLat !== null ? selectedLat : undefined,
        destLng: fulfillmentType === "delivery" && selectedLng !== null ? selectedLng : undefined,
        // Normalized to match how redemptions are stored, so per-customer
        // limits preview accurately.
        customerPhone: isValidNigerianPhone(phone) ? normalizeToE164(phone) : undefined,
      }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.discount) {
          setDiscount(d.discount);
          setDiscountError("");
        } else {
          setDiscount(null);
          if (appliedCode && d.error) {
            setDiscountError(errorText(d.error, "That code can't be applied."));
            setAppliedCode("");
          }
        }
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id, subtotal, fulfillmentType, deliveryFeeKobo, appliedCode, phone, selectedLat, selectedLng]);

  async function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setDiscountChecking(true);
    setDiscountError("");
    const grossDelivery = fulfillmentType === "delivery" ? (deliveryFeeKobo ?? 0) : 0;
    try {
      const res = await fetch("/api/checkout/quote-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          code,
          subtotalKobo: subtotal,
          deliveryFeeKobo: grossDelivery,
          fulfillmentType,
          destLat: fulfillmentType === "delivery" && selectedLat !== null ? selectedLat : undefined,
          destLng: fulfillmentType === "delivery" && selectedLng !== null ? selectedLng : undefined,
          customerPhone: isValidNigerianPhone(phone) ? normalizeToE164(phone) : undefined,
        }),
      });
      const d = await res.json();
      if (d.discount && d.discount.code === code) {
        // The entered code is the best offer — apply it.
        setDiscount(d.discount);
        setAppliedCode(code);
        setPromoInput("");
        posthog.capture("promo_code_applied", {
          restaurant_id: restaurant.id,
          promo_code: code,
          discount_type: d.discount.type,
          discount_kobo: d.discount.discountKobo,
          free_delivery: d.discount.freeDelivery,
        });
      } else if (d.error) {
        // The code itself couldn't be used (expired, below minimum, etc.).
        setDiscountError(errorText(d.error, "That code can't be applied."));
      } else if (d.discount) {
        // The code is valid but an automatic offer already matches or beats it.
        setDiscount(d.discount);
        setDiscountError("A better offer is already applied to your order.");
      } else {
        setDiscountError("That code can't be applied.");
      }
    } catch {
      setDiscountError("Couldn't check that code. Please try again.");
    } finally {
      setDiscountChecking(false);
    }
  }

  function removePromo() {
    setAppliedCode("");
    setDiscount(null);
    setDiscountError("");
    setPromoInput("");
  }

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

  // NOTE: there is deliberately NO free-text pricing path. The delivery fee is
  // only ever computed from a *selected* registered place (an autocomplete
  // suggestion or a saved address) or from device GPS — never from whatever the
  // customer typed. Pricing raw text let Google resolve an ambiguous address to
  // the wrong location and undercharge (e.g. GD-1415: "Mallam el rufai street"
  // → Garki, 9.3km, instead of River Park Estate, Lugbe, ~22km). The address
  // box is a search field, not a free-text field — like Bolt.

  const [savedAddresses, setSavedAddresses] = useState<
    Array<{ id: string; address: string; label: string | null; is_default: boolean; lat: number | null; lng: number | null }>
  >([]);
  const [phoneLoading, setPhoneLoading] = useState(false);

  useEffect(() => {
    if (fulfillmentType === "pickup") {
      setAddressInput("");
      setSelectedPlaceAddress("");
      setSelectedPlaceId(null);
      setSelectedLat(null);
      setSelectedLng(null);
      setPredictions([]);
      setShowPredictions(false);
      setDeliveryFeeKobo(null);
      setDeliveryFeeError("");
      setDistanceKm(null);
      setDurationMinutes(null);
      setAptSuiteFloor("");
      // Note: restaurantNote is intentionally NOT cleared — it applies to both
      // pickup and delivery now, so it should survive switching fulfillment type.
    }
  }, [fulfillmentType]);

  // Address autocomplete and place resolution are now served by our own
  // /api/places/* proxy (server-side key), so there is no Google Maps JS to
  // load in the browser — the old in-browser SDK silently failed in production
  // because NEXT_PUBLIC_GOOGLE_MAPS_API_KEY was never set, leaving every order
  // free-text priced.

  // Resolve a picked suggestion to coordinates, then price from those coords.
  // Trust hierarchy on the server: coordinates > place_id > free text — so a
  // failed resolve still prices correctly via place_id.
  async function selectPrediction(description: string, placeId: string | null) {
    let lat: number | null = null;
    let lng: number | null = null;
    if (placeId) {
      try {
        const res = await fetch(
          `/api/places/resolve?placeId=${encodeURIComponent(placeId)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (typeof data.lat === "number" && typeof data.lng === "number") {
            lat = data.lat;
            lng = data.lng;
          }
        }
      } catch {
        // fall through — fee falls back to place_id, then text
      }
    }
    await calculateDeliveryFee(description, undefined, placeId, lat, lng);
  }

  // Device GPS → coordinates are the priced destination; the reverse-geocoded
  // string is only a label for the customer and rider.
  async function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setDeliveryFeeError("Location isn't available on this device — please type your address.");
      return;
    }
    setGpsLoading(true);
    setDeliveryFeeError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let label = `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
        try {
          const res = await fetch(`/api/places/reverse-geocode?lat=${lat}&lng=${lng}`);
          if (res.ok) {
            const data = await res.json();
            if (data.address) label = data.address as string;
          }
        } catch {
          // keep the coordinate label — pricing never depends on this
        }
        setAddressInput(label);
        setSelectedPlaceAddress(label);
        setPredictions([]);
        setShowPredictions(false);
        setGpsLoading(false);
        await calculateDeliveryFee(label, undefined, null, lat, lng);
      },
      (err) => {
        setGpsLoading(false);
        setDeliveryFeeError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — please type your address."
            : "Couldn't get your location — please type your address."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  async function calculateDeliveryFee(
    address: string,
    signal?: AbortSignal,
    placeId?: string | null,
    lat?: number | null,
    lng?: number | null
  ) {
    setDeliveryFeeLoading(true);
    setDeliveryFeeError("");
    const hasCoords = typeof lat === "number" && typeof lng === "number";
    try {
      const url =
        `/api/delivery/fee?restaurantId=${restaurant.id}&destinationAddress=${encodeURIComponent(address)}` +
        (hasCoords ? `&destLat=${lat}&destLng=${lng}` : "") +
        (placeId ? `&placeId=${encodeURIComponent(placeId)}` : "");
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
        setDeliveryFeeError(errorText(data.error, "Could not calculate delivery fee"));
        setDeliveryFeeKobo(null);
      } else {
        setDeliveryFeeKobo(data.feeKobo);
        setDistanceKm(data.distanceKm);
        setDurationMinutes(data.durationMinutes);
        // Accept manually-typed addresses too — not just Google Places predictions
        setSelectedPlaceAddress(address);
        // Remember which place_id this fee was computed for (null = free text),
        // so checkout re-verification measures the same destination.
        setSelectedPlaceId(placeId ?? null);
        // Coordinates are the highest-trust destination — carry them to the
        // submit payload so the server re-prices to the exact pin, and so
        // geo-fenced offers (e.g. free delivery to a campus) can match. Prefer
        // the exact picked/GPS coords; otherwise use the point the fee API
        // resolved for a typed address.
        const respLat = typeof data.destLat === "number" ? data.destLat : null;
        const respLng = typeof data.destLng === "number" ? data.destLng : null;
        setSelectedLat(hasCoords ? (lat as number) : respLat);
        setSelectedLng(hasCoords ? (lng as number) : respLng);
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
    // Hard ceiling on the phone gate. The lookup is purely an autofill
    // convenience — when the API stalls (cold start + cross-region + a
    // contended DB), the user must still be able to proceed. 3s is well above
    // the p50 (~630ms) and well below "the page is broken".
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(
        `/api/customers/lookup?phone=${encodeURIComponent(normalized)}&restaurantId=${restaurant.id}`,
        { signal: controller.signal }
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
      // Silent for both AbortError (timeout) and network errors — the user
      // proceeds without autofill rather than being stuck on the gate.
    } finally {
      clearTimeout(timeout);
      setPhoneLoading(false);
    }
  }

  function selectSavedAddress(addr: {
    address: string;
    lat: number | null;
    lng: number | null;
  }) {
    setAddressInput(addr.address);
    setSelectedPlaceAddress(addr.address);
    // Coordinate-backed saved addresses re-price with zero geocoding; legacy
    // rows (no coords) fall back to text pricing.
    calculateDeliveryFee(addr.address, undefined, null, addr.lat, addr.lng);
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
        errors.deliveryAddress = "Enter your delivery address";
      } else if (selectedLat === null || deliveryFeeKobo === null) {
        // A registered place must be selected (suggestion / saved / GPS) — typed
        // text alone is never accepted, so it can't resolve to the wrong place.
        errors.deliveryAddress = "Pick your address from the suggestions below";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Move from the phone step into checkout. Identifies the PostHog person by the
  // E.164 phone — the platform's canonical customer identity — so the browser
  // session merges with the same person our SERVER events (checkout initiated /
  // order created, both keyed on the phone) are attributed to. Without this the
  // checkout funnel can't join client + server steps and reads 0%.
  function enterCheckout() {
    if (isValidNigerianPhone(phone)) {
      const e164 = normalizeToE164(phone);
      posthog.identify(e164, { phone: e164 });
    }
    setStep("checkout");
    posthog.capture("checkout_started", {
      restaurant_id: restaurant.id,
      restaurant_name: restaurant.name,
      item_count: items.reduce((s, i) => s + i.quantity, 0),
      subtotal_kobo: subtotal,
    });
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
          deliveryPlaceId:
            fulfillmentType === "delivery" && selectedPlaceId
              ? selectedPlaceId
              : undefined,
          deliveryLat:
            fulfillmentType === "delivery" && selectedLat !== null
              ? selectedLat
              : undefined,
          deliveryLng:
            fulfillmentType === "delivery" && selectedLng !== null
              ? selectedLng
              : undefined,
          specialInstructions: restaurantNote.trim() || undefined,
          deliveryFeeKobo: fulfillmentType === "delivery" ? (deliveryFeeKobo ?? 0) : 0,
          deliveryDistanceKm: distanceKm ?? undefined,
          discountCode: appliedCode || undefined,
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
        // Items a merchant switched off while they sat in the cart are rejected
        // server-side (409). Strip them so the shown total matches what can
        // actually be ordered and the customer can retry without hunting.
        if (Array.isArray(initData.unavailableItemIds)) {
          const dead = new Set<string>(initData.unavailableItemIds);
          items
            .filter((i) => dead.has(i.menuItemId))
            .forEach((i) => removeItem(i.menuItemId, i.optionsKey));
        }
        setError(errorText(initData.error, "Payment initialization failed"));
        setLoading(false);
        return;
      }

      // Test merchant (is_test): the order was created server-side with no
      // charge — go straight to its confirmation page.
      if (initData.provider === "test" && initData.orderId) {
        clearCart();
        router.push(`/${restaurant.slug}/orders/${initData.orderId}`);
        return;
      }

      const popupEmail = email || `${normalizedPhone?.replace(/\D/g, "")}@foodo.ng`;

      posthog.capture("payment_initiated", {
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name,
        provider: initData.provider,
        fulfillment_type: fulfillmentType,
        item_count: items.reduce((s, i) => s + i.quantity, 0),
        subtotal_kobo: subtotal,
        delivery_fee_kobo: fulfillmentType === "delivery" ? (deliveryFeeKobo ?? 0) : 0,
        total_kobo: initData.totalKobo,
        discount_code: appliedCode || null,
        discount_kobo: discount?.discountKobo ?? 0,
      });

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
            posthog.capture("payment_cancelled", {
              restaurant_id: restaurant.id,
              provider: "paystack",
              total_kobo: initData.totalKobo,
            });
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
              posthog.capture("payment_cancelled", {
                restaurant_id: restaurant.id,
                provider: "monnify",
                total_kobo: initData.totalKobo,
              });
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
  // Promo discount: subtotal portion lowers the VAT/service base; total benefit
  // (incl. any free-delivery waiver) is subtracted from the grand total.
  const discountSubtotalKobo = discount && !discount.freeDelivery ? discount.discountKobo : 0;
  const discountTotalKobo = discount?.discountKobo ?? 0;
  // Loyalty reward — 0 when a promo is applied (promo wins, mirroring the
  // server). Its subtotal portion also lowers the VAT/service base; a delivery
  // waiver only reduces the grand total.
  const loyaltySubtotalKobo = loyaltyReward.subtotalKobo;
  const loyaltyTotalKobo = loyaltyReward.subtotalKobo + loyaltyReward.deliveryKobo;
  const discountedSubtotal = subtotal - discountSubtotalKobo - loyaltySubtotalKobo;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vatPct = (restaurant as any).vat_percentage ? Number((restaurant as any).vat_percentage) : 0;
  const vatKobo = vatPct > 0 ? Math.round(discountedSubtotal * vatPct / 100) : 0;
  const serviceFeeKobo =
    serviceChargePct > 0 || serviceChargeFixedKobo > 0
      ? Math.round(discountedSubtotal * serviceChargePct) + serviceChargeFixedKobo
      : 0;
  const total =
    subtotal + effectiveDeliveryFee + vatKobo + serviceFeeKobo - discountTotalKobo - loyaltyTotalKobo;
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
                    src={transformImage(restaurant.logo_url, { width: 64, height: 64 })}
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
                  if (e.key === "Enter" && isValidNigerianPhone(phone)) {
                    e.preventDefault();
                    lookupCustomer().then(enterCheckout);
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
                  lookupCustomer().then(enterCheckout);
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
                        onClick={() => selectSavedAddress(addr)}
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-black-700">
                    <span className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-black-400" />
                      Delivery address
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={gpsLoading}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {gpsLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Navigation size={12} />
                    )}
                    {gpsLoading ? "Locating…" : "Use my location"}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search your address, then pick from the list"
                    value={addressInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAddressInput(val);
                      setSelectedPlaceAddress("");
                      // Typed text invalidates the picked place AND its coords,
                      // so a stale pin can never price a different address.
                      setSelectedPlaceId(null);
                      setSelectedLat(null);
                      setSelectedLng(null);
                      setDeliveryFeeKobo(null);
                      setDeliveryFeeError("");
                      setDistanceKm(null);
                      setDurationMinutes(null);

                      if (predictionsDebounceRef.current) clearTimeout(predictionsDebounceRef.current);

                      if (val.trim().length < 3) {
                        predictionsAbortRef.current?.abort();
                        setPredictions([]);
                        setShowPredictions(false);
                        setPlacesSearching(false);
                        return;
                      }

                      setPlacesSearching(true);
                      predictionsDebounceRef.current = setTimeout(async () => {
                        // Cancel any in-flight lookup so out-of-order responses
                        // can't overwrite suggestions for newer input.
                        predictionsAbortRef.current?.abort();
                        const controller = new AbortController();
                        predictionsAbortRef.current = controller;
                        try {
                          const res = await fetch(
                            `/api/places/autocomplete?input=${encodeURIComponent(val)}`,
                            { signal: controller.signal }
                          );
                          if (!res.ok) {
                            setPredictions([]);
                            setShowPredictions(false);
                            setPlacesSearching(false);
                            return;
                          }
                          const data = await res.json();
                          const mapped = ((data.suggestions ?? []) as Array<{
                            description: string;
                            placeId: string;
                          }>).map((s) => ({
                            description: s.description,
                            place_id: s.placeId,
                          }));
                          setPredictions(mapped);
                          setShowPredictions(mapped.length > 0);
                          setPlacesSearching(false);
                        } catch (err) {
                          if (err instanceof DOMException && err.name === "AbortError") return;
                          setPredictions([]);
                          setShowPredictions(false);
                          setPlacesSearching(false);
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
                            setPlacesSearching(false);
                            void selectPrediction(p.description, p.place_id || null);
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
                {placesSearching && (
                  <p className="text-xs text-black-400 mt-1 flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Searching addresses…
                  </p>
                )}
                {!placesSearching &&
                  selectedLat === null &&
                  addressInput.trim().length >= 3 &&
                  predictions.length === 0 &&
                  !deliveryFeeLoading && (
                    <p className="text-xs text-black-400 mt-1">
                      No registered places match — try the area, estate or a nearby landmark.
                    </p>
                  )}
                {selectedLat !== null && deliveryFeeKobo !== null && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                    <Check size={12} /> Delivering to your selected location
                  </p>
                )}
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

            </div>
          )}

          {/* Note for the restaurant — shown for both pickup & delivery so any
              customer can leave a kitchen note (allergies, prep requests, etc.),
              not just delivery instructions. Maps to orders.special_instructions. */}
          <div className="px-4 py-4 border-t border-black-100">
            <label className="block text-xs font-medium text-black-500 mb-1.5">
              Note for the restaurant <span className="text-black-300 font-normal">(optional)</span>
            </label>
            <textarea
              placeholder="Allergies, no onions, birthday message…"
              value={restaurantNote}
              onChange={(e) => setRestaurantNote(e.target.value)}
              rows={3}
              className={cn(inputClass(false), "resize-none")}
            />
          </div>

          {/* Order summary */}
          <div className="border-t border-black-100 divide-y divide-black-50">
            {/* Itemised list of what's being ordered */}
            {items.map((item) => {
              const options = item.selectedOptions
                .flatMap((o) => o.choices.map((c) => c.choiceName))
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={`${item.menuItemId}-${item.optionsKey}`}
                  className="px-4 py-3 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="text-sm font-bold text-primary flex-shrink-0">
                      {item.quantity}×
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-black-900 leading-snug">{item.name}</p>
                      {options && (
                        <p className="text-xs text-black-400 mt-0.5 leading-snug">{options}</p>
                      )}
                      {item.specialRequest && (
                        <p className="text-xs text-black-400 mt-0.5 italic leading-snug">
                          “{item.specialRequest}”
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-black-900 flex-shrink-0">
                    {formatKobo(item.lineTotal)}
                  </span>
                </div>
              );
            })}

            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-black-500">
                <ShoppingBag size={14} className="text-black-400" />
                <span>Subtotal · {itemCount} {itemCount === 1 ? "item" : "items"}</span>
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

            {loyaltyTotalKobo > 0 && (
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-viridian-600">
                  <Gift size={14} />
                  Loyalty reward
                </span>
                <span className="text-sm font-bold text-viridian-600">
                  −{formatKobo(loyaltyTotalKobo)}
                </span>
              </div>
            )}

            {/* Loyalty progress */}
            {restaurant?.id && (
              <div className="px-4 pt-3">
                <LoyaltyProgressCard
                  restaurantId={restaurant.id}
                  restaurantSlug={restaurant.slug}
                  brandColor={restaurant.primary_color ?? "#7B2CBF"}
                  phone={isValidNigerianPhone(phone) ? normalizeToE164(phone) : phone}
                  phoneValid={isValidNigerianPhone(phone)}
                  subtotalKobo={subtotal}
                  deliveryFeeKobo={fulfillmentType === "delivery" ? deliveryFeeKobo ?? 0 : 0}
                  items={items.map((i) => ({ menuItemId: i.menuItemId, unitPriceKobo: i.price }))}
                  hasPromo={!!discount}
                  onRewardChange={setLoyaltyReward}
                />
              </div>
            )}

            {/* Promo code */}
            <div className="px-4 py-3 space-y-2.5">
              {discount && (
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                    <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <Check size={12} className="text-primary" />
                    </span>
                    {discount.label}
                    {discount.code && (
                      <span className="font-mono text-xs text-black-400">· {discount.code}</span>
                    )}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="text-sm font-semibold text-primary">
                      −{formatKobo(discountTotalKobo)}
                    </span>
                    {appliedCode && (
                      <button
                        type="button"
                        onClick={removePromo}
                        className="w-5 h-5 rounded-full hover:bg-black-100 flex items-center justify-center text-black-400"
                        aria-label="Remove discount"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </span>
                </div>
              )}
              {!appliedCode && (
                <div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Ticket
                        size={15}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-black-300"
                      />
                      <input
                        value={promoInput}
                        onChange={(e) => {
                          setPromoInput(e.target.value.toUpperCase());
                          if (discountError) setDiscountError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applyPromo();
                          }
                        }}
                        placeholder="Promo code"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-black-200 text-sm font-mono uppercase focus:outline-none focus:border-primary"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={applyPromo}
                      disabled={discountChecking || !promoInput.trim()}
                      className="px-4 rounded-xl border border-primary text-primary text-sm font-semibold hover:bg-primary/5 disabled:opacity-40 transition-colors"
                    >
                      {discountChecking ? <Loader2 size={15} className="animate-spin" /> : "Apply"}
                    </button>
                  </div>
                  {discountError && (
                    <p className="text-xs text-cinnabar-500 mt-1.5">{discountError}</p>
                  )}
                </div>
              )}
            </div>

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
