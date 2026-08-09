"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRestaurant } from "@/components/storefront/restaurant-context";
import { Phone, PackageSearch, ArrowLeft, AlertCircle, Clock, MapPin, Bike, Package } from "lucide-react";
import { cn } from "@foodo/ui";
import { formatKobo, ORDER_STATUS_LABELS } from "@foodo/utils";

interface ActiveOrder {
  id: string;
  order_number: string;
  status: string;
  fulfillment_type: string;
  customer_name: string | null;
  total_kobo: number;
  created_at: string;
  delivery_address: string | null;
}

function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  const variants = new Set<string>([raw.trim()]);

  if (digits.startsWith("234") && digits.length === 13) {
    // Covers both +2349036912213 and 2349036912213
    variants.add("+" + digits);          // +2349036912213
    variants.add(digits);                // 2349036912213
    variants.add("0" + digits.slice(3)); // 09036912213
  } else if (digits.startsWith("0") && digits.length === 11) {
    // Local format: 09036912213
    const intl = "234" + digits.slice(1);
    variants.add("+" + intl); // +2349036912213
    variants.add(intl);       // 2349036912213
  }

  return Array.from(variants);
}

function StatusBadge({ status, brandColor }: { status: string; brandColor: string }) {
  const label = ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS] ?? status;
  const isTerminal = status === "delivered" || status === "cancelled";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
        isTerminal && "bg-black-100 text-black-500"
      )}
      style={!isTerminal ? { backgroundColor: `${brandColor}15`, color: brandColor } : undefined}
    >
      {label}
    </span>
  );
}

function FulfillmentIcon({ type }: { type: string }) {
  return type === "delivery" ? (
    <Bike size={14} className="text-black-400" />
  ) : (
    <Package size={14} className="text-black-400" />
  );
}

export default function TrackOrderPage() {
  const { restaurant } = useRestaurant();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<ActiveOrder[] | null>(null);

  const brandColor = restaurant.primary_color ?? "#2D6A4F";

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed) return;

    setSearching(true);
    setError("");
    setOrders(null);

    // Searched server-side via /api/orders/lookup. This used to be a direct
    // browser query, which only worked because `orders` carried a
    // `USING (true)` policy — the same request could have dropped the phone
    // filter and walked the whole table. The route is scoped to this restaurant
    // and rate limited, since phone numbers are guessable.
    const query = new URLSearchParams({ restaurantId: restaurant.id });
    for (const v of phoneVariants(trimmed)) query.append("phone", v);

    let data: ActiveOrder[] | null = null;
    try {
      const res = await fetch(`/api/orders/lookup?${query.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 429) {
        setError("Too many attempts. Please wait a moment and try again.");
        setSearching(false);
        return;
      }
      if (!res.ok) throw new Error("lookup failed");
      data = ((await res.json()) as { orders: ActiveOrder[] }).orders;
    } catch {
      setError("Something went wrong. Please try again.");
      setSearching(false);
      return;
    }

    if (!data || data.length === 0) {
      setError("No active orders found for that phone number. Please check and try again.");
      setSearching(false);
      return;
    }

    setOrders(data);
    setSearching(false);
  }

  return (
    <div className="min-h-screen bg-black-50 flex flex-col">
      {/* ── Branded Header ─────────────────────────────────────────── */}
      <div className="px-4 pt-6 pb-8 text-white relative overflow-hidden" style={{ backgroundColor: brandColor }}>
        <div className="flex items-center gap-3 relative z-10">
          <button
            onClick={() => router.push(`/${restaurant.slug}`)}
            className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors cursor-pointer"
            aria-label="Back to menu"
          >
            <ArrowLeft size={16} className="text-white" />
          </button>
          <div>
            <p className="text-xs text-white/70 font-medium">{restaurant.name}</p>
            <h1 className="font-bold text-white text-xl leading-tight">Track your order</h1>
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col px-4 -mt-4 relative z-10">
        {/* Search card */}
        <div className="bg-white rounded-2xl border border-black-100 shadow-sm p-5">
          {!orders ? (
            <>
              <div className="flex flex-col items-center text-center mb-6">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${brandColor}12` }}
                >
                  <PackageSearch size={32} style={{ color: brandColor }} strokeWidth={1.5} />
                </div>
                <h2 className="text-lg font-bold text-black-900">Enter your phone number</h2>
                <p className="text-sm text-black-400 mt-1 max-w-xs leading-relaxed">
                  We’ll find all your active orders linked to this number.
                </p>
              </div>

              <form onSubmit={handleTrack} className="w-full space-y-4">
                <div className="relative">
                  <Phone
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-black-300 pointer-events-none"
                  />
                  <input
                    ref={inputRef}
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="e.g. 0803 123 4567"
                    className={cn(
                      "w-full pl-11 pr-4 py-3.5 text-sm font-medium text-black-900",
                      "bg-white border rounded-2xl",
                      "placeholder:text-black-300 placeholder:font-normal",
                      "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                      "transition-all duration-150",
                      error
                        ? "border-cinnabar-300 focus:ring-cinnabar-100 focus:border-cinnabar-400"
                        : "border-black-200"
                    )}
                    autoComplete="tel"
                    inputMode="tel"
                    id="phone-input"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 text-cinnabar-500 text-xs px-1">
                    <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!phone.trim() || searching}
                  className={cn(
                    "w-full py-3.5 rounded-2xl text-sm font-semibold text-white",
                    "hover:opacity-90 disabled:opacity-50",
                    "transition-all duration-150 cursor-pointer",
                    "flex items-center justify-center gap-2 active:scale-[0.98]"
                  )}
                  style={{ backgroundColor: brandColor }}
                >
                  {searching ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Searching…
                    </>
                  ) : (
                    "Find My Orders"
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-black-900">Your orders</h2>
                  <p className="text-xs text-black-400 mt-0.5">
                    Found {orders.length} order{orders.length !== 1 ? "s" : ""} for {phone}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setOrders(null);
                    setPhone("");
                    setError("");
                  }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border hover:bg-black-50 transition-colors"
                  style={{ borderColor: `${brandColor}40`, color: brandColor }}
                >
                  Search again
                </button>
              </div>

              <div className="space-y-3">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => router.push(`/${restaurant.slug}/orders/${order.id}`)}
                    className="w-full text-left bg-white border border-black-100 rounded-2xl p-4 hover:shadow-md hover:border-black-200 transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-black text-black-900">#{order.order_number}</span>
                          <StatusBadge status={order.status} brandColor={brandColor} />
                        </div>
                        <p className="text-xs text-black-500 truncate">
                          {order.customer_name ?? "Guest"} · {formatKobo(order.total_kobo)}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-black-400">
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(order.created_at).toLocaleDateString("en-NG", {
                              timeZone: "Africa/Lagos",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="flex items-center gap-1">
                            <FulfillmentIcon type={order.fulfillment_type} />
                            {order.fulfillment_type === "delivery" ? "Delivery" : "Pickup"}
                          </span>
                        </div>
                        {order.fulfillment_type === "delivery" && order.delivery_address && (
                          <p className="text-[11px] text-black-400 mt-1.5 flex items-center gap-1 truncate">
                            <MapPin size={11} />
                            {order.delivery_address}
                          </p>
                        )}
                      </div>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${brandColor}12` }}
                      >
                        <ArrowLeft size={14} style={{ color: brandColor }} className="rotate-180" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
