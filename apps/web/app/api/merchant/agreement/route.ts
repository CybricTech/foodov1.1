import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { getSubmission, getSigningUrl } from "@/lib/docuseal";

export const dynamic = "force-dynamic";

// GET /api/merchant/agreement — the merchant's own latest agreement + a live
// signing link when it's their turn to sign.
export async function GET() {
  const session = await getDashboardUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const { data: agreement, error } = await supabase
    .from("merchant_agreements")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!agreement) return NextResponse.json({ agreement: null, sign_url: null });

  let signUrl: string | null = null;
  if (agreement.status === "sent" && agreement.docuseal_submission_id) {
    try {
      const submission = await getSubmission(agreement.docuseal_submission_id);
      signUrl = getSigningUrl(submission.submitters, "merchant");
    } catch (err) {
      console.error("merchant/agreement: failed to fetch signing link:", err);
    }
  }

  return NextResponse.json({ agreement, sign_url: signUrl });
}
