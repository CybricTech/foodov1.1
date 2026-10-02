import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";
import { getRiderContactStatus } from "@/lib/delivery/rider-contact";
import { parseRiderContactInput } from "@foodo/utils";

/**
 * The number a Bolt driver calls when collecting from this store.
 *
 * GET   — the merchant's choice, what it resolves to, and whether the rollout
 *         includes their store yet (RiderContactStatus).
 * PATCH — { phone: string | null }. A number sets a dedicated rider line;
 *         null or "" goes back to following their WhatsApp alert number.
 *
 * Shared by web Settings and the mobile app (Bearer auth via getRequestUser).
 * It's a route rather than a direct PostgREST write because the rollout state
 * lives in platform_settings, which merchants can't read, and because the
 * number is validated against the same rules the booking path applies. The
 * restaurants CHECK constraint backs that up for any path that skips this.
 */
async function requireMerchant(request: NextRequest) {
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

  return { restaurantId: profile.restaurant_id as string, serviceClient };
}

export async function GET(request: NextRequest) {
  const auth = await requireMerchant(request);
  if (auth.error) return auth.error;

  const status = await getRiderContactStatus(auth.serviceClient, auth.restaurantId);
  if (!status) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  return NextResponse.json(status);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireMerchant(request);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseRiderContactInput((body as { phone?: unknown } | null)?.phone);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await auth.serviceClient
    .from("restaurants")
    .update({ rider_contact_phone: parsed.phone })
    .eq("id", auth.restaurantId);

  if (error) {
    console.error(`[rider-contact] save failed restaurant=${auth.restaurantId}: ${error.message}`);
    return NextResponse.json({ error: "Couldn't save your rider contact. Please try again." }, { status: 500 });
  }

  const status = await getRiderContactStatus(auth.serviceClient, auth.restaurantId);
  return NextResponse.json(status);
}
