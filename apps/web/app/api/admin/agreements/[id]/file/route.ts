import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";

export const dynamic = "force-dynamic";

// GET /api/admin/agreements/[id]/file — redirects to a short-lived signed URL
// for the archived PDF (final if countersigned, else the unsigned template).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: agreement } = await supabase
    .from("merchant_agreements")
    .select("final_pdf_path, unsigned_pdf_path")
    .eq("id", id)
    .maybeSingle();

  const path = agreement?.final_pdf_path ?? agreement?.unsigned_pdf_path;
  if (!path) return NextResponse.json({ error: "No archived PDF for this agreement yet" }, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from("merchant-agreements")
    .createSignedUrl(path, 300);

  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "Failed to sign URL" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
