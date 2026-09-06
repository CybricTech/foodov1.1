import { NextRequest, NextResponse } from "next/server";
import { paymentLinkMerchant, UUID_PATTERN } from "@/lib/payment-links";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await paymentLinkMerchant(request);
  if (auth.error) return auth.error;
  if (!UUID_PATTERN.test(params.id)) return NextResponse.json({ error: "Link not found." }, { status: 404 });
  const { data, error } = await auth.db.from("merchant_payment_links").update({ cancelled_at: new Date().toISOString() }).eq("id", params.id).eq("restaurant_id", auth.restaurantId).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "This link could not be cancelled. Payment may have already started; refresh to check its status." }, { status: 409 });
  if (!data) return NextResponse.json({ error: "Link not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
