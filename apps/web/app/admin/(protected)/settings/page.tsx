import { createServiceClient } from "@/lib/supabase/server";
import { SettingsAdminClient } from "@/components/admin/settings-admin-client";
import type { RiderContactStoreRow } from "@/components/admin/rider-contact-store-list";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const supabase = createServiceClient();

  // `*` rather than a column list: naming a column a newer migration hasn't
  // added yet fails the whole read, and this form then renders defaults. Saving
  // from that state would write those defaults back over the real settings
  // (booking switches included). With `*`, an absent column just shows its
  // default until the migration lands. Singleton row, super-admin-only page.
  const [{ data: settings }, { data: storeData, error: storeErr }] = await Promise.all([
    supabase.from("platform_settings").select("*").single(),
    // The "use this store's number" list under Dispatch. Named columns only.
    // These rows are handed to a client component, so bank details and the
    // rest of the restaurants row must not ride along.
    supabase
      .from("restaurants")
      .select("id, name, is_test, whatsapp_number, rider_contact_phone, rider_contact_selected")
      .eq("is_active", true)
      .order("name"),
  ]);

  // null (not []) when the read fails, so the list can say why instead of
  // looking like there are no stores. The usual cause is the rider-contact
  // migration not having run yet.
  const riderContactStores: RiderContactStoreRow[] | null = storeErr
    ? null
    : (storeData ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        isTest: r.is_test === true,
        whatsappNumber: r.whatsapp_number,
        customPhone: r.rider_contact_phone,
        selected: r.rider_contact_selected === true,
      }));

  return (
    <div className="p-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-black-900">Settings</h1>
        <p className="text-black-500 text-sm mt-1">
          Platform configuration, delivery pricing &amp; notifications
        </p>
      </div>

      <SettingsAdminClient settings={settings} riderContactStores={riderContactStores} />
    </div>
  );
}
