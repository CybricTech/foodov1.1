import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature');
  const hash = createHmac('sha512', Deno.env.get('PAYSTACK_SECRET_KEY')!)
    .update(rawBody)
    .digest('hex');

  if (hash !== signature) return new Response('Unauthorized', { status: 401 });

  const event = JSON.parse(rawBody);

  if (event.event === 'transfer.success') {
    const transferCode = event.data?.transfer_code;
    await supabase
      .from('settlements')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('paystack_transfer_code', transferCode);
  }

  if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
    const transferCode = event.data?.transfer_code;
    const { data: settlement } = await supabase
      .from('settlements')
      .update({ status: 'failed', failure_reason: event.data?.reason ?? 'Transfer failed' })
      .eq('paystack_transfer_code', transferCode)
      .select('restaurant_id, amount_kobo')
      .single();

    // Restore available balance if transfer failed
    if (settlement) {
      await supabase.rpc('restore_failed_settlement', {
        p_restaurant_id: settlement.restaurant_id,
        p_amount_kobo: settlement.amount_kobo,
      });
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
