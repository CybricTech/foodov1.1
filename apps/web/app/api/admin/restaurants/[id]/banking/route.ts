import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { resolveAccount, createTransferRecipient } from "@/lib/paystack";

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

  // Step 1: Verify the account (Paystack name-enquiry) AND create the transfer
  // recipient. The recipient_code is the payout target the settlement engine
  // pays — so it always reflects the account saved here. Recipient creation
  // also validates the account; an invalid number throws and nothing is saved.
  let accountName: string;
  let recipientCode: string;
  try {
    const resolved = await resolveAccount({
      accountNumber: account_number,
      bankCode: bank_code,
    });
    accountName = resolved.accountName;
    const recipient = await createTransferRecipient({
      name: accountName,
      accountNumber: account_number,
      bankCode: bank_code,
    });
    recipientCode = recipient.recipientCode;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Account verification failed";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // Step 2: Save to restaurants. paystack_recipient_code is the "ready for
  // payout" marker; monnify_bank_verified_at is kept set for the existing badge.
  const updatePayload = {
    bank_code,
    bank_account_number: account_number,
    bank_account_name: accountName,
    paystack_recipient_code: recipientCode,
    monnify_bank_verified_at: new Date().toISOString(),
  } as unknown as Record<string, unknown>;

  const { data, error } = await auth.serviceClient
    .from("restaurants")
    .update(updatePayload)
    .eq("id", restaurantId)
    .select(
      "id, name, bank_code, bank_account_number, bank_account_name, paystack_recipient_code, monnify_bank_verified_at" as never
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
