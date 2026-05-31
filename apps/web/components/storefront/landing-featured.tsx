"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, UtensilsCrossed, ChevronRight } from "lucide-react";
import type { MenuItemWithOptions } from "@foodo/database";
import { MenuItemSheet } from "./menu-item-sheet";
import { CartBar } from "./cart-bar";
import { NewBadge } from "./menu-item-card";
import { ItemPrice, SalePill, SaleBanner, type MenuSale } from "./menu-price";

interface LandingFeaturedProps {
  items: MenuItemWithOptions[];
  restaurantSlug: string;
  restaurantAcceptsOrders: boolean;
  sale: MenuSale | null;
}

export function LandingFeatured({
  items,
  restaurantSlug,
  restaurantAcceptsOrders,
  sale,
}: LandingFeaturedProps) {
  const [selectedItem, setSelectedItem] = useState<MenuItemWithOptions | null>(null);
  const showSaleOnItems = !!sale && !sale.conditional;

  function handleTap(item: MenuItemWithOptions) {
    if (restaurantAcceptsOrders && item.is_available) {
      setSelectedItem(item);
    }
  }

  return (
    <>
      <section className="mt-8">
        {/* Store-wide sale banner */}
        {sale && (
          <div className="mb-5">
            <SaleBanner sale={sale} />
          </div>
        )}

        {/* Section header */}
        <div className="flex items-center justify-between px-5 mb-4">
          <div>
            <h2 className="text-xl font-bold text-black-900">Featured</h2>
            <p className="text-xs text-black-400 mt-0.5">Our most popular dishes</p>
          </div>
          <Link
            href={`/${restaurantSlug}/menu`}
            className="flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-80 transition-opacity cursor-pointer"
          >
            See all <ChevronRight size={15} />
          </Link>
        </div>

        {/* Horizontal card carousel */}
        <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-0 px-5 pb-3">
          {items.map((item) => {
            const unavailable = !item.is_available;
            const canTap = restaurantAcceptsOrders && !unavailable;

            return (
              <button
                key={item.id}
                onClick={() => handleTap(item)}
                disabled={!canTap}
                className="flex-shrink-0 w-44 text-left group focus:outline-none"
                style={{ cursor: canTap ? "pointer" : "default" }}
              >
                {/* Image */}
                <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black-100 mb-2.5 shadow-sm">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      fill
                      unoptimized
                      className={`object-cover transition-transform duration-300 ${
                        canTap ? "group-hover:scale-105" : "grayscale"
                      }`}
                      sizes="176px"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                      <UtensilsCrossed size={36} className="text-primary/25" />
                    </div>
                  )}

                  {/* Top-left badges: NEW and/or sale */}
                  {!unavailable && (item.show_new_badge || showSaleOnItems) && (
                    <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
                      {item.show_new_badge && <NewBadge />}
                      {showSaleOnItems && <SalePill percentOff={sale!.percentOff} />}
                    </div>
                  )}

                  {/* Add button — available items only */}
                  {canTap && (
                    <div className="absolute bottom-2.5 right-2.5 transition-transform duration-200 group-hover:scale-110">
                      <span className="w-9 h-9 rounded-xl bg-white shadow-md flex items-center justify-center text-primary">
                        <Plus size={18} strokeWidth={2.5} />
                      </span>
                    </div>
                  )}

                  {/* Unavailable overlay */}
                  {unavailable && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-white text-[11px] font-bold bg-black/50 px-2.5 py-1 rounded-full">
                        Unavailable
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <p
                  className={`text-sm font-semibold line-clamp-1 leading-snug ${
                    unavailable ? "text-black-400" : "text-black-900"
                  }`}
                >
                  {item.name}
                </p>
                <div className="text-sm font-bold mt-0.5">
                  <ItemPrice item={item} sale={sale} muted={unavailable} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Bottom sheet & cart */}
      <MenuItemSheet item={selectedItem} onClose={() => setSelectedItem(null)} sale={sale} />
      <CartBar />
    </>
  );
}
