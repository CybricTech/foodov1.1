import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";
import {
  createSubmission,
  isDocuSealConfigured,
  DOCUSEAL_NOT_CONFIGURED_MESSAGE,
  kitchynSignerEmail,
  type AgreementFeeTerms,
} from "@/lib/docuseal";
import { isActiveAgreementStatus } from "@/lib/agreements/sync";
import type { Json } from "@foodo/database";

export const dynamic = "force-dynamic";

const FeeTermsSchema = z.object({
  legal_status: z.string().optional(),
  commission_pct: z.number().nullable().optional(),
  // Number once agreed, or free text such as "TBD" before then.
  subscription_fee_ngn: z.union([z.number(), z.string()]).nullable().optional(),
  free_period_start: z.string().nullable().optional(),
  free_period_end: z.string().nullable().optional(),
  delivery_modes: z.string().nullable().optional(),
  inhouse_commission_pct: z.number().nullable().optional(),
  settlement_cycle_days: z.number().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_account_name: z.string().nullable().optional(),
  bank_account_number: z.string().nullable().optional(),
  prep_time_minutes: z.number().nullable().optional(),
  effective_date: z.string().nullable().optional(),
});

const GenerateSchema = z.object({
  restaurant_id: z.string().uuid(),
  legal_name: z.string().min(1),
  rc_number: z.string().nullable().optional(),
  fee_terms: FeeTermsSchema,
});

// POST /api/admin/agreements/generate — voids any prior active agreement for
// the merchant, creates a fresh draft row, and sends it to DocuSeal.
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  if (!isDocuSealConfigured()) {
    return NextResponse.json({ error: DOCUSEAL_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }
  const kitchynEmail = kitchynSignerEmail();
  if (!kitchynEmail) {
    return NextResponse.json(
      { error: "DOCUSEAL_KITCHYN_SIGNER_EMAIL is not configured — set it before generating agreements." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { restaurant_id, legal_name, rc_number, fee_terms } = parsed.data;

  const supabase = createServiceClient();

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id, name, notification_email")
    .eq("id", restaurant_id)
    .single();

  if (restaurantError || !restaurant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }
  if (!restaurant.notification_email) {
    return NextResponse.json(
      { error: "This merchant has no notification email on file — add one in Settings before generating an agreement." },
      { status: 400 }
    );
  }

  // One active agreement per merchant: void any prior draft/sent/merchant_signed row.
  const { data: existing } = await supabase
    .from("merchant_agreements")
    .select("id, status")
    .eq("restaurant_id", restaurant_id);

  const activeIds = (existing ?? [])
    .filter((row) => isActiveAgreementStatus(row.status))
    .map((row) => row.id);

  if (activeIds.length > 0) {
    await supabase
      .from("merchant_agreements")
      .update({ status: "voided", updated_at: new Date().toISOString() })
      .in("id", activeIds);
  }

  const { data: agreement, error: insertError } = await supabase
    .from("merchant_agreements")
    .insert({
      restaurant_id,
      status: "draft",
      legal_name,
      rc_number: rc_number ?? null,
      fee_terms: fee_terms as Json,
      kitchyn_signer_email: kitchynEmail,
      merchant_signer_email: restaurant.notification_email,
      created_by: guard.userId,
    })
    .select()
    .single();

  if (insertError || !agreement) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to create agreement" }, { status: 500 });
  }

  try {
    const submitters = await createSubmission({
      legalName: legal_name,
      rcNumber: rc_number,
      feeTerms: fee_terms as AgreementFeeTerms,
      merchantEmail: restaurant.notification_email,
      merchantName: restaurant.name,
      kitchynEmail,
      externalId: agreement.id,
    });

    const submissionId = submitters[0]?.submission_id ?? null;
    if (!submissionId) throw new Error("DocuSeal did not return a submission id");

    const { data: updated } = await supabase
      .from("merchant_agreements")
      .update({
        status: "sent",
        docuseal_submission_id: submissionId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agreement.id)
      .select()
      .single();

    await supabase.from("audit_logs").insert({
      actor_id: guard.userId,
      action: "agreement_generated",
      target_type: "merchant_agreement",
      target_id: agreement.id,
      metadata: { restaurant_id, docuseal_submission_id: submissionId } as Json,
    });

    return NextResponse.json({ agreement: updated ?? agreement }, { status: 201 });
  } catch (err) {
    // Roll back the draft row so a failed send doesn't leave dead state behind.
    await supabase.from("merchant_agreements").delete().eq("id", agreement.id);
    const message = err instanceof Error ? err.message : "Failed to create DocuSeal submission";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
