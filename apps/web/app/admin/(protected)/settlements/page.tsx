import { createServiceClient } from "@/lib/supabase/server";
import { SettlementsClient } from "@/components/admin/settlements-client";

export const dynamic = "force-dynamic";

export default async function AdminSettlementsPage() {
  const supabase = createServiceClient();

  const [
    { data: settlements, count },
    { data: wallets },
    { data: settings },
  ] = await Promise.all([
    supabase
      .from("settlements")
      .select(
        `
        id,
        restaurant_id,
        amount_kobo,
        status,
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
      .limit(50),

    supabase
      .from("restaurant_wallets")
      .select(
        `
        restaurant_id,
        pending_balance_kobo,
        available_balance_kobo,
        total_earned_kobo,
        total_withdrawn_kobo,
        restaurants (name, paystack_recipient_code)
      `
      )
      .gt("available_balance_kobo", 0)
      .order("available_balance_kobo", { ascending: false }),

    supabase
      .from("platform_settings")
      .select("service_charge_pct, service_charge_fixed_kobo, settlement_hold_hours")
      .single(),
  ]);

  return (
    <div className="p-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-black-900">Settlements</h1>
        <p className="text-black-500 text-sm mt-1">
          Manage payouts · {count ?? 0} total records
        </p>
      </div>

      <SettlementsClient
        settlements={settlements ?? []}
        pendingWallets={wallets ?? []}
        settings={settings}
      />
    </div>
  );
}
