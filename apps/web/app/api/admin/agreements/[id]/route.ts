import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";
import { getSubmission, getSigningUrl } from "@/lib/docuseal";
import { syncAgreement } from "@/lib/agreements/sync";

export const dynamic = "force-dynamic";

// GET /api/admin/agreements/[id] — re-syncs against DocuSeal (if applicable)
// and returns the agreement plus the merchant / Kitchyn signing links so the
// admin UI can offer a live "Countersign" link once it's Kitchyn's turn.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: agreement, error } = await supabase
    .from("merchant_agreements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!agreement) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!agreement.docuseal_submission_id) {
    return NextResponse.json({ agreement, merchant_sign_url: null, kitchyn_sign_url: null });
  }

  try {
    const submission = await getSubmission(agreement.docuseal_submission_id);
    const synced =
      agreement.status === "sent" || agreement.status === "merchant_signed"
        ? await syncAgreement(agreement, submission)
        : agreement;

    return NextResponse.json({
      agreement: synced,
      merchant_sign_url: getSigningUrl(submission.submitters, "merchant"),
      kitchyn_sign_url: getSigningUrl(submission.submitters, "kitchyn"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reach DocuSeal";
    return NextResponse.json({ agreement, merchant_sign_url: null, kitchyn_sign_url: null, warning: message });
  }
}
