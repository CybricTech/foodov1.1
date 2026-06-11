/**
 * POST /api/merchant/notifications/unregister
 *
 * Mobile-facing (Bearer or cookie auth). Called on logout, BEFORE the mobile
 * app clears its session, so the Bearer token is still valid. Deletes the
 * `device_tokens` row for the supplied Expo token, scoped to the caller — a
 * user can only remove their own device so this never affects another account.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token } = body as { token?: string };
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from("device_tokens")
    .delete()
    .eq("expo_push_token", token)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
