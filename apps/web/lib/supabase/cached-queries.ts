/**
 * Request-scoped cached auth queries for Server Components.
 *
 * Performance notes:
 * - `getSession()` reads from the cookie (no network call), unlike `getUser()`
 *   which validates the JWT against the Supabase Auth server on every request.
 * - The profile query is wrapped in `unstable_cache` so it's fetched at most
 *   once per minute instead of on every page navigation.
 * - React `cache()` deduplicates calls within a single render pass — layout
 *   and page both calling this only hits the session cookie once.
 * - `unstable_cache` cannot call cookies() internally, so we use the service
 *   client (no cookie dependency) for the cached profile lookup.
 */
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServerClient, createServiceClient } from "./server";

const getCachedProfile = unstable_cache(
  async (userId: string) => {
    // Use service client — does NOT call cookies(), safe inside unstable_cache
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("user_profiles")
      .select("restaurant_id, full_name, role")
      .eq("id", userId)
      .single();
    return data;
  },
  ["user-profile"],
  { revalidate: 60 }
);

export const getDashboardUser = cache(async () => {
  const supabase = await createServerClient();

  // getSession reads from cookie — no network round-trip to Auth server
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return null;

  const profile = await getCachedProfile(session.user.id);

  if (!profile) return null;
  if (!profile.restaurant_id) return null;

  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    restaurantId: profile.restaurant_id as string,
    fullName: profile.full_name ?? "",
    role: profile.role as "merchant_owner" | "merchant_staff",
  };
});
