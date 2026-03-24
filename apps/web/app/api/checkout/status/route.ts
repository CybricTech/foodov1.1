import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("ref");
  if (!ref) {
    return NextResponse.json({ error: "Missing ref" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("payments")
    .select("order_id")
    .eq("paystack_ref", ref)
    .eq("paystack_status", "success")
    .maybeSingle();

  return NextResponse.json({ orderId: data?.order_id ?? null });
}
