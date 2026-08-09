"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
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

  // Reads go through /api/orders/[id]/track on the service client. The browser
  // used to query `orders` directly, which only worked because of a
  // `USING (true)` policy that also allowed enumerating every order on the
  // platform. With that policy gone a realtime subscription is no longer
  // possible either (realtime enforces RLS), so the banner polls instead.
  useEffect(() => {
    const storageKey = `kitchyn:lastOrder:${restaurant.slug}`;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    function readStoredOrderId(): string | null {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(storageKey);
      } catch {
        return null;
      }
      if (!raw) return null;

      let parsed: { orderId: string; savedAt: number } | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      if (!parsed?.orderId || !parsed?.savedAt) return null;

      if (Date.now() - parsed.savedAt > TTL_MS) {
        try { localStorage.removeItem(storageKey); } catch {}
        return null;
      }
      return parsed.orderId;
    }

    function forget() {
      try { localStorage.removeItem(storageKey); } catch {}
      setBanner(null);
      if (timer) clearInterval(timer);
    }

    async function poll(orderId: string) {
      let status: string | undefined;
      try {
        const res = await fetch(`/api/orders/${orderId}/track`, { cache: "no-store" });
        if (!res.ok) return;
        status = ((await res.json()) as { status?: string }).status;
      } catch {
        return;
      }
      if (cancelled || !status) return;

      if (TERMINAL_STATUSES.includes(status as (typeof TERMINAL_STATUSES)[number])) {
        forget();
        return;
      }
      setBanner({ orderId, status: status as ActiveStatus });
    }

    const orderId = readStoredOrderId();
    if (!orderId) return;

    poll(orderId);
    timer = setInterval(() => poll(orderId), 12_000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
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
