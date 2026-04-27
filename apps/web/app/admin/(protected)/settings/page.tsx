import { createServiceClient } from "@/lib/supabase/server";
import { SettingsAdminClient } from "@/components/admin/settings-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const supabase = createServiceClient();

  const { data: settings } = await supabase
    .from("platform_settings")
    .select(
      "service_charge_pct, service_charge_fixed_kobo, merchant_charge_pct, settlement_hold_hours, delivery_base_fee_kobo, delivery_per_km_rate_kobo, delivery_max_radius_km, delivery_max_fee_kobo, delivery_commission_pct, admin_whatsapp_number, admin_alert_email"
    )
    .single();

  return (
    <div className="p-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-black-900">Settings</h1>
        <p className="text-black-500 text-sm mt-1">
          Platform configuration, delivery pricing &amp; notifications
        </p>
      </div>

      <SettingsAdminClient settings={settings} />
    </div>
  );
}
