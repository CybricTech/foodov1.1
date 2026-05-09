/**
 * Monnify payment gateway client.
 *
 * Wraps every Monnify API call so we don't repeat the auth + token cache
 * dance at every call site. All public functions throw on transport / API
 * errors; callers decide how to surface the error.
 *
 * Auth model: API_KEY + SECRET_KEY → POST /auth/login → 1-hour Bearer token.
 * The token is cached in-memory (per-instance L1) AND persisted to Postgres
 * (`monnify_auth_tokens` singleton row, shared L2). At scale this drops auth
 * traffic from "every request" to "every ~60 minutes per instance" with the
 * DB cache amortising cold starts across the fleet.
 */
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

const MONNIFY_BASE_URL =
  process.env.MONNIFY_BASE_URL ?? "https://sandbox.monnify.com";
const MONNIFY_API_KEY = process.env.MONNIFY_API_KEY ?? "";
const MONNIFY_SECRET_KEY = process.env.MONNIFY_SECRET_KEY ?? "";
const MONNIFY_CONTRACT_CODE = process.env.MONNIFY_CONTRACT_CODE ?? "";
// Source wallet account for outbound disbursements. Optional — when omitted
// Monnify uses the merchant's default wallet account.
const MONNIFY_WALLET_ACCOUNT = process.env.MONNIFY_WALLET_ACCOUNT ?? "";

// Refresh tokens this many ms before their stated expiry to avoid races
// where the token expires mid-request.
const TOKEN_REFRESH_MARGIN_MS = 60_000;
// Monnify access tokens are valid for 3600s. We trust the API's expiresIn
// and only fall back to this if the response is malformed.
const TOKEN_DEFAULT_TTL_MS = 3500 * 1000;

type CachedToken = { token: string; expiresAt: number };
let memCache: CachedToken | null = null;

/* ────────────────────────────────────────────────────────────────────────── */
/* Authentication                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Returns a valid Monnify access token, refreshing if needed. Multi-layer
 * cache: in-memory → DB → /auth/login. Safe under concurrent load — if two
 * instances race to refresh, both get valid tokens; the upsert just lands
 * on whichever finished last.
 */
export async function getMonnifyAccessToken(): Promise<string> {
  const now = Date.now();

  if (memCache && memCache.expiresAt > now + TOKEN_REFRESH_MARGIN_MS) {
    return memCache.token;
  }

  // L2: Postgres-backed cache
  try {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cached } = await (supabase as any)
      .from("monnify_auth_tokens")
      .select("access_token, expires_at")
      .eq("id", "singleton")
      .maybeSingle();

    const cachedRow = cached as { access_token?: string; expires_at?: string } | null;
    if (cachedRow?.access_token && cachedRow.expires_at) {
      const expiresAt = new Date(cachedRow.expires_at).getTime();
      if (expiresAt > now + TOKEN_REFRESH_MARGIN_MS) {
        memCache = { token: cachedRow.access_token, expiresAt };
        return cachedRow.access_token;
      }
    }
  } catch (err) {
    // DB cache lookup failed — fall through to a fresh fetch. Don't throw,
    // we'd rather pay the auth round-trip than fail the parent request.
    console.error("[monnify] token cache read failed:", err);
  }

  // Fresh fetch
  const basic = Buffer.from(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`).toString("base64");
  const res = await fetch(`${MONNIFY_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Monnify auth failed: ${res.status} ${errBody}`);
  }

  const data = (await res.json()) as {
    requestSuccessful?: boolean;
    responseBody?: { accessToken?: string; expiresIn?: number };
  };

  const token = data.responseBody?.accessToken;
  if (!token) throw new Error("Monnify auth: missing accessToken in response");

  const ttlMs = data.responseBody?.expiresIn
    ? Math.max(60_000, data.responseBody.expiresIn * 1000 - TOKEN_REFRESH_MARGIN_MS)
    : TOKEN_DEFAULT_TTL_MS;
  const expiresAt = now + ttlMs;

  memCache = { token, expiresAt };

  // Best-effort write to L2 cache. Don't block on failure.
  try {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("monnify_auth_tokens")
      .upsert(
        {
          id: "singleton",
          access_token: token,
          expires_at: new Date(expiresAt).toISOString(),
          refreshed_at: new Date(now).toISOString(),
        },
        { onConflict: "id" }
      );
  } catch (err) {
    console.error("[monnify] token cache write failed:", err);
  }

  return token;
}

/**
 * Internal helper — wraps fetch with auth header injection and one
 * automatic retry on 401 (in case Monnify expired the token early).
 */
async function authedFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = `${MONNIFY_BASE_URL}${path}`;
  const doFetch = async () => {
    const token = await getMonnifyAccessToken();
    return fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  };

  let res = await doFetch();
  if (res.status === 401) {
    // Force-invalidate the cache and retry once. Covers the case where
    // Monnify revoked the token before its stated expiry.
    memCache = null;
    res = await doFetch();
  }
  return res;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Public types                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

export type MonnifyInitArgs = {
  amount: number;            // amount in NGN (NOT kobo)
  paymentReference: string;  // our internal reference — must be unique
  customerName: string;
  customerEmail: string;
  paymentDescription: string;
  redirectUrl?: string;
  metaData?: Record<string, unknown>;
};

export type MonnifyInitResult = {
  transactionReference: string;  // Monnify-side id
  paymentReference: string;      // echoes our reference
  checkoutUrl: string;
  enabledPaymentMethod: string[];
};

export type MonnifyVerifyResult = {
  paymentStatus: "PAID" | "PENDING" | "FAILED" | "EXPIRED" | "REVERSED" | "OVERPAID" | "PARTIALLY_PAID";
  amountPaid: number;            // NGN
  totalPayable: number;          // NGN
  paidOn: string | null;
  paymentMethod: string | null;
  transactionReference: string;
  paymentReference: string;
  fee: number | null;            // NGN (Monnify processing fee)
  customer: { name: string; email: string } | null;
};

export type MonnifyDisbursementArgs = {
  amount: number;                  // NGN
  reference: string;               // our unique reference
  narration: string;
  destinationBankCode: string;
  destinationAccountNumber: string;
};

export type MonnifyDisbursementResult = {
  amount: number;
  reference: string;
  status: string;            // PENDING, SUCCESS, FAILED, REVERSED
  dateCreated: string;
  totalFee: number;
  destinationAccountName: string;
  destinationBankName: string;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Transactions (customer payments)                                          */
/* ────────────────────────────────────────────────────────────────────────── */

export async function initMonnifyTransaction(
  args: MonnifyInitArgs
): Promise<MonnifyInitResult> {
  const res = await authedFetch("/api/v1/merchant/transactions/init-transaction", {
    method: "POST",
    body: JSON.stringify({
      amount: args.amount,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      paymentReference: args.paymentReference,
      paymentDescription: args.paymentDescription,
      currencyCode: "NGN",
      contractCode: MONNIFY_CONTRACT_CODE,
      ...(args.redirectUrl ? { redirectUrl: args.redirectUrl } : {}),
      ...(args.metaData ? { metaData: args.metaData } : {}),
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.requestSuccessful) {
    throw new Error(
      `Monnify init-transaction failed: ${res.status} ${body?.responseMessage ?? ""}`
    );
  }

  const r = body.responseBody;
  return {
    transactionReference: r.transactionReference,
    paymentReference: r.paymentReference,
    checkoutUrl: r.checkoutUrl,
    enabledPaymentMethod: r.enabledPaymentMethod ?? [],
  };
}

/**
 * Verify a transaction by OUR reference (paymentReference). Returns null
 * if the transaction can't be found.
 */
export async function verifyMonnifyTransaction(
  paymentReference: string
): Promise<MonnifyVerifyResult | null> {
  const res = await authedFetch(
    `/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(paymentReference)}`,
    { method: "GET" }
  );

  if (res.status === 404) return null;

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.requestSuccessful) {
    throw new Error(
      `Monnify verify failed: ${res.status} ${body?.responseMessage ?? ""}`
    );
  }

  const r = body.responseBody;
  if (!r) return null;

  return {
    paymentStatus: r.paymentStatus,
    amountPaid: Number(r.amountPaid ?? 0),
    totalPayable: Number(r.totalPayable ?? 0),
    paidOn: r.paidOn ?? null,
    paymentMethod: r.paymentMethod ?? null,
    transactionReference: r.transactionReference,
    paymentReference: r.paymentReference,
    fee: r.fee != null ? Number(r.fee) : null,
    customer: r.customer
      ? { name: r.customer.name ?? "", email: r.customer.email ?? "" }
      : null,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Bank account validation                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Validates a Nigerian bank account through Monnify's name-enquiry API.
 * Returns the resolved account holder name. Throws on validation failure.
 */
export async function validateMonnifyBankAccount(args: {
  accountNumber: string;
  bankCode: string;
}): Promise<{ accountName: string; accountNumber: string; bankCode: string }> {
  const res = await authedFetch(
    `/api/v1/disbursements/account/validate?accountNumber=${encodeURIComponent(args.accountNumber)}&bankCode=${encodeURIComponent(args.bankCode)}`,
    { method: "GET" }
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.requestSuccessful) {
    throw new Error(
      body?.responseMessage ?? `Account validation failed (${res.status})`
    );
  }

  const r = body.responseBody;
  return {
    accountName: r.accountName,
    accountNumber: r.accountNumber,
    bankCode: r.bankCode,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Disbursements (settlement payouts)                                        */
/* ────────────────────────────────────────────────────────────────────────── */

export async function initiateMonnifyDisbursement(
  args: MonnifyDisbursementArgs
): Promise<MonnifyDisbursementResult> {
  const res = await authedFetch("/api/v2/disbursements/single", {
    method: "POST",
    body: JSON.stringify({
      amount: args.amount,
      reference: args.reference,
      narration: args.narration,
      destinationBankCode: args.destinationBankCode,
      destinationAccountNumber: args.destinationAccountNumber,
      // Per the official singleTransferSchema in Monnify-Nodejs-lib, the field
      // is `currencyCode` (not `currency`). The SDK defaults to NGN.
      currencyCode: "NGN",
      ...(MONNIFY_WALLET_ACCOUNT ? { sourceAccountNumber: MONNIFY_WALLET_ACCOUNT } : {}),
      async: true,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.requestSuccessful) {
    throw new Error(
      body?.responseMessage ?? `Monnify disbursement failed (${res.status})`
    );
  }

  const r = body.responseBody;
  return {
    amount: Number(r.amount ?? 0),
    reference: r.reference,
    status: r.status,
    dateCreated: r.dateCreated,
    totalFee: Number(r.totalFee ?? 0),
    destinationAccountName: r.destinationAccountName ?? "",
    destinationBankName: r.destinationBankName ?? "",
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Webhooks                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Verifies a Monnify webhook signature. Per Monnify's official sample
 * (Monnify/monnify-sample-webhook-nodejs server.js): the signature is
 * HMAC-SHA512 of `JSON.stringify(parsedBody)` keyed on the client secret,
 * sent in the `monnify-signature` header. We re-stringify after JSON.parse
 * to match Monnify's canonical formatting.
 */
export function verifyMonnifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;
  let canonical: string;
  try {
    canonical = JSON.stringify(JSON.parse(rawBody));
  } catch {
    return false;
  }
  const expected = crypto
    .createHmac("sha512", MONNIFY_SECRET_KEY)
    .update(canonical)
    .digest("hex");

  // Constant-time compare to avoid timing attacks
  if (expected.length !== signatureHeader.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Money helpers                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

/** Monnify amounts are in NGN (decimal). Our DB stores kobo (integer). */
export function koboToNaira(kobo: number): number {
  return Math.round(kobo) / 100;
}

export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/**
 * Monnify card/transfer fee: 1.5% capped at ₦2,000. No flat fee.
 * (Paystack was 1.5% + ₦100 flat above ₦2,500, capped at ₦2,000.)
 */
export function monnifyFeeKobo(totalKobo: number): number {
  return Math.min(Math.round(totalKobo * 0.015), 200000);
}
