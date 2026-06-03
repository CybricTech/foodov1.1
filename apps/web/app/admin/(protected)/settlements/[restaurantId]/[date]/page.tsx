import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { SettlementDayDetailClient } from "@/components/admin/settlement-day-detail-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ restaurantId: string; date: string }>;
}

// `date` is a WAT (UTC+1) calendar day, "YYYY-MM-DD", matching how the parent
// settlement page groups orders. Translate it into the UTC half-open range
// [date 00:00 WAT, next-day 00:00 WAT) so the SQL filter lines up exactly with
// the client-side toWATDate() grouping.
function watDayBoundsUtc(date: string): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00+01:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export default async function SettlementDayDetailPage({ params }: PageProps) {
  const { restaurantId, date } = await params;
  const bounds = watDayBoundsUtc(date);
  if (!bounds) return notFound();

  const supabase = createServiceClient();

  const restaurantRes = await (supabase
    .from("restaurants")
    .select("id, name, slug, logistics_default" as never)
    .eq("id", restaurantId)
    .single() as unknown as Promise<{
      data: {
        id: string;
        name: string;
        slug: string;
        logistics_default: string | null;
      } | null;
    }>);
  const restaurant = restaurantRes.data;
  if (!restaurant) return notFound();

  const [{ data: orders }, { data: platformSettings }, { data: settlements }] =
    await Promise.all([
      // Every non-cancelled, non-pending order created within this WAT day.
      supabase
        .from("orders")
        .select(
          `
          id,
          order_number,
          customer_name,
          subtotal_kobo,
          delivery_fee_kobo,
          service_fee_kobo,
          vat_kobo,
          total_kobo,
          discount_kobo,
          discount_code,
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
        .gte("created_at", bounds.startIso)
        .lt("created_at", bounds.endIso)
        .order("created_at", { ascending: false }),

      supabase
        .from("platform_settings")
        .select("merchant_charge_pct, delivery_commission_pct")
        .single(),

      // Any settlement(s) recorded for this period_date — payout reference, etc.
      supabase
        .from("settlements")
        .select(
          `id, amount_kobo, status, settlement_type, bank_reference, receipt_url,
           period_date, order_count, gross_total_kobo, service_fee_total_kobo,
           merchant_charge_total_kobo, delivery_commission_kobo, canonical_net_kobo,
           paystack_transfer_ref, monnify_disbursement_reference,
           initiated_at, paid_at, created_at` as never
        )
        .eq("restaurant_id", restaurantId)
        .eq("period_date", date)
        .order("created_at", { ascending: false }) as unknown as Promise<{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: any[] | null;
        }>,
    ]);

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
      customer_name: (o.customer_name as string) ?? null,
      subtotal_kobo: (o.subtotal_kobo as number) ?? 0,
      delivery_fee_kobo: (o.delivery_fee_kobo as number) ?? 0,
      service_fee_kobo: (o.service_fee_kobo as number) ?? 0,
      vat_kobo: (o.vat_kobo as number) ?? 0,
      total_kobo: (o.total_kobo as number) ?? 0,
      discount_kobo: (o.discount_kobo as number) ?? 0,
      discount_code: (o.discount_code as string) ?? null,
      settlement_id: (o.settlement_id as string) ?? null,
      dispatch_type,
      fulfillment_type: o.fulfillment_type as string,
      status: o.status as string,
      created_at: o.created_at as string,
    };
  });

  if (normalizedOrders.length === 0) return notFound();

  return (
    <div className="p-6 pb-24">
      <SettlementDayDetailClient
        restaurant={{ id: restaurant.id, name: restaurant.name, slug: restaurant.slug }}
        date={date}
        orders={normalizedOrders}
        settlements={settlements ?? []}
        platformSettings={{
          merchantChargePct: platformSettings?.merchant_charge_pct ?? 0.01,
          deliveryCommissionPct: platformSettings?.delivery_commission_pct ?? 0.1,
        }}
      />
    </div>
  );
}
