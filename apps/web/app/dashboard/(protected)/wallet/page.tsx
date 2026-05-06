import { createServerClient } from "@/lib/supabase/server";
import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import { WalletClient } from "@/components/dashboard/wallet-client";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = await createServerClient();

  const [
    { data: transactions },
    { data: settlements },
    { data: orders },
    { data: platformSettings },
    { data: restaurant },
  ] = await Promise.all([
    // Activity tab: recent wallet transactions
    supabase
      .from("wallet_transactions")
      .select("*")
      .eq("restaurant_id", session.restaurantId)
      .order("created_at", { ascending: false })
      .limit(50),

    // Payouts tab: all settlements — no limit so totalWithdrawn accounts for
    // every payout, not just the most recent 50
    supabase
      .from("settlements")
      .select(
        `id, amount_kobo, status, settlement_type, bank_reference, receipt_url,
         period_date, order_count, gross_total_kobo, service_fee_total_kobo,
         merchant_charge_total_kobo, delivery_commission_kobo,
         paystack_transfer_code, paystack_transfer_ref,
         failure_reason, initiated_at, paid_at, created_at`
      )
      .eq("restaurant_id", session.restaurantId)
      .order("created_at", { ascending: false }),

    // Orders with dispatch info — same query as admin settlement detail so all
    // stats (earned, pending, paid out) use the exact same formula on both sides
    supabase
      .from("orders")
      .select(
        `id, order_number, subtotal_kobo, delivery_fee_kobo, service_fee_kobo,
         vat_kobo, total_kobo, settlement_id, dispatch_type, fulfillment_type,
         status, created_at, delivery_assignments (dispatch_type)`
      )
      .eq("restaurant_id", session.restaurantId)
      .neq("status", "cancelled")
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200),

    // Fee percentages for net payout computation
    supabase
      .from("platform_settings")
      .select("merchant_charge_pct, delivery_commission_pct")
      .single(),

    // Logistics default for dispatch_type fallback
    supabase
      .from("restaurants")
      .select("logistics_default")
      .eq("id", session.restaurantId)
      .single(),
  ]);

  // Resolve dispatch_type with same priority as admin settlement detail
  const normalizedOrders = (orders ?? []).map((o: Record<string, unknown>) => {
    const assignments = o.delivery_assignments as Array<{ dispatch_type: string }> | null;
    const dispatch_type =
      (o.dispatch_type as string | null) ??
      (assignments?.length ? assignments[0].dispatch_type : null) ??
      restaurant?.logistics_default ??
      null;

    return {
      id: o.id as string,
      order_number: o.order_number as string,
      subtotal_kobo: (o.subtotal_kobo as number) ?? 0,
      delivery_fee_kobo: (o.delivery_fee_kobo as number) ?? 0,
      service_fee_kobo: (o.service_fee_kobo as number) ?? 0,
      vat_kobo: (o.vat_kobo as number) ?? 0,
      total_kobo: (o.total_kobo as number) ?? 0,
      settlement_id: (o.settlement_id as string | null) ?? null,
      dispatch_type,
      fulfillment_type: o.fulfillment_type as string,
      status: o.status as string,
      created_at: o.created_at as string,
    };
  });

  return (
    <WalletClient
      restaurantId={session.restaurantId}
      transactions={transactions ?? []}
      settlements={settlements ?? []}
      orders={normalizedOrders}
      platformSettings={{
        merchantChargePct: platformSettings?.merchant_charge_pct ?? 0.01,
        deliveryCommissionPct: platformSettings?.delivery_commission_pct ?? 0.10,
      }}
    />
  );
}
