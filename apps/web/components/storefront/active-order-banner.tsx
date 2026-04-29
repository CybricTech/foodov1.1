"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRestaurant } from "@/components/storefront/restaurant-context";

const TERMINAL_STATUSES = ["delivered", "cancelled"] as const;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type ActiveStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready_for_pickup"
  | "assigned_to_rider"
  | "in_transit";

function bannerCopy(status: ActiveStatus): string {
  switch (status) {
    case "ready_for_pickup":
      return "Your order is ready for pickup";
    case "assigned_to_rider":
    case "in_transit":
      return "Your order is on the way";
    default:
      return "Your order is being prepared";
  }
}

interface BannerState {
  orderId: string;
  status: ActiveStatus;
}

export function ActiveOrderBanner() {
  const { restaurant } = useRestaurant();
  const [banner, setBanner] = useState<BannerState | null>(null);

  useEffect(() => {
    const storageKey = `kitchyn:lastOrder:${restaurant.slug}`;

    let channel: ReturnType<ReturnType<typeof createBrowserClient>["channel"]> | null = null;

    async function init() {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(storageKey);
      } catch {
        return;
      }

      if (!raw) return;

      let parsed: { orderId: string; savedAt: number } | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      if (!parsed?.orderId || !parsed?.savedAt) return;

      if (Date.now() - parsed.savedAt > TTL_MS) {
        try { localStorage.removeItem(storageKey); } catch {}
        return;
      }

      const { orderId } = parsed;
      const supabase = createBrowserClient();

      const { data, error } = await supabase
        .from("orders")
        .select("id, status, fulfillment_type, order_number")
        .eq("id", orderId)
        .single();

      if (error || !data) return;

      if (TERMINAL_STATUSES.includes(data.status as (typeof TERMINAL_STATUSES)[number])) {
        try { localStorage.removeItem(storageKey); } catch {}
        return;
      }

      setBanner({ orderId, status: data.status as ActiveStatus });

      channel = supabase
        .channel(`active-order-banner-${orderId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "orders",
            filter: `id=eq.${orderId}`,
          },
          (payload) => {
            const newStatus = (payload.new as { status?: string }).status;
            if (!newStatus) return;

            if (TERMINAL_STATUSES.includes(newStatus as (typeof TERMINAL_STATUSES)[number])) {
              try { localStorage.removeItem(storageKey); } catch {}
              setBanner(null);
            } else {
              setBanner({ orderId, status: newStatus as ActiveStatus });
            }
          }
        )
        .subscribe();
    }

    init();

    return () => {
      channel?.unsubscribe();
    };
  }, [restaurant.slug]);

  if (!banner) return null;

  return (
    <div className="sticky top-0 z-40 w-full bg-primary px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <UtensilsCrossed size={18} className="text-white flex-shrink-0" strokeWidth={2} />
        <span className="text-white text-sm font-medium truncate">
          {bannerCopy(banner.status)}
        </span>
      </div>
      <Link
        href={`/${restaurant.slug}/orders/${banner.orderId}`}
        className="flex-shrink-0 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/30 transition-colors"
      >
        Track &rarr;
      </Link>
    </div>
  );
}
