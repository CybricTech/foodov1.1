import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { validateMonnifyBankAccount } from "@/lib/monnify";

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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const restaurantId = params.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { bank_code, account_number } = body as {
    bank_code?: string;
    account_number?: string;
  };

  if (!bank_code || !account_number) {
    return NextResponse.json(
      { error: "bank_code and account_number are required" },
      { status: 400 }
    );
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

  // Step 2: Save to restaurants. monnify_bank_verified_at is the new
  // "ready for settlement" marker (no recipient_code concept in Monnify).
  const updatePayload = {
    bank_code,
    bank_account_number: account_number,
    bank_account_name: accountName,
    monnify_bank_verified_at: new Date().toISOString(),
  } as unknown as Record<string, unknown>;

  const { data, error } = await auth.serviceClient
    .from("restaurants")
    .update(updatePayload)
    .eq("id", restaurantId)
    .select(
      "id, name, bank_code, bank_account_number, bank_account_name, monnify_bank_verified_at" as never
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
