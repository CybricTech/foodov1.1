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

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { restaurant_id } = body as { restaurant_id?: string };

  if (!restaurant_id) {
    return NextResponse.json({ error: "restaurant_id is required" }, { status: 400 });
  }

  // Manually trigger settlement for a specific restaurant via the edge function
  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-settlements`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ restaurant_id }),
  });

  const result = await res.json();

  if (!res.ok) {
    return NextResponse.json({ error: result.message ?? "Settlement trigger failed" }, { status: 500 });
  }

  return NextResponse.json(result);
}
