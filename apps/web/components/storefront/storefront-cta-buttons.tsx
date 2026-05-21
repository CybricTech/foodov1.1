"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StorefrontSplash } from "./storefront-splash";

interface StorefrontCTAButtonsProps {
  restaurantSlug: string;
  logoUrl: string | null;
  brandColor: string;
  restaurantName: string;
  acceptsOrders: boolean;
}

export function StorefrontCTAButtons({
  restaurantSlug,
  logoUrl,
  brandColor,
  restaurantName,
  acceptsOrders,
}: StorefrontCTAButtonsProps) {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(false);

  function handleNavigate(e: React.MouseEvent) {
    e.preventDefault();
    setShowSplash(true);
    setTimeout(() => {
      router.push(`/${restaurantSlug}/menu`);
    }, 1700);
  }

  return (
    <>
      {showSplash && (
        <StorefrontSplash
          logoUrl={logoUrl}
          brandColor={brandColor}
          restaurantName={restaurantName}
        />
      )}
      <div className="flex gap-2.5 pt-1">
        <button
          onClick={handleNavigate}
          className="flex-1 bg-primary text-white text-center py-3.5 rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
        >
          {acceptsOrders ? "Order now" : "Browse menu"}
        </button>
        <button
          onClick={handleNavigate}
          className="flex-1 bg-white/15 backdrop-blur-sm text-white text-center py-3.5 rounded-2xl font-semibold text-sm border border-white/30 hover:bg-white/25 transition-colors cursor-pointer"
        >
          View menu
        </button>
      </div>
    </>
  );
}
