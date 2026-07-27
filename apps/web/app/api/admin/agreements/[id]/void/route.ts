import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";
import type { Json } from "@foodo/database";

export const dynamic = "force-dynamic";

// POST /api/admin/agreements/[id]/void — admin cancels a draft/sent/
// merchant_signed agreement (e.g. terms changed before Kitchyn countersigns).
// Completed agreements are final and cannot be voided.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: agreement } = await supabase
    .from("merchant_agreements")
    .select("id, status, restaurant_id")
    .eq("id", id)
    .maybeSingle();

  if (!agreement) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (agreement.status === "completed") {
    return NextResponse.json({ error: "A completed agreement cannot be voided" }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("merchant_agreements")
    .update({ status: "voided", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audit_logs").insert({
    actor_id: guard.userId,
    action: "agreement_voided",
    target_type: "merchant_agreement",
    target_id: id,
    metadata: { restaurant_id: agreement.restaurant_id } as Json,
  });

  return NextResponse.json({ agreement: updated });
}
