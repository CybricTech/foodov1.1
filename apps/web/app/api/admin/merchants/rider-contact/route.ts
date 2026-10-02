import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getRiderContactStatus } from "@/lib/delivery/rider-contact";
import { parseRiderContactInput } from "@foodo/utils";

/**
 * Admin control over one store's rider contact.
 *
 * PATCH { restaurantId, selected?: boolean, phone?: string | null }
 *
 *   selected — "use this store's number". Only an admin can set it, because it
 *              decides whether strangers are handed this merchant's number.
 *              The restaurants guard trigger enforces that for every other
 *              write path. This route writes with the service client, which
 *              the guard lets through. Called from the merchant's admin page
 *              and from the store list in Settings › Dispatch.
 *   phone    — sets the dedicated rider number on the merchant's behalf, under
 *              the same rules as the merchant's own Settings. Support usually
 *              hears first that a number goes unanswered.
 *
 * Responds with the refreshed { status, selected } so callers re-render from
 * what was actually saved.
 */
async function requireAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { serviceClient };
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { restaurantId, selected, phone } = (body ?? {}) as {
    restaurantId?: unknown;
    selected?: unknown;
    phone?: unknown;
  };

  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (selected !== undefined) {
    if (typeof selected !== "boolean") {
      return NextResponse.json({ error: "selected must be true or false" }, { status: 400 });
    }
    update.rider_contact_selected = selected;
  }

  if (phone !== undefined) {
    const parsed = parseRiderContactInput(phone);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    update.rider_contact_phone = parsed.phone;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data: saved, error } = await auth.serviceClient
    .from("restaurants")
    .update(update)
    .eq("id", restaurantId)
    .select("rider_contact_selected")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const status = await getRiderContactStatus(auth.serviceClient, restaurantId);

  return NextResponse.json({
    status,
    selected: (saved as { rider_contact_selected: boolean }).rider_contact_selected,
  });
}
