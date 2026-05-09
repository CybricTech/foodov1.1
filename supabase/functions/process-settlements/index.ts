import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Settlement processor — initiates Monnify disbursements for every restaurant
 * wallet with available balance and a verified bank account.
 *
 * Auth model: Basic auth (apiKey:secretKey base64) → POST /auth/login → Bearer
 * token (1h TTL). The token is cached in the `monnify_auth_tokens` singleton
 * row so successive runs (and concurrent Next.js routes) share it.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MONNIFY_BASE_URL = Deno.env.get('MONNIFY_BASE_URL') ?? 'https://sandbox.monnify.com';
const MONNIFY_API_KEY = Deno.env.get('MONNIFY_API_KEY')!;
const MONNIFY_SECRET_KEY = Deno.env.get('MONNIFY_SECRET_KEY')!;
const MONNIFY_WALLET_ACCOUNT = Deno.env.get('MONNIFY_WALLET_ACCOUNT') ?? '';

const TOKEN_REFRESH_MARGIN_MS = 60_000;
const TOKEN_DEFAULT_TTL_MS = 3500 * 1000;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

let memCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (memCache && memCache.expiresAt > now + TOKEN_REFRESH_MARGIN_MS) {
    return memCache.token;
  }

  // L2: shared DB cache
  try {
    const { data: cached } = await supabase
      .from('monnify_auth_tokens')
      .select('access_token, expires_at')
      .eq('id', 'singleton')
      .maybeSingle();

    if (cached?.access_token && cached.expires_at) {
      const expiresAt = new Date(cached.expires_at).getTime();
      if (expiresAt > now + TOKEN_REFRESH_MARGIN_MS) {
        memCache = { token: cached.access_token, expiresAt };
        return cached.access_token;
      }
    }
  } catch (err) {
    console.error('[settlements] token cache read failed:', err);
  }

  const basic = btoa(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`);
  const res = await fetch(`${MONNIFY_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Monnify auth failed: ${res.status} ${errBody}`);
  }

  const data = await res.json();
  const token = data?.responseBody?.accessToken as string | undefined;
  if (!token) throw new Error('Monnify auth: missing accessToken');

  const ttlMs = data?.responseBody?.expiresIn
    ? Math.max(60_000, data.responseBody.expiresIn * 1000 - TOKEN_REFRESH_MARGIN_MS)
    : TOKEN_DEFAULT_TTL_MS;
  const expiresAt = now + ttlMs;

  memCache = { token, expiresAt };

  try {
    await supabase
      .from('monnify_auth_tokens')
      .upsert(
        {
          id: 'singleton',
          access_token: token,
          expires_at: new Date(expiresAt).toISOString(),
          refreshed_at: new Date(now).toISOString(),
        },
        { onConflict: 'id' }
      );
  } catch (err) {
    console.error('[settlements] token cache write failed:', err);
  }

  return token;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${MONNIFY_BASE_URL}${path}`;
  const doFetch = async () => {
    const token = await getAccessToken();
    return fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  };

  let res = await doFetch();
  if (res.status === 401) {
    memCache = null;
    res = await doFetch();
  }
  return res;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Step 1: Release balances past hold period
  await supabase.rpc('release_pending_wallet_balances');

  // Step 2: Find wallets with available balance + a verified Monnify bank account
  const { data: wallets } = await supabase
    .from('restaurant_wallets')
    .select(`
      id,
      restaurant_id,
      available_balance_kobo,
      restaurants!inner (
        name,
        bank_code,
        bank_account_number,
        bank_account_name,
        monnify_bank_verified_at
      )
    `)
    .gt('available_balance_kobo', 0)
    .not('restaurants.monnify_bank_verified_at', 'is', null);

  if (!wallets || wallets.length === 0) {
    return new Response(JSON.stringify({ message: 'No settlements due' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = [];

  for (const wallet of wallets) {
    const restaurant = wallet.restaurants as {
      name: string;
      bank_code: string;
      bank_account_number: string;
      bank_account_name: string;
    };
    const amountKobo = wallet.available_balance_kobo as number;
    const amountNaira = Math.round(amountKobo) / 100;

    try {
      // Step 3: Create settlement record (processing)
      const { data: settlement } = await supabase
        .from('settlements')
        .insert({
          restaurant_id: wallet.restaurant_id,
          amount_kobo: amountKobo,
          status: 'processing',
        })
        .select('id')
        .single();

      if (!settlement) throw new Error('Failed to create settlement record');

      // Step 4: Stamp our reference BEFORE calling Monnify so the webhook
      // can match on it even if our response handling crashes mid-flight.
      const ourRef = `SETTLE-${settlement.id}-${Date.now()}`;
      await supabase
        .from('settlements')
        .update({ monnify_disbursement_reference: ourRef })
        .eq('id', settlement.id);

      // Step 5: Initiate Monnify disbursement.
      // Field names match singleTransferSchema in Monnify-Nodejs-lib:
      // amount, reference, narration, destinationBankCode,
      // destinationAccountNumber, currencyCode, sourceAccountNumber, async.
      const disbursementRes = await authedFetch('/api/v2/disbursements/single', {
        method: 'POST',
        body: JSON.stringify({
          amount: amountNaira,
          reference: ourRef,
          narration: `Settlement for ${restaurant.name}`,
          destinationBankCode: restaurant.bank_code,
          destinationAccountNumber: restaurant.bank_account_number,
          currencyCode: 'NGN',
          ...(MONNIFY_WALLET_ACCOUNT ? { sourceAccountNumber: MONNIFY_WALLET_ACCOUNT } : {}),
          async: true,
        }),
      });

      const disbursementData = await disbursementRes.json();
      if (!disbursementRes.ok || !disbursementData?.requestSuccessful) {
        throw new Error(disbursementData?.responseMessage ?? 'Monnify disbursement failed');
      }
      // Monnify's disbursement webhook (SUCCESSFUL/FAILED/REVERSED_DISBURSEMENT)
      // is what populates monnify_transaction_reference. The init response's
      // `reference` is just an echo of our outgoing reference, so we don't
      // store it as the Monnify-side id here.

      // Step 6: Debit wallet available_balance via RPC
      await supabase.rpc('debit_wallet_for_settlement', {
        p_restaurant_id: wallet.restaurant_id,
        p_amount_kobo: amountKobo,
      });

      // Step 7: Create settlement_debit wallet transaction
      await supabase.from('wallet_transactions').insert({
        restaurant_id: wallet.restaurant_id,
        settlement_id: settlement.id,
        type: 'settlement_debit',
        direction: 'debit',
        amount_kobo: amountKobo,
        status: 'settled',
        description: `Bank transfer initiated — ${restaurant.name}`,
      });

      // Step 8: Mark available wallet transactions as settled
      await supabase
        .from('wallet_transactions')
        .update({ status: 'settled' })
        .eq('restaurant_id', wallet.restaurant_id)
        .eq('status', 'available');

      results.push({ restaurant_id: wallet.restaurant_id, status: 'initiated', amountKobo });
    } catch (err) {
      console.error(`Settlement failed for ${wallet.restaurant_id}:`, err);
      await supabase
        .from('settlements')
        .update({ status: 'failed', failure_reason: String(err) })
        .eq('restaurant_id', wallet.restaurant_id)
        .eq('status', 'processing');

      results.push({ restaurant_id: wallet.restaurant_id, status: 'failed', error: String(err) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
