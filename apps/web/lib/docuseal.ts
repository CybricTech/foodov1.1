/**
 * DocuSeal API client — server-only (uses secret env vars).
 *
 * DocuSeal owns the entire signing flow: the lawyer-prepared Merchant Agreement
 * PDF is uploaded ONCE into DocuSeal's template builder, where fillable fields
 * are placed (merchant legal name, RC/BN no., Schedule 1 fee terms, and
 * signature/date blocks for the "Merchant" and "Kitchyn" roles). This client
 * only creates submissions from that template, reads submission state, and
 * downloads the final signed PDF — we never parse or stamp PDFs ourselves.
 *
 * API reference: https://www.docuseal.com/docs/api
 * Auth: `X-Auth-Token: <DOCUSEAL_API_TOKEN>` on every request.
 *
 * ── Template field names ────────────────────────────────────────────────────
 * The DocuSeal template's fillable fields MUST be named exactly as the values
 * in {@link TEMPLATE_FIELD_MAP} — prefill is matched by name, so a mismatch
 * silently leaves the field blank for the signer.
 *
 * ── Graceful degradation ────────────────────────────────────────────────────
 * When DOCUSEAL_API_TOKEN / DOCUSEAL_TEMPLATE_ID are missing the feature is
 * "not configured": {@link isDocuSealConfigured} returns false and every API
 * route returns 503 with a clear message instead of crashing.
 */

/** DocuSeal template field names (must match the template built in DocuSeal). */
export const TEMPLATE_FIELD_MAP = {
  merchant_legal_name: "merchant_legal_name",
  rc_number: "rc_number",
  commission_pct: "commission_pct",
  subscription_fee: "subscription_fee",
  free_period_start: "free_period_start",
  free_period_end: "free_period_end",
  delivery_modes: "delivery_modes",
  inhouse_commission_pct: "inhouse_commission_pct",
  settlement_cycle_days: "settlement_cycle_days",
  bank_name: "bank_name",
  bank_account_name: "bank_account_name",
  bank_account_number: "bank_account_number",
  prep_time_minutes: "prep_time_minutes",
  effective_date: "effective_date",
} as const;

/** Schedule 1 fee terms snapshot, stored on merchant_agreements.fee_terms. */
export interface AgreementFeeTerms {
  legal_status?: string; // incorporated_company | business_name | individual
  commission_pct?: number | null;
  subscription_fee_ngn?: number | null;
  free_period_start?: string | null; // YYYY-MM-DD
  free_period_end?: string | null; // YYYY-MM-DD
  delivery_modes?: string | null; // platform | in_house | both
  inhouse_commission_pct?: number | null;
  settlement_cycle_days?: number | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  prep_time_minutes?: number | null;
  effective_date?: string | null; // YYYY-MM-DD
}

/* ── Minimal DocuSeal API response shapes (only what we use) ─────────────── */

export interface DocuSealSubmitter {
  id?: number;
  submission_id?: number;
  role: string;
  email: string;
  name?: string | null;
  slug: string;
  status?: string; // 'pending' | 'sent' | 'opened' | 'completed' | 'declined'
  completed_at?: string | null;
  declined_at?: string | null;
  embed_src?: string | null; // https://docuseal.com/s/<slug>
}

export interface DocuSealSubmission {
  id: number;
  status: string; // 'pending' | 'completed' | 'declined' | 'expired'
  submitters: DocuSealSubmitter[];
  combined_document_url?: string | null;
  documents?: Array<{ name: string; url: string }>;
}

export interface DocuSealDocumentsResponse {
  documents: Array<{ name: string; url: string }>;
}

/* ── Config ──────────────────────────────────────────────────────────────── */

function apiUrl(): string {
  return (process.env.DOCUSEAL_API_URL ?? "https://api.docuseal.com").replace(/\/$/, "");
}

export function merchantRole(): string {
  return process.env.DOCUSEAL_MERCHANT_ROLE ?? "Merchant";
}

export function kitchynRole(): string {
  return process.env.DOCUSEAL_KITCHYN_ROLE ?? "Kitchyn";
}

export function kitchynSignerEmail(): string | null {
  return process.env.DOCUSEAL_KITCHYN_SIGNER_EMAIL ?? null;
}

/** True when the minimum config (API token + template id) is present. */
export function isDocuSealConfigured(): boolean {
  return !!(process.env.DOCUSEAL_API_TOKEN && process.env.DOCUSEAL_TEMPLATE_ID);
}

export const DOCUSEAL_NOT_CONFIGURED_MESSAGE =
  "DocuSeal is not configured — set DOCUSEAL_API_TOKEN and DOCUSEAL_TEMPLATE_ID (see .env.example).";

async function docusealFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.DOCUSEAL_API_TOKEN;
  if (!token) throw new Error(DOCUSEAL_NOT_CONFIGURED_MESSAGE);

  const res = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: {
      "X-Auth-Token": token,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DocuSeal ${init?.method ?? "GET"} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

/* ── API calls ───────────────────────────────────────────────────────────── */

/**
 * Create a submission from the agreement template with two submitters in
 * preserved order: the Merchant signs first; Kitchyn is only asked to
 * countersign after the Merchant completes.
 *
 * Returns the submitter objects (each carries `slug` + `embed_src` — the
 * embeddable signing URL for that party).
 */
export async function createSubmission(params: {
  legalName: string;
  rcNumber?: string | null;
  feeTerms: AgreementFeeTerms;
  merchantEmail: string;
  merchantName: string;
  kitchynEmail: string;
  externalId: string; // merchant_agreements.id — lets webhooks be traced back
}): Promise<DocuSealSubmitter[]> {
  const templateId = process.env.DOCUSEAL_TEMPLATE_ID;
  if (!templateId) throw new Error(DOCUSEAL_NOT_CONFIGURED_MESSAGE);

  const { legalName, rcNumber, feeTerms, merchantEmail, merchantName, kitchynEmail, externalId } = params;

  // Prefill values for the MERCHANT party's fields (editable in the form).
  // Names must match the DocuSeal template fields (see TEMPLATE_FIELD_MAP).
  const field = (name: string, value: string | number | null | undefined) => ({
    name,
    default_value: value == null ? "" : String(value),
    readonly: false,
  });

  const merchantFields = [
    field(TEMPLATE_FIELD_MAP.merchant_legal_name, legalName),
    field(TEMPLATE_FIELD_MAP.rc_number, rcNumber),
    field(TEMPLATE_FIELD_MAP.commission_pct, feeTerms.commission_pct),
    field(TEMPLATE_FIELD_MAP.subscription_fee, feeTerms.subscription_fee_ngn),
    field(TEMPLATE_FIELD_MAP.free_period_start, feeTerms.free_period_start),
    field(TEMPLATE_FIELD_MAP.free_period_end, feeTerms.free_period_end),
    field(TEMPLATE_FIELD_MAP.delivery_modes, feeTerms.delivery_modes),
    field(TEMPLATE_FIELD_MAP.inhouse_commission_pct, feeTerms.inhouse_commission_pct),
    field(TEMPLATE_FIELD_MAP.settlement_cycle_days, feeTerms.settlement_cycle_days),
    field(TEMPLATE_FIELD_MAP.bank_name, feeTerms.bank_name),
    field(TEMPLATE_FIELD_MAP.bank_account_name, feeTerms.bank_account_name),
    field(TEMPLATE_FIELD_MAP.bank_account_number, feeTerms.bank_account_number),
    field(TEMPLATE_FIELD_MAP.prep_time_minutes, feeTerms.prep_time_minutes),
    field(TEMPLATE_FIELD_MAP.effective_date, feeTerms.effective_date),
  ];

  return docusealFetch<DocuSealSubmitter[]>("/submissions", {
    method: "POST",
    body: JSON.stringify({
      template_id: Number(templateId),
      send_email: true,
      // Merchant first; Kitchyn is only notified after the Merchant completes.
      order: "preserved",
      submitters: [
        {
          role: merchantRole(),
          email: merchantEmail,
          name: merchantName,
          external_id: externalId,
          fields: merchantFields,
        },
        {
          role: kitchynRole(),
          email: kitchynEmail,
          name: "Kitchyn",
        },
      ],
    }),
  });
}

/** Fetch the authoritative state of a submission. Webhooks are only a hint —
 *  always re-fetch instead of trusting the webhook payload. */
export async function getSubmission(id: number | string): Promise<DocuSealSubmission> {
  return docusealFetch<DocuSealSubmission>(`/submissions/${id}`);
}

/** List the submission's documents. With `merge: true`, returns the single
 *  combined signed PDF (available once the submission is completed). */
export async function getSubmissionDocuments(
  id: number | string,
  opts?: { merge?: boolean }
): Promise<DocuSealDocumentsResponse> {
  const qs = opts?.merge ? "?merge=true" : "";
  return docusealFetch<DocuSealDocumentsResponse>(`/submissions/${id}/documents${qs}`);
}

/** Find a submitter by role (falls back to position: Merchant=1st, Kitchyn=2nd). */
export function findSubmitter(
  submitters: DocuSealSubmitter[],
  role: string,
  fallbackIndex: number
): DocuSealSubmitter | undefined {
  return (
    submitters.find((s) => s.role?.toLowerCase() === role.toLowerCase()) ??
    submitters[fallbackIndex]
  );
}

/** The embeddable signing URL for a given party, if available. */
export function getSigningUrl(submitters: DocuSealSubmitter[], role: "merchant" | "kitchyn"): string | null {
  const submitter =
    role === "merchant"
      ? findSubmitter(submitters, merchantRole(), 0)
      : findSubmitter(submitters, kitchynRole(), 1);
  return submitter?.embed_src ?? (submitter?.slug ? `https://docuseal.com/s/${submitter.slug}` : null);
}
