import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getMerchantRestaurantId } from "@/lib/supabase/get-merchant-restaurant";

export const dynamic = "force-dynamic";

// GET /api/merchant/agreement/file — signed URL redirect to the merchant's
// own archived agreement PDF (final once countersigned, else not available —
// the unsigned template only exists once DocuSeal countersigns and we archive it).
//
// `?format=json` returns `{ url }` instead of redirecting — the mobile app calls
// this with a Bearer token and then opens the short-lived URL in the browser,
// which has no session of its own.
export async function GET(request: NextRequest) {
  const restaurantId = await getMerchantRestaurantId(request);
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const { data: agreement } = await supabase
    .from("merchant_agreements")
    .select("restaurant_id, final_pdf_path, unsigned_pdf_path")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const path = agreement?.final_pdf_path ?? agreement?.unsigned_pdf_path;
  if (!agreement || !path) {
    return NextResponse.json({ error: "No archived PDF available yet" }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from("merchant-agreements")
    .createSignedUrl(path, 300);

  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "Failed to sign URL" }, { status: 500 });
  }

  if (request.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json({ url: signed.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.redirect(signed.signedUrl);
}
