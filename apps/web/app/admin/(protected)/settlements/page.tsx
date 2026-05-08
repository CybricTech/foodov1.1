import { createServiceClient } from "@/lib/supabase/server";
import { SettlementsClient } from "@/components/admin/settlements-client";

export const dynamic = "force-dynamic";

export default async function AdminSettlementsPage() {
  const supabase = createServiceClient();

  const [
    { data: orders },
    { data: settlements, count },
    { data: allWallets },
    { data: settlementsByRestaurant },
    { data: platformSettings },
  ] = await Promise.all([
    // Fetch completed orders with revenue-relevant fields
    supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        restaurant_id,
        subtotal_kobo,
        delivery_fee_kobo,
        service_fee_kobo,
        vat_kobo,
        total_kobo,
        delivery_cost_kobo,
        settlement_id,
        fulfillment_type,
        status,
        dispatch_type,
        created_at,
        restaurants (name, paystack_recipient_code),
        delivery_assignments (dispatch_type)
      `
      )
      .neq("status", "cancelled")
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(500),

    // Settlement history with extended fields
    supabase
      .from("settlements")
      .select(
        `
        id,
        restaurant_id,
        amount_kobo,
        status,
        settlement_type,
        bank_reference,
        period_date,
        order_count,
        gross_total_kobo,
        service_fee_total_kobo,
        delivery_commission_kobo,
        paystack_transfer_code,
        paystack_transfer_ref,
        failure_reason,
        initiated_at,
        paid_at,
        created_at,
        restaurants (name, slug)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .limit(100),

    // ALL wallets for merchant settlement summary
    supabase
      .from("restaurant_wallets")
      .select(
        `
        restaurant_id,
        pending_balance_kobo,
        available_balance_kobo,
        total_earned_kobo,
        total_withdrawn_kobo,
        restaurants (name, slug, paystack_recipient_code)
      `
      )
      .order("total_earned_kobo", { ascending: false }),

    // All settlements grouped view (we aggregate client-side)
    supabase
      .from("settlements")
      .select(
        `
        id,
        restaurant_id,
        amount_kobo,
        status,
        paid_at,
        created_at
      `
      )
      .order("created_at", { ascending: false }),

    // Platform settings for fee calculations
    supabase
      .from("platform_settings")
      .select("merchant_charge_pct, delivery_commission_pct")
      .single(),
  ]);

  // Resolve dispatch_type. Order of preference:
  //   1. orders.dispatch_type (set by the dispatch route — source of truth)
  //   2. delivery_assignments.dispatch_type (legacy / fallback)
  //   3. null → un-dispatched delivery order (UI shows "Pending")
  const normalizedOrders = (orders ?? []).map((o: Record<string, unknown>) => {
    const assignments = o.delivery_assignments as Array<{ dispatch_type: string }> | null;
    const restaurant = o.restaurants as
      | { name: string; paystack_recipient_code: string | null }
      | null;

    const dispatch_type =
      (o.dispatch_type as string | null) ??
      (assignments && assignments.length > 0 ? assignments[0].dispatch_type : null);

    return {
      id: o.id as string,
      order_number: o.order_number as string,
      restaurant_id: o.restaurant_id as string,
      subtotal_kobo: (o.subtotal_kobo as number) ?? 0,
      delivery_fee_kobo: (o.delivery_fee_kobo as number) ?? 0,
      service_fee_kobo: (o.service_fee_kobo as number) ?? 0,
      vat_kobo: (o.vat_kobo as number) ?? 0,
      total_kobo: (o.total_kobo as number) ?? 0,
      delivery_cost_kobo: (o.delivery_cost_kobo as number | null) ?? null,
      settlement_id: (o.settlement_id as string) ?? null,
      dispatch_type,
      fulfillment_type: o.fulfillment_type as string,
      status: o.status as string,
      created_at: o.created_at as string,
      restaurants: restaurant ? { name: restaurant.name } : null,
      // True when the merchant is integrated with Foodo's Paystack — used by
      // the Daily P&L to exclude test merchants whose orders never settle to us
      restaurant_has_paystack: !!restaurant?.paystack_recipient_code,
    };
  });

  // Build per-restaurant settlement summaries
  const restaurantSettlementMap: Record<string, { totalPaid: number; totalPending: number; settlementCount: number }> = {};
  for (const s of settlementsByRestaurant ?? []) {
    if (!restaurantSettlementMap[s.restaurant_id]) {
      restaurantSettlementMap[s.restaurant_id] = { totalPaid: 0, totalPending: 0, settlementCount: 0 };
    }
    restaurantSettlementMap[s.restaurant_id].settlementCount++;
    if (s.status === "paid") {
      restaurantSettlementMap[s.restaurant_id].totalPaid += s.amount_kobo;
    } else if (s.status === "pending" || s.status === "processing") {
      restaurantSettlementMap[s.restaurant_id].totalPending += s.amount_kobo;
    }
  }

  const merchantSummaries = (allWallets ?? []).map((w: Record<string, unknown>) => {
    const restaurant = w.restaurants as { name: string; slug: string; paystack_recipient_code: string | null } | null;
    const rid = w.restaurant_id as string;
    const settlementData = restaurantSettlementMap[rid] ?? { totalPaid: 0, totalPending: 0, settlementCount: 0 };

    return {
      restaurant_id: rid,
      restaurant_name: restaurant?.name ?? "Unknown",
      restaurant_slug: restaurant?.slug ?? "",
      has_bank_account: !!restaurant?.paystack_recipient_code,
      pending_balance_kobo: (w.pending_balance_kobo as number) ?? 0,
      available_balance_kobo: (w.available_balance_kobo as number) ?? 0,
      total_earned_kobo: (w.total_earned_kobo as number) ?? 0,
      total_withdrawn_kobo: (w.total_withdrawn_kobo as number) ?? 0,
      total_paid_kobo: settlementData.totalPaid,
      total_pending_settlement_kobo: settlementData.totalPending,
      settlement_count: settlementData.settlementCount,
    };
  });

  return (
    <div className="p-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-black-900">Settlements</h1>
        <p className="text-black-500 text-sm mt-1">
          Revenue breakdown &amp; restaurant payouts · {count ?? 0} settlement records
        </p>
      </div>

      <SettlementsClient
        orders={normalizedOrders}
        settlements={settlements ?? []}
        merchantSummaries={merchantSummaries}
        platformSettings={{
          merchantChargePct: platformSettings?.merchant_charge_pct ?? 0.01,
          deliveryCommissionPct: platformSettings?.delivery_commission_pct ?? 0.10,
        }}
      />
    </div>
  );
}
