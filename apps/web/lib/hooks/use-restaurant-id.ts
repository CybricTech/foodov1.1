"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Client-side hook to get the authenticated merchant's restaurant_id.
 * Returns null while loading.
 */
export function useRestaurantId(): string | null {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const supabase = createBrowserClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("user_profiles")
        .select("restaurant_id")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.restaurant_id) setRestaurantId(data.restaurant_id);
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return restaurantId;
}
