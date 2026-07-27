import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { MerchantDetailClient, type AgreementRow } from "@/components/admin/merchant-detail-client";
import { MerchantSmsSenderCard } from "@/components/admin/merchant-sms-sender-card";

export const dynamic = "force-dynamic";

export default async function MerchantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServiceClient();
  const { id } = params;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const [
    { data: restaurant },
    { data: wallet },
    { data: ordersThisMonth },
    { data: ordersLastMonth },
    { data: ordersAllTime },
    { data: topItems },
    { data: customers },
    { data: recentOrders },
    { data: walletTransactions },
    { data: agreement },
    { data: recentSettlements },
  ] = await Promise.all([
    supabase
      .from("restaurants")
      .select("*")
      .eq("id", id)
      .single(),

    supabase
      .from("restaurant_wallets")
      .select("*")
      .eq("restaurant_id", id)
      .maybeSingle(),

    supabase
      .from("orders")
      .select("id, total_kobo, status")
      .eq("restaurant_id", id)
      .neq("status", "cancelled")
      .gte("created_at", startOfMonth),

    supabase
      .from("orders")
      .select("id, total_kobo, status")
      .eq("restaurant_id", id)
      .neq("status", "cancelled")
      .gte("created_at", startOfLastMonth)
      .lt("created_at", startOfMonth),

    supabase
      .from("orders")
      .select("id, total_kobo, status")
      .eq("restaurant_id", id)
      .neq("status", "cancelled"),

    supabase
      .from("order_items")
      .select("item_name, quantity")
      .eq("restaurant_id", id),

    supabase
      .from("customers")
      .select("id, phone, full_name, total_orders, total_spent_kobo, last_order_at, created_at, updated_at")
      .eq("restaurant_id", id)
      .order("total_orders", { ascending: false })
      .limit(50),

    supabase
      .from("orders")
      .select(
        "id, order_number, status, fulfillment_type, customer_name, customer_phone, subtotal_kobo, vat_kobo, delivery_fee_kobo, total_kobo, created_at, delivery_distance_km"
      )
      .eq("restaurant_id", id)
      .gte("created_at", new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString())
      .order("created_at", { ascending: false })
      .limit(500),

    supabase
      .from("wallet_transactions")
      .select("id, created_at, type, description, amount_kobo, direction, status")
      .eq("restaurant_id", id)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("merchant_agreements")
      .select("*")
      .eq("restaurant_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("settlements")
      .select("id, amount_kobo, status, paid_at, created_at, paystack_transfer_ref, monnify_disbursement_reference" as never)
      .eq("restaurant_id", id)
      .order("created_at", { ascending: false })
      .limit(10) as unknown as Promise<{
        data: Array<{
          id: string;
          amount_kobo: number;
          status: string;
          paid_at: string | null;
          created_at: string;
          paystack_transfer_ref: string | null;
          monnify_disbursement_reference: string | null;
        }> | null;
      }>,
  ]);

  if (!restaurant) {
    redirect("/admin/merchants");
  }

  // Aggregate top items
  const itemCounts = new Map<string, number>();
  (topItems ?? []).forEach((item) => {
    itemCounts.set(item.item_name, (itemCounts.get(item.item_name) ?? 0) + item.quantity);
  });
  const topItemsList: [string, number][] = [...itemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // KPIs
  const gmvThisMonth = (ordersThisMonth ?? []).reduce((s, o) => s + o.total_kobo, 0);
  const gmvLastMonth = (ordersLastMonth ?? []).reduce((s, o) => s + o.total_kobo, 0);
  const gmvGrowth =
    gmvLastMonth > 0 ? ((gmvThisMonth - gmvLastMonth) / gmvLastMonth) * 100 : null;

  const ordersThisMonthCount = (ordersThisMonth ?? []).length;
  const ordersLastMonthCount = (ordersLastMonth ?? []).length;
  const ordersAllTimeCount = (ordersAllTime ?? []).length;
  const ordersGrowth =
    ordersLastMonthCount > 0
      ? ((ordersThisMonthCount - ordersLastMonthCount) / ordersLastMonthCount) * 100
      : null;

  const safeCustomers = customers ?? [];
  const totalCustomers = safeCustomers.length;
  const repeatCustomers = safeCustomers.filter((c) => c.total_orders > 1).length;
  const repeatRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;

  const kitchynRevenue = (walletTransactions ?? [])
    .filter((t) => t.type === "service_charge" || t.type === "logistics_fee")
    .reduce((s, t) => s + t.amount_kobo, 0);

  const totalSettled = (recentSettlements ?? [])
    .filter((s) => s.status === "paid")
    .reduce((s, r) => s + r.amount_kobo, 0);

  const sinceDate = new Date(restaurant.created_at).toLocaleDateString("en-NG", {
    month: "short",
    year: "numeric",
  });

  // Compute AOV using all-time numbers for consistency
  const avgOrderValueAllTime =
    ordersAllTimeCount > 0
      ? (ordersAllTime ?? []).reduce((s, o) => s + o.total_kobo, 0) / ordersAllTimeCount
      : 0;

  return (
    <div className="p-6 pb-24 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/admin/merchants"
            className="inline-flex items-center gap-1 text-sm text-black-500 hover:text-black-900 transition-colors mb-3"
          >
            &larr; Back to Merchants
          </Link>
          <h1 className="text-2xl font-extrabold text-black-900">{restaurant.name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                restaurant.is_active
                  ? "bg-viridian-100 text-viridian-600"
                  : "bg-cinnabar-100 text-cinnabar-500"
              }`}
            >
              {restaurant.is_active ? "Active" : "Inactive"}
            </span>
            {restaurant.city && (
              <span className="text-sm text-black-500">{restaurant.city}</span>
            )}
            <span className="text-sm text-black-400">&middot; Since {sinceDate}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/admin/merchants/${restaurant.id}/qr-flyer`}
            className="text-sm text-purple-500 hover:text-purple-400 border border-purple-200 hover:border-purple-400 px-3 py-1.5 rounded-xl transition-colors"
          >
            QR flyer
          </Link>
          <Link
            href={`/${restaurant.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-purple-500 hover:text-purple-400 border border-purple-200 hover:border-purple-400 px-3 py-1.5 rounded-xl transition-colors"
          >
            View storefront &rarr;
          </Link>
        </div>
      </div>

      {/* SMS sender ID management */}
      <MerchantSmsSenderCard
        restaurantId={restaurant.id}
        senderId={restaurant.sms_sender_id ?? null}
        senderStatus={
          (restaurant.sms_sender_status as "pending" | "approved" | "rejected" | null) ?? null
        }
        requestedAt={restaurant.sms_sender_requested_at ?? null}
      />

      {/* Tabbed Content */}
      <Suspense>
      <MerchantDetailClient
        restaurant={{
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          city: restaurant.city ?? null,
          is_active: restaurant.is_active,
          whatsapp_number: restaurant.whatsapp_number ?? null,
          notification_email: restaurant.notification_email ?? null,
          bank_account_name: restaurant.bank_account_name ?? null,
          bank_account_number: restaurant.bank_account_number ?? null,
          paystack_recipient_code: restaurant.paystack_recipient_code ?? null,
          logistics_default: restaurant.logistics_default ?? null,
          latitude: restaurant.latitude ?? null,
          longitude: restaurant.longitude ?? null,
          max_delivery_radius_km: (restaurant as unknown as Record<string, unknown>).max_delivery_radius_km as number | null ?? null,
          restaurant_base_fee_kobo: (restaurant as unknown as Record<string, unknown>).restaurant_base_fee_kobo as number | null ?? null,
          restaurant_per_km_rate_kobo: (restaurant as unknown as Record<string, unknown>).restaurant_per_km_rate_kobo as number | null ?? null,
          restaurant_max_fee_kobo: (restaurant as unknown as Record<string, unknown>).restaurant_max_fee_kobo as number | null ?? null,
          created_at: restaurant.created_at,
        }}
        wallet={
          wallet
            ? {
                available_balance_kobo: wallet.available_balance_kobo,
                pending_balance_kobo: wallet.pending_balance_kobo,
                total_withdrawn_kobo: wallet.total_withdrawn_kobo,
              }
            : null
        }
        kpi={{
          gmvThisMonth,
          gmvLastMonth,
          gmvGrowth,
          ordersThisMonthCount,
          ordersLastMonthCount,
          ordersAllTimeCount,
          ordersGrowth,
          avgOrderValue: avgOrderValueAllTime,
          totalCustomers,
          repeatCustomers,
          repeatRate,
          kitchynRevenue,
          totalSettled,
        }}
        recentOrders={recentOrders ?? []}
        walletTransactions={walletTransactions ?? []}
        recentSettlements={recentSettlements ?? []}
        customers={safeCustomers}
        topItemsList={topItemsList}
        agreement={(agreement as unknown as AgreementRow) ?? null}
      />
      </Suspense>
    </div>
  );
}
