"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRestaurant } from "@/components/storefront/restaurant-context";
import { createBrowserClient } from "@/lib/supabase/client";
import { Search, PackageSearch, ArrowLeft, AlertCircle } from "lucide-react";
import { cn } from "@foodo/ui";

export default function TrackOrderPage() {
  const { restaurant } = useRestaurant();
  const router = useRouter();
  const supabase = createBrowserClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = orderNumber.trim();
    if (!trimmed) return;

    setSearching(true);
    setError("");

    // Search for order by order_number within this restaurant
    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("id")
      .eq("restaurant_id", restaurant.id)
      .eq("order_number", trimmed)
      .single();

    if (fetchErr || !order) {
      // Try case-insensitive match and partial match
      const { data: fuzzyOrder } = await supabase
        .from("orders")
        .select("id, order_number")
        .eq("restaurant_id", restaurant.id)
        .ilike("order_number", `%${trimmed}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (fuzzyOrder) {
        router.push(`/${restaurant.slug}/orders/${fuzzyOrder.id}`);
        return;
      }

      setError("No order found with that number. Please check and try again.");
      setSearching(false);
      return;
    }

    router.push(`/${restaurant.slug}/orders/${order.id}`);
  }

  return (
    <div className="min-h-screen bg-black-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-black-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/${restaurant.slug}`)}
            className="w-9 h-9 rounded-xl bg-black-50 flex items-center justify-center hover:bg-black-100 transition-colors cursor-pointer"
            aria-label="Back to menu"
          >
            <ArrowLeft size={16} className="text-black-600" />
          </button>
          <div>
            <p className="text-xs text-black-400 font-medium">{restaurant.name}</p>
            <h1 className="font-bold text-black-900 text-lg leading-tight">
              Track your order
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center px-4 pt-12">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <PackageSearch size={36} className="text-primary" strokeWidth={1.5} />
        </div>

        <h2 className="text-lg font-bold text-black-900 text-center">
          Enter your order number
        </h2>
        <p className="text-sm text-black-400 text-center mt-1.5 mb-8 max-w-xs leading-relaxed">
          You can find it in the SMS or email confirmation you received after placing your order.
        </p>

        {/* Search form */}
        <form onSubmit={handleTrack} className="w-full max-w-sm space-y-4">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-black-300 pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={orderNumber}
              onChange={(e) => {
                setOrderNumber(e.target.value.toUpperCase());
                if (error) setError("");
              }}
              placeholder="e.g. ORD-1745581234567"
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
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              id="order-number-input"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-cinnabar-500 text-xs px-1">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!orderNumber.trim() || searching}
            className={cn(
              "w-full py-3.5 rounded-2xl text-sm font-semibold",
              "bg-primary text-white",
              "hover:opacity-90 disabled:opacity-50",
              "transition-all duration-150 cursor-pointer",
              "flex items-center justify-center gap-2"
            )}
          >
            {searching ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Searching…
              </>
            ) : (
              "Track Order"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
