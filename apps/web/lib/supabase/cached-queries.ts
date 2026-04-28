/**
 * Request-scoped cached auth queries for Server Components.
 *
 * Performance notes:
 * - `getUser()` validates the JWT against the Supabase Auth server, which is
 *   the secure approach for server-side usage. `getSession()` only reads from
 *   the cookie and cannot be trusted on the server.
 * - The profile query is wrapped in `unstable_cache` so it's fetched at most
 *   once per minute instead of on every page navigation.
 * - React `cache()` deduplicates calls within a single render pass — layout
 *   and page both calling this only hits the Auth server once.
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

  // getUser() authenticates against the Supabase Auth server — secure for server use
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profile = await getCachedProfile(user.id);

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
