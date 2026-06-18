import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

async function requireSuperAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "super_admin") return null;

  return { user, serviceClient };
}

/** Toggle a single merchant's opt-in to automated payouts. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { auto_payout_enabled } = body as { auto_payout_enabled?: boolean };
  if (typeof auto_payout_enabled !== "boolean") {
    return NextResponse.json({ error: "auto_payout_enabled (boolean) required" }, { status: 400 });
  }

  // Guard: can't enroll a merchant with no payout destination — the cron would
  // only skip + alert. Allow disabling regardless.
  if (auto_payout_enabled) {
    const { data: r } = await auth.serviceClient
      .from("restaurants")
      .select("paystack_recipient_code, bank_account_number" as never)
      .eq("id", id)
      .single();
    const row = r as unknown as { paystack_recipient_code: string | null; bank_account_number: string | null } | null;
    if (!row?.paystack_recipient_code && !row?.bank_account_number) {
      return NextResponse.json(
        { error: "Merchant has no bank account — add one before enabling payouts." },
        { status: 422 }
      );
    }
  }

  const { error } = await auth.serviceClient
    .from("restaurants")
    .update({ auto_payout_enabled } as never)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id, auto_payout_enabled });
}
