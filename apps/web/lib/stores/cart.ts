"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SelectedOptionSnapshot } from "@foodo/database";

/**
 * How long a cart may sit untouched before it's considered stale and dropped on
 * next load. The cart persists in localStorage indefinitely, so without this a
 * customer can return days later to prices/items that have since changed. Live
 * price + availability are still re-verified server-side at checkout
 * (see app/api/checkout/initialize) — this is the complementary front-end
 * guard that stops a long-abandoned cart from showing stale contents at all.
 */
const CART_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

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
  /** Epoch ms the cart contents were last modified — drives staleness expiry. */
  updatedAt: number;
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
      updatedAt: 0,

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
              updatedAt: Date.now(),
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
              updatedAt: Date.now(),
            };
          }

          return {
            restaurantId,
            restaurantSlug,
            items: [
              ...state.items,
              { ...item, lineTotal: item.price * item.quantity },
            ],
            updatedAt: Date.now(),
          };
        });
      },

      removeItem(menuItemId, optionsKey) {
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.menuItemId === menuItemId && i.optionsKey === optionsKey)
          ),
          updatedAt: Date.now(),
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
          updatedAt: Date.now(),
        }));
      },

      clear() {
        set({ restaurantId: null, restaurantSlug: null, items: [], fulfillmentType: "delivery", updatedAt: 0 });
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
      // On load, drop a cart that's been untouched past the TTL (or one persisted
      // before updatedAt existed, which we can't date and treat as stale) so the
      // customer never sees days-old items/prices. clear() resets the timestamp.
      onRehydrateStorage: () => (state) => {
        if (!state || state.items.length === 0) return;
        const age = Date.now() - (state.updatedAt || 0);
        if (age > CART_TTL_MS) state.clear();
      },
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
    opt.choices.map((c: { choiceId: string }) => `${opt.optionId}:${c.choiceId}`)
  );
  return ids.sort().join("|") || "no-options";
}
