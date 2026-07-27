import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSubmission } from "@/lib/docuseal";
import { findAgreementBySubmissionId, syncAgreement } from "@/lib/agreements/sync";

/**
 * DocuSeal webhook — merchant agreement signing events (form viewed/started/
 * completed, submission completed/expired, submitter declined).
 *
 * Auth: DocuSeal's webhook config doesn't support custom headers on all plans,
 * so the shared secret travels as `?token=` on the URL registered in its
 * dashboard (same pattern as the Bolt webhook's bearer token).
 *
 * Per docuseal.ts, webhook payloads are only a hint that something changed —
 * we always re-fetch the submission from the API before writing anything, so
 * out-of-order or duplicate deliveries are safe (syncAgreement is idempotent).
 */

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const expectedToken = process.env.DOCUSEAL_WEBHOOK_TOKEN;
  if (!expectedToken) {
    console.error("[docuseal-webhook] DOCUSEAL_WEBHOOK_TOKEN is not configured");
    return false;
  }
  const provided = request.nextUrl.searchParams.get("token") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expectedToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { event_type?: string; data?: { id?: number; submission_id?: number } };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const submissionId = payload?.data?.submission_id ?? payload?.data?.id;
  if (typeof submissionId !== "number") {
    console.warn("[docuseal-webhook] payload without a resolvable submission id:", payload?.event_type);
    return NextResponse.json({ received: true });
  }

  try {
    const agreement = await findAgreementBySubmissionId(submissionId);
    if (!agreement) {
      console.warn(`[docuseal-webhook] unknown submission_id=${submissionId}`);
      return NextResponse.json({ received: true });
    }

    const submission = await getSubmission(submissionId);
    await syncAgreement(agreement, submission);
  } catch (err) {
    // Swallowed on purpose (DocuSeal retries on non-2xx). The admin "refresh
    // status" action re-syncs on demand if a webhook is ever lost.
    console.error(`[docuseal-webhook] processing failed submission_id=${submissionId}:`, err);
  }

  return NextResponse.json({ received: true });
}
