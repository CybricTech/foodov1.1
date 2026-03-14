"use client";

import { createContext, useContext } from "react";
import type { Restaurant } from "@foodo/database";

interface RestaurantContextValue {
  restaurant: Restaurant;
}

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function RestaurantProvider({
  restaurant,
  children,
}: {
  restaurant: Restaurant;
  children: React.ReactNode;
}) {
  return (
    <RestaurantContext.Provider value={{ restaurant }}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant(): RestaurantContextValue {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error("useRestaurant must be used within RestaurantProvider");
  return ctx;
}
