"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SelectedOptionSnapshot } from "@foodo/database";

export interface CartItem {
  menuItemId: string;
  name: string;
  imageUrl?: string;
  /** Unit price in kobo */
  price: number;
  quantity: number;
  selectedOptions: SelectedOptionSnapshot[];
  /** Customer's free-text special request for this line item */
  specialRequest?: string;
  /** Stable key derived from sorted selected option choice IDs + special request */
  optionsKey: string;
  /** price * quantity in kobo */
  lineTotal: number;
}

interface CartStore {
  restaurantId: string | null;
  restaurantSlug: string | null;
  items: CartItem[];
  fulfillmentType: "delivery" | "pickup";
  setFulfillmentType: (type: "delivery" | "pickup") => void;
  addItem: (
    restaurantId: string,
    restaurantSlug: string,
    item: Omit<CartItem, "lineTotal">
  ) => void;
  removeItem: (menuItemId: string, optionsKey: string) => void;
  updateQuantity: (
    menuItemId: string,
    optionsKey: string,
    quantity: number
  ) => void;
  clear: () => void;
  totalItems: () => number;
  subtotalKobo: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      restaurantId: null,
      restaurantSlug: null,
      items: [],
      fulfillmentType: "delivery",

      setFulfillmentType(type) {
        set({ fulfillmentType: type });
      },

      addItem(restaurantId, restaurantSlug, item) {
        set((state) => {
          // Clear cart if restaurant changes
          if (state.restaurantId && state.restaurantId !== restaurantId) {
            return {
              restaurantId,
              restaurantSlug,
              items: [{ ...item, lineTotal: item.price * item.quantity }],
            };
          }

          const existing = state.items.find(
            (i) =>
              i.menuItemId === item.menuItemId &&
              i.optionsKey === item.optionsKey
          );

          if (existing) {
            return {
              restaurantId,
              restaurantSlug,
              items: state.items.map((i) =>
                i.menuItemId === item.menuItemId &&
                i.optionsKey === item.optionsKey
                  ? {
                      ...i,
                      quantity: i.quantity + item.quantity,
                      lineTotal: i.price * (i.quantity + item.quantity),
                    }
                  : i
              ),
            };
          }

          return {
            restaurantId,
            restaurantSlug,
            items: [
              ...state.items,
              { ...item, lineTotal: item.price * item.quantity },
            ],
          };
        });
      },

      removeItem(menuItemId, optionsKey) {
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.menuItemId === menuItemId && i.optionsKey === optionsKey)
          ),
        }));
      },

      updateQuantity(menuItemId, optionsKey, quantity) {
        if (quantity <= 0) {
          get().removeItem(menuItemId, optionsKey);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.menuItemId === menuItemId && i.optionsKey === optionsKey
              ? { ...i, quantity, lineTotal: i.price * quantity }
              : i
          ),
        }));
      },

      clear() {
        set({ restaurantId: null, restaurantSlug: null, items: [], fulfillmentType: "delivery" });
      },

      totalItems() {
        return get().items.reduce((sum, i) => sum + i.quantity, 0);
      },

      subtotalKobo() {
        return get().items.reduce((sum, i) => sum + i.lineTotal, 0);
      },
    }),
    {
      name: "foodo-cart",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : (null as never)
      ),
    }
  )
);

/**
 * Build a stable options key from selected option choices.
 * Sorts choice IDs so order doesn't matter.
 */
export function buildOptionsKey(
  selectedOptions: SelectedOptionSnapshot[]
): string {
  const ids = selectedOptions.flatMap((opt) =>
    opt.choices.map((c) => `${opt.optionId}:${c.choiceId}`)
  );
  return ids.sort().join("|") || "no-options";
}
