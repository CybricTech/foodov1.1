import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { MerchantSettlementDetailClient } from "@/components/admin/merchant-settlement-detail-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ restaurantId: string }>;
}

export default async function MerchantSettlementDetailPage({ params }: PageProps) {
  const { restaurantId } = await params;
  const supabase = createServiceClient();

  // Fetch restaurant details
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, slug, logistics_default, paystack_recipient_code, bank_account_name, bank_account_number, bank_code")
    .eq("id", restaurantId)
    .single();

  if (!restaurant) return notFound();

  // Fetch all data in parallel
  const [
    { data: wallet },
    { data: settlements },
    { data: orders },
    { data: platformSettings },
  ] = await Promise.all([
    // Wallet balance
    supabase
      .from("restaurant_wallets")
      .select("pending_balance_kobo, available_balance_kobo, total_earned_kobo, total_withdrawn_kobo")
      .eq("restaurant_id", restaurantId)
      .single(),

    // All settlements for this restaurant — with extended fields
    supabase
      .from("settlements")
      .select(
        `id, amount_kobo, status, settlement_type, bank_reference, receipt_url,
         period_date, order_count, gross_total_kobo, service_fee_total_kobo,
         merchant_charge_total_kobo, delivery_commission_kobo,
         paystack_transfer_code, paystack_transfer_ref,
         failure_reason, initiated_at, paid_at, created_at`
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false }),

    // All completed orders for this restaurant — with settlement_id
    supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        subtotal_kobo,
        delivery_fee_kobo,
        service_fee_kobo,
        vat_kobo,
        total_kobo,
        settlement_id,
        fulfillment_type,
        dispatch_type,
        status,
        created_at,
        delivery_assignments (dispatch_type)
      `
      )
      .eq("restaurant_id", restaurantId)
      .neq("status", "cancelled")
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200),

    // Platform settings for fee calculations
    supabase
      .from("platform_settings")
      .select("merchant_charge_pct, delivery_commission_pct")
      .single(),
  ]);

  // Resolve dispatch_type. Order of preference (matches settlements-client):
  //   1. orders.dispatch_type (set by the dispatch route — source of truth)
  //   2. delivery_assignments.dispatch_type (legacy / fallback)
  //   3. restaurant.logistics_default
  //   4. null → un-dispatched delivery order
  const normalizedOrders = (orders ?? []).map((o: Record<string, unknown>) => {
    const assignments = o.delivery_assignments as Array<{ dispatch_type: string }> | null;
    const dispatch_type =
      (o.dispatch_type as string | null) ??
      (assignments && assignments.length > 0 ? assignments[0].dispatch_type : null) ??
      restaurant.logistics_default ??
      null;

    return {
      id: o.id as string,
      order_number: o.order_number as string,
      subtotal_kobo: (o.subtotal_kobo as number) ?? 0,
      delivery_fee_kobo: (o.delivery_fee_kobo as number) ?? 0,
      service_fee_kobo: (o.service_fee_kobo as number) ?? 0,
      vat_kobo: (o.vat_kobo as number) ?? 0,
      total_kobo: (o.total_kobo as number) ?? 0,
      settlement_id: (o.settlement_id as string) ?? null,
      dispatch_type,
      fulfillment_type: o.fulfillment_type as string,
      status: o.status as string,
      created_at: o.created_at as string,
    };
  });

  return (
    <div className="p-6 pb-24">
      <MerchantSettlementDetailClient
        restaurant={{
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          logistics_default: restaurant.logistics_default,
          has_bank_account: !!restaurant.paystack_recipient_code,
          bank_account_name: restaurant.bank_account_name,
          bank_account_number: restaurant.bank_account_number,
          bank_code: restaurant.bank_code,
        }}
        wallet={wallet ?? {
          pending_balance_kobo: 0,
          available_balance_kobo: 0,
          total_earned_kobo: 0,
          total_withdrawn_kobo: 0,
        }}
        settlements={settlements ?? []}
        orders={normalizedOrders}
        platformSettings={{
          merchantChargePct: platformSettings?.merchant_charge_pct ?? 0.01,
          deliveryCommissionPct: platformSettings?.delivery_commission_pct ?? 0.10,
        }}
      />
    </div>
  );
}
