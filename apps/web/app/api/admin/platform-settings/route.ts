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
    auto_payout_enabled?: boolean;
    auto_payout_shadow?: boolean;
    // Dispatch (migrations 095 / 101)
    bolt_booking_enabled?: boolean;
    bolt_booking_shadow?: boolean;
    bolt_environment?: string;
    bolt_rider_contact_phone?: string;
    timed_rider_request_enabled?: boolean;
    rider_request_lead_minutes?: number;
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
  if (updates.auto_payout_enabled !== undefined) allowed.auto_payout_enabled = updates.auto_payout_enabled;
  if (updates.auto_payout_shadow !== undefined) allowed.auto_payout_shadow = updates.auto_payout_shadow;
  if (updates.bolt_booking_enabled !== undefined) allowed.bolt_booking_enabled = updates.bolt_booking_enabled;
  if (updates.bolt_booking_shadow !== undefined) allowed.bolt_booking_shadow = updates.bolt_booking_shadow;
  if (updates.timed_rider_request_enabled !== undefined)
    allowed.timed_rider_request_enabled = updates.timed_rider_request_enabled;

  // Constrained rather than passed through: these two decide whether real rides
  // get booked with real money, so a malformed value must be rejected here and
  // not left to the DB check.
  if (updates.bolt_environment !== undefined) {
    if (!["sandbox", "production"].includes(updates.bolt_environment)) {
      return NextResponse.json(
        { error: "bolt_environment must be 'sandbox' or 'production'" },
        { status: 400 }
      );
    }
    allowed.bolt_environment = updates.bolt_environment;
  }
  if (updates.rider_request_lead_minutes !== undefined) {
    const lead = Number(updates.rider_request_lead_minutes);
    if (!Number.isFinite(lead) || lead < 0 || lead > 120) {
      return NextResponse.json(
        { error: "rider_request_lead_minutes must be between 0 and 120" },
        { status: 400 }
      );
    }
    allowed.rider_request_lead_minutes = Math.round(lead);
  }
  // This is the number Bolt's driver app dials/SMSes on every automated
  // booking (real money, real driver, once bolt_booking_enabled is live) — a
  // malformed value must be rejected here, matching the DB CHECK constraint,
  // not left to fail loudly mid-booking.
  if (updates.bolt_rider_contact_phone !== undefined) {
    const phone = updates.bolt_rider_contact_phone.trim();
    if (!/^\+[0-9]{10,15}$/.test(phone)) {
      return NextResponse.json(
        { error: "bolt_rider_contact_phone must be E.164 format, e.g. +2348012345678" },
        { status: 400 }
      );
    }
    allowed.bolt_rider_contact_phone = phone;
  }

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
