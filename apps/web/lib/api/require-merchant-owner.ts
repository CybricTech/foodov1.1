import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";

/**
 * Verifies the request comes from the owner of a store, and returns which one.
 *
 * Accepts both the web cookie session and the mobile app's Bearer token (via
 * getRequestUser). Owner-only, not staff: the settings it guards change where
 * riders are sent, which is the owner's call.
 *
 * Extracted from /api/merchant/pickup-point so that route and its /preview
 * sibling can't drift apart on who is allowed in.
 */
export async function requireMerchantOwner(
  request: NextRequest
): Promise<{ error: NextResponse; restaurantId?: never } | { error?: never; restaurantId: string }> {
  const user = await getRequestUser(request);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id || profile.role !== "merchant_owner") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { restaurantId: profile.restaurant_id as string };
}
