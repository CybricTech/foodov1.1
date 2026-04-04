import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Step 1: Release balances past hold period
  await supabase.rpc('release_pending_wallet_balances');

  // Step 2: Find wallets with available balance + recipient code
  const { data: wallets } = await supabase
    .from('restaurant_wallets')
    .select(`
      id,
      restaurant_id,
      available_balance_kobo,
      restaurants!inner (
        name,
        paystack_recipient_code
      )
    `)
    .gt('available_balance_kobo', 0)
    .not('restaurants.paystack_recipient_code', 'is', null);

  if (!wallets || wallets.length === 0) {
    return new Response(JSON.stringify({ message: 'No settlements due' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = [];

  for (const wallet of wallets) {
    const restaurant = wallet.restaurants as { name: string; paystack_recipient_code: string };
    const amountKobo = wallet.available_balance_kobo;

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

      // Step 4: Initiate Paystack Transfer
      const transferRes = await fetch('https://api.paystack.co/transfer', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'balance',
          amount: amountKobo,
          recipient: restaurant.paystack_recipient_code,
          reason: `Settlement for ${restaurant.name}`,
          reference: `SETTLE-${settlement.id}-${Date.now()}`,
          currency: 'NGN',
        }),
      });

      const transferData = await transferRes.json();

      if (!transferRes.ok || !transferData.status) {
        throw new Error(transferData.message ?? 'Paystack transfer failed');
      }

      const transferCode = transferData.data?.transfer_code;
      const transferRef = transferData.data?.reference;

      // Step 5: Update settlement with transfer code
      await supabase
        .from('settlements')
        .update({
          paystack_transfer_code: transferCode,
          paystack_transfer_ref: transferRef,
        })
        .eq('id', settlement.id);

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
