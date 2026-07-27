/**
 * Server-only: reconciles a `merchant_agreements` row against DocuSeal's
 * authoritative submission state.
 *
 * Used by both the DocuSeal webhook (apps/web/app/api/webhooks/docuseal) and
 * the admin "refresh status" route — the same status-derivation logic must
 * run in both places, so it lives here once. Per docuseal.ts's own warning,
 * webhook payloads are only a hint; callers always re-fetch the submission
 * via getSubmission() before calling syncAgreement().
 */
import { createServiceClient } from "@/lib/supabase/server";
import {
  findSubmitter,
  getSubmissionDocuments,
  kitchynRole,
  merchantRole,
  type DocuSealSubmission,
} from "@/lib/docuseal";
import type { Database, Json } from "@foodo/database";

type AgreementRow = Database["public"]["Tables"]["merchant_agreements"]["Row"];

const ACTIVE_STATUSES = new Set(["draft", "sent", "merchant_signed"]);

/** Derive the merchant_agreements status from DocuSeal's submission + submitters. */
function deriveStatus(submission: DocuSealSubmission): AgreementRow["status"] {
  const merchantSub = findSubmitter(submission.submitters, merchantRole(), 0);
  const kitchynSub = findSubmitter(submission.submitters, kitchynRole(), 1);

  if (merchantSub?.declined_at || kitchynSub?.declined_at) return "declined";
  if (submission.status === "expired") return "expired";
  if (submission.status === "completed" || (merchantSub?.completed_at && kitchynSub?.completed_at)) {
    return "completed";
  }
  if (merchantSub?.completed_at) return "merchant_signed";
  return "sent";
}

/**
 * Reconcile one agreement row against its DocuSeal submission. Idempotent —
 * safe to call repeatedly (webhook retries, manual refresh).
 */
export async function syncAgreement(
  agreement: AgreementRow,
  submission: DocuSealSubmission
): Promise<AgreementRow> {
  const supabase = createServiceClient();
  const merchantSub = findSubmitter(submission.submitters, merchantRole(), 0);
  const kitchynSub = findSubmitter(submission.submitters, kitchynRole(), 1);

  const nextStatus = deriveStatus(submission);
  const patch: Record<string, unknown> = {};

  if (nextStatus !== agreement.status) patch.status = nextStatus;
  if (merchantSub?.completed_at && !agreement.merchant_signed_at) {
    patch.merchant_signed_at = merchantSub.completed_at;
  }
  if (kitchynSub?.completed_at && !agreement.countersigned_at) {
    patch.countersigned_at = kitchynSub.completed_at;
  }

  if (nextStatus === "completed" && !agreement.final_pdf_path) {
    const path = await archiveFinalPdf(agreement, submission).catch((err) => {
      console.error("agreements/sync: failed to archive final PDF:", err);
      return null;
    });
    if (path) patch.final_pdf_path = path;
  }

  if (Object.keys(patch).length === 0) return agreement;

  patch.updated_at = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("merchant_agreements")
    .update(patch)
    .eq("id", agreement.id)
    .select()
    .single();

  if (error) {
    console.error("agreements/sync: update failed:", error);
    return agreement;
  }

  if (patch.status && agreement.created_by) {
    await supabase
      .from("audit_logs")
      .insert({
        actor_id: agreement.created_by,
        action: `agreement_${patch.status}`,
        target_type: "merchant_agreement",
        target_id: agreement.id,
        metadata: {
          restaurant_id: agreement.restaurant_id,
          docuseal_submission_id: submission.id,
        } as Json,
      })
      .then(({ error: auditError }) => {
        if (auditError) console.error("agreements/sync: audit log insert failed:", auditError);
      });
  }

  return updated as AgreementRow;
}

/** Downloads DocuSeal's combined signed PDF and archives it in the private bucket. */
async function archiveFinalPdf(
  agreement: AgreementRow,
  submission: DocuSealSubmission
): Promise<string | null> {
  const supabase = createServiceClient();
  const docs = await getSubmissionDocuments(submission.id, { merge: true });
  const fileUrl = docs.documents?.[0]?.url;
  if (!fileUrl) return null;

  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download combined PDF (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  const path = `${agreement.restaurant_id}/${agreement.id}-final.pdf`;
  const { error } = await supabase.storage
    .from("merchant-agreements")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });

  if (error) throw error;
  return path;
}

/** Look up the agreement row by DocuSeal submission id (used by the webhook). */
export async function findAgreementBySubmissionId(submissionId: number): Promise<AgreementRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("merchant_agreements")
    .select("*")
    .eq("docuseal_submission_id", submissionId)
    .maybeSingle();
  if (error) {
    console.error("agreements/sync: lookup by submission id failed:", error);
    return null;
  }
  return data;
}

export function isActiveAgreementStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}
