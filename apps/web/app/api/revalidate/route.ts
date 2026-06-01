import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { menuTag } from "@/lib/supabase/storefront-cache";

/**
 * Busts the storefront menu cache for the authenticated merchant's restaurant.
 *
 * The dashboard writes menu changes client-side (no server actions), so there's
 * no automatic hook to invalidate the storefront cache. The menu manager calls
 * this route after every successful edit (price, availability, add/remove, etc.)
 * so customers see the change immediately rather than waiting out the 60s TTL.
 *
 * Auth: derives the restaurant from the merchant's own session — a caller can
 * only ever revalidate their own restaurant, never an arbitrary tag.
 */
export async function POST() {
  const user = await getDashboardUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag(menuTag(user.restaurantId));
  return NextResponse.json({ revalidated: true });
}
