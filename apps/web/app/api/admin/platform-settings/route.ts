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

export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await auth.serviceClient
    .from("platform_settings")
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates = body as {
    service_charge_pct?: number;
    service_charge_fixed_kobo?: number;
    merchant_charge_pct?: number;
    settlement_hold_hours?: number;
    delivery_base_fee_kobo?: number;
    delivery_per_km_rate_kobo?: number;
    delivery_max_radius_km?: number;
    delivery_max_fee_kobo?: number;
    delivery_commission_pct?: number;
    admin_whatsapp_number?: string | null;
    admin_alert_email?: string | null;
  };

  // Only allow known fields
  const allowed: Record<string, unknown> = {};
  if (updates.service_charge_pct !== undefined) allowed.service_charge_pct = updates.service_charge_pct;
  if (updates.service_charge_fixed_kobo !== undefined) allowed.service_charge_fixed_kobo = updates.service_charge_fixed_kobo;
  if (updates.merchant_charge_pct !== undefined) allowed.merchant_charge_pct = updates.merchant_charge_pct;
  if (updates.settlement_hold_hours !== undefined) allowed.settlement_hold_hours = updates.settlement_hold_hours;
  if (updates.delivery_base_fee_kobo !== undefined) allowed.delivery_base_fee_kobo = updates.delivery_base_fee_kobo;
  if (updates.delivery_per_km_rate_kobo !== undefined) allowed.delivery_per_km_rate_kobo = updates.delivery_per_km_rate_kobo;
  if (updates.delivery_max_radius_km !== undefined) allowed.delivery_max_radius_km = updates.delivery_max_radius_km;
  if (updates.delivery_max_fee_kobo !== undefined) allowed.delivery_max_fee_kobo = updates.delivery_max_fee_kobo;
  if (updates.delivery_commission_pct !== undefined) allowed.delivery_commission_pct = updates.delivery_commission_pct;
  if (updates.admin_whatsapp_number !== undefined) allowed.admin_whatsapp_number = updates.admin_whatsapp_number;
  if (updates.admin_alert_email !== undefined) allowed.admin_alert_email = updates.admin_alert_email;

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  allowed.updated_at = new Date().toISOString();
  allowed.updated_by = auth.user.id;

  // Singleton table — update the one row that always exists
  const { data, error } = await auth.serviceClient
    .from("platform_settings")
    .update(allowed)
    .not("id", "is", null)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
