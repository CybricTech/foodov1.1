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

  const paystackKey = process.env.PAYSTACK_SECRET_KEY!;

  // Step 1: Verify account via Paystack
  const resolveRes = await fetch(
    `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
    {
      headers: { Authorization: `Bearer ${paystackKey}` },
    }
  );

  const resolveData = await resolveRes.json();

  if (!resolveRes.ok || !resolveData.status) {
    return NextResponse.json(
      { error: resolveData.message ?? "Account verification failed" },
      { status: 422 }
    );
  }

  const accountName = resolveData.data?.account_name as string;

  // Step 2: Create Paystack transfer recipient
  const recipientRes = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name: accountName,
      account_number,
      bank_code,
      currency: "NGN",
    }),
  });

  const recipientData = await recipientRes.json();

  if (!recipientRes.ok || !recipientData.status) {
    return NextResponse.json(
      { error: recipientData.message ?? "Recipient creation failed" },
      { status: 500 }
    );
  }

  const recipientCode = recipientData.data?.recipient_code as string;

  // Step 3: Save to restaurants table
  const { data, error } = await auth.serviceClient
    .from("restaurants")
    .update({
      bank_code,
      bank_account_number: account_number,
      bank_account_name: accountName,
      paystack_recipient_code: recipientCode,
    })
    .eq("id", restaurantId)
    .select("id, name, bank_code, bank_account_number, bank_account_name, paystack_recipient_code")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
