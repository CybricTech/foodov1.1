import { createServiceClient } from "@/lib/supabase/server";
import { WrappedAdminClient, type AdminWrappedRow } from "@/components/admin/wrapped-admin-client";
import type { WrappedEdition, WrappedStats } from "@foodo/utils";

export const dynamic = "force-dynamic";

/**
 * Kitchyn Wrapped — admin preview. Lists every merchant's published editions
 * and lets an admin watch any of them exactly as the merchant sees it.
 * `?live=<restaurant_id>` builds an unpublished, all-time story up to right now
 * (works for test merchants too), so a story can be checked before it drops.
 */
export default async function AdminWrappedPage({
  searchParams,
}: {
  searchParams: { live?: string };
}) {
  // Layout already gates super_admin.
  const supabase = createServiceClient();

  const [{ data: restaurants }, { data: editions }] = await Promise.all([
    supabase.from("restaurants").select("id, name, created_at, is_test").order("name"),
    supabase
      .from("merchant_wrapped")
      .select("restaurant_id, period_key, scope, stats, published_at")
      .order("period_key", { ascending: false }),
  ]);

  const rows: AdminWrappedRow[] = (restaurants ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    isTest: r.is_test,
    editions: (editions ?? [])
      .filter((e) => e.restaurant_id === r.id)
      .map((e) => ({ period_key: e.period_key, scope: e.scope as WrappedEdition["scope"], stats: e.stats as unknown as WrappedStats })),
  }));

  let live: WrappedEdition | null = null;
  const liveRestaurant = (restaurants ?? []).find((r) => r.id === searchParams.live);
  if (liveRestaurant) {
    const now = new Date();
    const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    // wrapped_compute_stats isn't in the generated RPC types yet.
    const { data } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>)(
      "wrapped_compute_stats",
      { p_restaurant: liveRestaurant.id, p_from: liveRestaurant.created_at, p_to: now.toISOString(), p_scope: "all_time" }
    );
    if (data) {
      live = { period_key: periodKey, scope: "all_time", stats: { ...(data as WrappedStats), period_key: periodKey } };
    }
  }

  return <WrappedAdminClient rows={rows} live={live} />;
}
