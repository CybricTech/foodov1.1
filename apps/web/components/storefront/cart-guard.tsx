"use client";

import { usePathname } from "next/navigation";

import { useEffect } from "react";
import { useRestaurant } from "./restaurant-context";
import { useCartStore } from "@/lib/stores/cart";

/**
 * Clears the cart when the user navigates to a different restaurant's storefront.
 * The cart store only clears on addItem() from a new restaurant, not on navigation.
 */
export function CartGuard() {
  const isPaymentLink = usePathname().includes("/pay/");
  const { restaurant } = useRestaurant();
  const restaurantId = useCartStore((s) => s.restaurantId);
  const clear = useCartStore((s) => s.clear);

  useEffect(() => {
    if (!isPaymentLink && restaurantId && restaurantId !== restaurant.id) {
      clear();
    }
  }, [restaurant.id, restaurantId, clear, isPaymentLink]);

  return null;
}
