"use client";

import { useState } from "react";

import { useCartStore } from "@/lib/stores/cart";
import { formatKobo } from "@foodo/utils";
import { CartSheet } from "./cart-sheet";

export function CartBar() {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotalKobo)();
  const totalItems = useCartStore((s) => s.totalItems)();
  const slug = useCartStore((s) => s.restaurantSlug);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (items.length === 0 || !slug) return null;

  return (
    <>
      <div className="fixed bottom-4 left-4 right-4 z-30 pointer-events-none">
        <button
          onClick={() => setSheetOpen(true)}
          className="pointer-events-auto w-full flex items-center justify-between bg-primary hover:bg-primary/90 text-white px-5 py-4 rounded-2xl shadow-xl transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-bold text-sm flex-shrink-0">
              {totalItems}
            </span>
            <span className="font-semibold">View cart</span>
          </div>
          <span className="font-bold">{formatKobo(subtotal)}</span>
        </button>
      </div>

      <CartSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
