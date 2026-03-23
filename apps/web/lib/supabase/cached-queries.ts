/**
 * Request-scoped cached auth queries for Server Components.
 *
 * React's `cache()` deduplicates calls within a single request — so when both
 * the layout and a page call `getDashboardUser()`, Supabase is only hit once.
 *
 * Note: only auth metadata is returned here. Each caller creates its own
 * Supabase client for data queries to avoid sharing mutable client state.
 */
import { cache } from "react";
import { createServerClient } from "./server";

export const getDashboardUser = cache(async () => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("restaurant_id, full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile) return null;
  if (!profile.restaurant_id) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    restaurantId: profile.restaurant_id as string,
    fullName: profile.full_name ?? "",
    role: profile.role as "merchant_owner" | "merchant_staff",
  };
});
