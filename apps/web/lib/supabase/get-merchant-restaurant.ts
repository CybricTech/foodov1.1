/**
 * The restaurant a dashboard API caller belongs to, over either auth transport
 * (cookie session on web, `Authorization: Bearer` from the mobile app).
 *
 * Same contract as `getDashboardUser()` — any profile with a
 * restaurant_id — but usable from routes the mobile app calls, which have no
 * cookie session.
 */
import type { NextRequest } from "next/server";
import { createServiceClient } from "./server";
import { getRequestUser } from "./get-request-user";

export async function getMerchantRestaurantId(request: NextRequest): Promise<string | null> {
  const user = await getRequestUser(request);
  if (!user) return null;

  const { data: profile } = await createServiceClient()
    .from("user_profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .single();

  return profile?.restaurant_id ?? null;
}
