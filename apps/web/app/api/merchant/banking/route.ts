import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { validateMonnifyBankAccount } from "@/lib/monnify";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const restaurantId = searchParams.get("restaurantId");

  if (!restaurantId) {
    return NextResponse.json({ error: "Missing restaurantId" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !["merchant_owner", "merchant_staff"].includes(profile.role) ||
    profile.restaurant_id !== restaurantId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await serviceClient
    .from("restaurants")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("bank_code, bank_account_number, bank_account_name, monnify_bank_verified_at" as any)
    .eq("id", restaurantId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { restaurant_id, bank_code, account_number } = body as {
    restaurant_id?: string;
    bank_code?: string;
    account_number?: string;
  };

  if (!restaurant_id || !bank_code || !account_number) {
    return NextResponse.json(
      { error: "restaurant_id, bank_code and account_number are required" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    profile.role !== "merchant_owner" ||
    profile.restaurant_id !== restaurant_id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Step 1: Verify account via Monnify name-enquiry
  let accountName: string;
  try {
    const validated = await validateMonnifyBankAccount({
      accountNumber: account_number,
      bankCode: bank_code,
    });
    accountName = validated.accountName;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Account verification failed";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // Step 2: Save to restaurants. Monnify disbursements take account details
  // directly per request, so there's no "recipient" to create up front. We
  // mark `monnify_bank_verified_at` as the "ready for settlement" indicator.
  const updatePayload = {
    bank_code,
    bank_account_number: account_number,
    bank_account_name: accountName,
    monnify_bank_verified_at: new Date().toISOString(),
  } as unknown as Record<string, unknown>;

  const { data, error } = await serviceClient
    .from("restaurants")
    .update(updatePayload)
    .eq("id", restaurant_id)
    .select(
      "id, bank_code, bank_account_number, bank_account_name, monnify_bank_verified_at" as never
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
