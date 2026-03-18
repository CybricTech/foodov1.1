"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatKobo } from "@foodo/utils";
import type { MenuItemWithOptions } from "@foodo/database";
import { MenuItemSheet } from "./menu-item-sheet";
import { CartBar } from "./cart-bar";

interface LandingFeaturedProps {
  items: MenuItemWithOptions[];
  restaurantSlug: string;
  restaurantAcceptsOrders: boolean;
}

export function LandingFeatured({
  items,
  restaurantSlug,
  restaurantAcceptsOrders,
}: LandingFeaturedProps) {
  const [selectedItem, setSelectedItem] = useState<MenuItemWithOptions | null>(null);

  return (
    <>
      <section className="mt-8 px-4">
        {/* Section header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-black-900">Featured</h2>
          <Link
            href={`/${restaurantSlug}/menu`}
            className="flex items-center gap-1 text-sm font-medium text-black-900 border border-black-200 rounded-full px-4 py-1.5 hover:bg-black-50 transition-colors"
          >
            View menu <span className="text-base leading-none">›</span>
          </Link>
        </div>

        {/* Horizontal card carousel */}
        <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() =>
                restaurantAcceptsOrders && item.is_available
                  ? setSelectedItem(item)
                  : undefined
              }
              className="flex-shrink-0 w-44 text-left focus:outline-none"
            >
              {/* Square image */}
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black-100 mb-2.5">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    fill
                    className="object-cover"
                    sizes="176px"
                  />
                ) : (
                  <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                    <span className="text-4xl">🍽</span>
                  </div>
                )}
                {/* Add button overlay */}
                {item.is_available && (
                  <div className="absolute bottom-2 right-2">
                    <span className="w-9 h-9 rounded-xl bg-white shadow-md flex items-center justify-center text-xl font-bold text-black-900 leading-none">
                      +
                    </span>
                  </div>
                )}
                {!item.is_available && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <span className="text-white text-xs font-semibold bg-black/50 px-2 py-1 rounded-full">
                      Unavailable
                    </span>
                  </div>
                )}
              </div>

              <p className="text-sm font-semibold text-black-900 line-clamp-2 leading-snug">
                {item.name}
              </p>
              <p className="text-sm font-bold text-primary mt-1">
                {formatKobo(item.price_kobo)}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Bottom sheet & cart */}
      <MenuItemSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
      <CartBar />
    </>
  );
}
