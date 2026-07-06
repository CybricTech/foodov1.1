import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

async function requireSuperAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "super_admin") return null;

  return { user, serviceClient };
}

/**
 * Set (or clear) a merchant's in-house delivery commission override.
 *
 * Body: { delivery_commission_pct: number | null }
 *   number — fraction of the delivery fee, 0–1 (e.g. 0.15 = 15%)
 *   null   — clear the override; the merchant inherits the platform default
 *
 * This changes real money: the new rate re-prices every UNSETTLED order of
 * this merchant (the same semantics as changing the platform-wide rate — see
 * migration 089). Settled history is frozen and never rewritten. The change is
 * audit-logged and the wallet is recomputed immediately so the admin and
 * merchant views reflect it without waiting for the next page load.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { delivery_commission_pct: raw } = body as { delivery_commission_pct?: unknown };

  let pct: number | null;
  if (raw === null) {
    pct = null;
  } else if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1) {
    // Normalise to the column precision NUMERIC(5,4) so what we audit-log is
    // exactly what the database stores.
    pct = Math.round(raw * 10000) / 10000;
  } else {
    return NextResponse.json(
      { error: "delivery_commission_pct must be null or a fraction between 0 and 1 (e.g. 0.10 = 10%)" },
      { status: 400 }
    );
  }

  // Read the current value first — the audit trail must show old → new.
  const { data: existing, error: readErr } = await auth.serviceClient
    .from("restaurants")
    .select("name, delivery_commission_pct" as never)
    .eq("id", id)
    .single();

  if (readErr || !existing) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const previous =
    (existing as unknown as { delivery_commission_pct: number | null }).delivery_commission_pct ?? null;

  const { error: updateErr } = await auth.serviceClient
    .from("restaurants")
    .update({ delivery_commission_pct: pct } as never)
    .eq("id", id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Re-derive the wallet from source so the pending balance reflects the new
  // rate immediately (unsettled orders re-price; settled history is frozen).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (auth.serviceClient.rpc as any)("recompute_restaurant_wallet", {
    p_restaurant_id: id,
  });

  await auth.serviceClient.from("audit_logs").insert({
    actor_id: auth.user.id,
    action: "merchant_delivery_commission_updated",
    target_type: "restaurant",
    target_id: id,
    metadata: {
      restaurant_id: id,
      restaurant_name: (existing as unknown as { name: string }).name,
      previous_delivery_commission_pct: previous,
      new_delivery_commission_pct: pct,
    },
  });

  return NextResponse.json({ id, delivery_commission_pct: pct });
}
