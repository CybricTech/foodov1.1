/**
 * Paystack client — the ONLY place that talks to the Paystack REST API for
 * payouts (transfers). Collection (transaction/initialize, charge webhook) is
 * handled inline in the checkout/webhook routes; this module is specifically
 * the *outbound money* surface: resolving a merchant's bank account, creating a
 * transfer recipient, checking our balance, and initiating a transfer.
 *
 * Money-path rules baked in here:
 *   • Every call throws a descriptive Error on a non-2xx OR on Paystack's
 *     `{ status: false }` envelope, so callers never silently treat a failed
 *     transfer as success. The settlement engine catches per-merchant.
 *   • All amounts are kobo (integer subunit) — same unit as the rest of the app.
 *   • `initiateTransfer` takes a caller-supplied `reference`. Paystack treats it
 *     as idempotent: re-sending the same reference returns the existing transfer
 *     instead of creating a second debit. This is our double-pay guard.
 *
 * Requires PAYSTACK_SECRET_KEY (sk_test_… in test mode, sk_live_… in live).
 */

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

/**
 * Single choke-point for every Paystack request. Throws on transport errors,
 * non-2xx responses, AND `{ status: false }` bodies (Paystack returns 200 with
 * status:false for some validation errors). The thrown message is the
 * Paystack-provided one where available, so logs/alerts are actionable.
 */
async function paystackFetch<T>(
  path: string,
  init?: RequestInit
): Promise<PaystackEnvelope<T>> {
  let res: Response;
  try {
    res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new Error(
      `Paystack request failed (${path}): ${err instanceof Error ? err.message : "network error"}`
    );
  }

  let body: PaystackEnvelope<T> | { status?: boolean; message?: string };
  try {
    body = await res.json();
  } catch {
    throw new Error(`Paystack returned a non-JSON response (${path}, HTTP ${res.status})`);
  }

  if (!res.ok || body.status === false) {
    const msg = body.message || `Paystack error (HTTP ${res.status})`;
    throw new Error(msg);
  }

  return body as PaystackEnvelope<T>;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Account name resolution (name enquiry)                                      */
/* ────────────────────────────────────────────────────────────────────────── */

export interface ResolvedAccount {
  accountNumber: string;
  accountName: string;
}

/**
 * Name-enquiry against the merchant's bank. Returns the real account holder's
 * name so the admin can eyeball it BEFORE any money is ever sent. This is the
 * anti-fumble guard: you pay a confirmed name, not just a string of digits.
 */
export async function resolveAccount(params: {
  accountNumber: string;
  bankCode: string;
}): Promise<ResolvedAccount> {
  const qs = new URLSearchParams({
    account_number: params.accountNumber,
    bank_code: params.bankCode,
  });
  const { data } = await paystackFetch<{ account_number: string; account_name: string }>(
    `/bank/resolve?${qs.toString()}`
  );
  return { accountNumber: data.account_number, accountName: data.account_name };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Transfer recipients                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

export interface TransferRecipient {
  recipientCode: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
}

/**
 * Create a NUBAN transfer recipient. The returned `recipient_code` is the
 * payout-ready marker we store on the restaurant — its presence is the gate the
 * settlement engine checks before paying a merchant. Paystack resolves the
 * account name itself here, so we persist *its* resolved name as the record of
 * who we're paying.
 */
export async function createTransferRecipient(params: {
  name: string;
  accountNumber: string;
  bankCode: string;
}): Promise<TransferRecipient> {
  const { data } = await paystackFetch<{
    recipient_code: string;
    details: { account_name: string; account_number: string; bank_code: string };
  }>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "nuban",
      name: params.name,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: "NGN",
    }),
  });

  return {
    recipientCode: data.recipient_code,
    accountName: data.details.account_name,
    accountNumber: data.details.account_number,
    bankCode: data.details.bank_code,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Balance                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Available NGN balance (kobo) on our Paystack account. Transfers draw from
 * this, so the settlement engine preflights against it to avoid kicking off a
 * run it can't fund. Returns 0 if no NGN balance row is present.
 */
export async function getNgnBalanceKobo(): Promise<number> {
  const { data } = await paystackFetch<Array<{ currency: string; balance: number }>>("/balance");
  const ngn = (data ?? []).find((b) => b.currency === "NGN");
  return ngn ? ngn.balance : 0;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Transfers                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

export interface TransferResult {
  transferCode: string;
  /** "success" | "pending" | "otp" | "processing" — terminal state confirmed by webhook. */
  status: string;
  reference: string;
}

/**
 * Initiate a single transfer to a recipient, funded from our Paystack balance.
 *
 * `reference` MUST be deterministic per logical payout (we use the settlement's
 * stable ref). Re-sending the same reference is a no-op that returns the
 * original transfer — this, plus the DB's one-settlement-per-period guard, makes
 * double payment structurally impossible even under cron double-fire or retry.
 *
 * Returns immediately with a non-terminal status in the common case; the
 * authoritative "did the money land" signal is the transfer.success webhook.
 * Never treat this function returning as proof of payment.
 */
export async function initiateTransfer(params: {
  amountKobo: number;
  recipientCode: string;
  reason: string;
  reference: string;
}): Promise<TransferResult> {
  if (!Number.isInteger(params.amountKobo) || params.amountKobo <= 0) {
    throw new Error(`Refusing to transfer a non-positive amount (${params.amountKobo} kobo)`);
  }

  const { data } = await paystackFetch<{
    transfer_code: string;
    status: string;
    reference: string;
  }>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: params.amountKobo,
      recipient: params.recipientCode,
      reason: params.reason,
      reference: params.reference,
      currency: "NGN",
    }),
  });

  return {
    transferCode: data.transfer_code,
    status: data.status,
    reference: data.reference,
  };
}
