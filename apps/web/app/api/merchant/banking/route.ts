import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

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
    .select("bank_code, bank_account_number, bank_account_name, paystack_recipient_code")
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

  const paystackKey = process.env.PAYSTACK_SECRET_KEY!;

  // Step 1: Verify account via Paystack
  const resolveRes = await fetch(
    `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
    { headers: { Authorization: `Bearer ${paystackKey}` } }
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

  // Step 3: Save to restaurants
  const { data, error } = await serviceClient
    .from("restaurants")
    .update({
      bank_code,
      bank_account_number: account_number,
      bank_account_name: accountName,
      paystack_recipient_code: recipientCode,
    })
    .eq("id", restaurant_id)
    .select("id, bank_code, bank_account_number, bank_account_name, paystack_recipient_code")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
