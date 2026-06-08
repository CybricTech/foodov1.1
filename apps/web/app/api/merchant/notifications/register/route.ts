/**
 * POST /api/merchant/notifications/register
 *
 * Mobile-facing (Bearer or cookie auth). The Kitchyn Merchant app calls this
 * after login / session restore with its Expo push token. We re-derive the
 * caller's restaurant from their own `user_profiles` row (never trusting a
 * client-supplied restaurant_id) and UPSERT the token into `device_tokens`,
 * keyed on `expo_push_token` so a re-registering device refreshes in place.
 *
 * The send-push Edge Function later reads these rows by restaurant_id to fan a
 * new-order notification out to every device.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (
    !profile?.restaurant_id ||
    (profile.role !== "merchant_owner" && profile.role !== "merchant_staff")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, platform } = body as { token?: string; platform?: string };

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }
  // Expo tokens look like "ExponentPushToken[xxxxxxxx]". Reject anything else
  // (e.g. a raw FCM/APNs token sent by mistake) so we never POST garbage to Expo.
  if (!token.startsWith("ExponentPushToken[")) {
    return NextResponse.json({ error: "Invalid Expo push token" }, { status: 400 });
  }

  const normalizedPlatform =
    platform === "ios" || platform === "android" ? platform : null;

  const { error } = await serviceClient
    .from("device_tokens")
    .upsert(
      {
        user_id: user.id,
        restaurant_id: profile.restaurant_id,
        expo_push_token: token,
        platform: normalizedPlatform,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "expo_push_token" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
