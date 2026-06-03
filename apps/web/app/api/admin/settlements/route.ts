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

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const pageSize = 50;
  const status = searchParams.get("status");
  const from = (page - 1) * pageSize;

  let query = auth.serviceClient
    .from("settlements")
    .select(
      `
      id,
      restaurant_id,
      amount_kobo,
      status,
      paystack_transfer_code,
      paystack_transfer_ref,
      monnify_disbursement_reference,
      monnify_transaction_reference,
      failure_reason,
      initiated_at,
      paid_at,
      created_at,
      restaurants (name, slug)
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, count, page, pageSize });
}

// NOTE: The automatic settlement path (POST → process-settlements edge function
// → Monnify disbursement against the wallet's available balance) was removed in
// migration 059. Settlements are now recorded manually after a bank transfer
// via POST /api/admin/settlements/record, which is the single source of truth
// for what a merchant is paid. There is intentionally no POST handler here.
