import { createServiceClient } from "@/lib/supabase/server";
import { AgreementsListClient } from "@/components/admin/agreements-list-client";

export const dynamic = "force-dynamic";

export default async function AdminAgreementsPage() {
  const supabase = createServiceClient();

  const [{ data: restaurants }, { data: agreements }] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id, name, slug, is_active")
      .order("name"),
    supabase
      .from("merchant_agreements")
      .select("id, restaurant_id, status, legal_name, template_version, created_at, updated_at, merchant_signed_at, countersigned_at")
      .order("created_at", { ascending: false }),
  ]);

  // One row per merchant — the most recent agreement (created_at DESC already applied).
  const latestByRestaurant = new Map<string, NonNullable<typeof agreements>[number]>();
  for (const row of agreements ?? []) {
    if (!latestByRestaurant.has(row.restaurant_id)) {
      latestByRestaurant.set(row.restaurant_id, row);
    }
  }

  const rows = (restaurants ?? []).map((r) => ({
    restaurant_id: r.id,
    restaurant_name: r.name,
    restaurant_slug: r.slug,
    restaurant_active: r.is_active,
    agreement: latestByRestaurant.get(r.id) ?? null,
  }));

  return (
    <div className="p-6 pb-24 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-black-900">Merchant Agreements</h1>
        <p className="text-black-500 text-sm mt-1">
          View, generate, and countersign per-merchant agreements via DocuSeal.
        </p>
      </div>

      <AgreementsListClient rows={rows} />
    </div>
  );
}
