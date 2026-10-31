import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";
import { getRideDetails, type BoltEnvironment } from "@/lib/bolt";
import {
  isRiderActiveState,
  latestTimestamp,
  remainingEtaSeconds,
  riderLegForState,
  type RiderDetails,
} from "@/lib/delivery/rider-details";

export const dynamic = "force-dynamic";

/**
 * The Kitchyn rider on one of the caller's orders: who they are, how to reach
 * them, where the delivery is going, and how many minutes out they are.
 *
 * GET ?orderId=<uuid>
 *
 * Open to merchant_owner AND merchant_staff — the people at the pass are the
 * ones who need to call a rider who can't find the store. Scoped to the
 * caller's own restaurant. Accepts the web cookie session or a mobile Bearer
 * token (getRequestUser), like the other /api/dashboard/orders routes.
 *
 * bolt_rides is admin-only under RLS, so this reads it with the service role
 * and returns only the fields a merchant should see — never fare, Bolt ids,
 * errors or the raw row.
 *
 * ETA freshness: bolt_rides.eta_seconds is only written on a state change, so
 * when it is older than ETA_REFRESH_SECONDS this asks Bolt's /rides/details
 * once and stores the new ETA. Bolt warns against frequent polling, so the
 * refresh is throttled per ride through eta_updated_at — however many staff
 * screens have the board open, Bolt is asked at most once a minute per ride.
 * A state change seen here is NOT applied: that stays with the webhook and the
 * reconcile cron, which own the state machine and the re-book path.
 */
const ETA_REFRESH_SECONDS = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RideRow {
  id: string;
  attempt: number;
  bolt_ride_id: number | null;
  state: string;
  environment: string;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_category: string | null;
  eta_seconds: number | null;
  /** Absent until migration 20261031120000 is applied. */
  eta_updated_at?: string | null;
  updated_at: string;
  driver_assigned_at: string | null;
  picked_up_at: string | null;
  tracking_url: string | null;
  pickup_address_sent?: string | null;
  dropoff_address_sent?: string | null;
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orderId = req.nextUrl.searchParams.get("orderId") ?? "";
  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, restaurant_id, is_active")
    .eq("id", user.id)
    .single();

  if (
    !profile?.restaurant_id ||
    profile.is_active === false ||
    !["merchant_owner", "merchant_staff"].includes(profile.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, restaurant_id, delivery_address")
    .eq("id", orderId)
    .eq("restaurant_id", profile.restaurant_id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // select("*") rather than a column list so this keeps working before the
  // eta_updated_at migration lands — a named missing column would fail the
  // whole query.
  const { data: rideData } = await supabase
    .from("bolt_rides")
    .select("*")
    .eq("order_id", orderId)
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ride = rideData as RideRow | null;
  const deliveryAddress = (order as { delivery_address: string | null }).delivery_address;

  if (!ride || !isRiderActiveState(ride.state)) {
    const empty: RiderDetails = {
      orderId,
      hasRider: false,
      rideState: ride?.state ?? null,
      leg: riderLegForState(ride?.state),
      riderName: null,
      riderPhone: null,
      vehicleCategory: null,
      etaSeconds: null,
      etaAsOf: null,
      pickupAddress: ride?.pickup_address_sent ?? null,
      dropoffAddress: ride?.dropoff_address_sent ?? deliveryAddress ?? null,
      driverAssignedAt: ride?.driver_assigned_at ?? null,
      pickedUpAt: ride?.picked_up_at ?? null,
      trackingUrl: null,
      attempt: ride?.attempt ?? null,
    };
    return NextResponse.json(empty);
  }

  let driverName = ride.driver_name;
  let driverPhone = ride.driver_phone;
  let trackingUrl = ride.tracking_url;
  let etaSeconds = ride.eta_seconds;
  let etaAsOf = latestTimestamp(ride.eta_updated_at, ride.updated_at);

  const ageSeconds = etaAsOf ? (Date.now() - new Date(etaAsOf).getTime()) / 1000 : Infinity;

  if (ride.bolt_ride_id && ageSeconds >= ETA_REFRESH_SECONDS) {
    const env: BoltEnvironment = ride.environment === "production" ? "production" : "sandbox";
    try {
      const details = await getRideDetails(env, ride.bolt_ride_id);
      // Same leg rule as applyRideState: before pickup the ETA that matters
      // is to the store, after it to the customer.
      const freshEta =
        details.state === "DRIVING_WITH_CLIENT"
          ? details.eta_to_destination
          : details.eta_to_client;

      // Only trust the reading if Bolt still agrees on the leg. If the state
      // moved, the webhook / cron will apply it; an ETA for a leg we haven't
      // recorded yet would be labelled wrongly.
      if (details.state === ride.state && typeof freshEta === "number") {
        const now = new Date().toISOString();
        etaSeconds = freshEta;
        etaAsOf = now;
        if (details.vehicle?.driver_name) driverName = details.vehicle.driver_name;
        if (details.vehicle?.driver_phone) driverPhone = details.vehicle.driver_phone;
        if (details.tracking_url) trackingUrl = details.tracking_url;

        const { error: updateError } = await supabase
          .from("bolt_rides")
          .update({
            eta_seconds: freshEta,
            eta_updated_at: now,
            driver_name: driverName,
            driver_phone: driverPhone,
            tracking_url: trackingUrl,
          })
          .eq("id", ride.id)
          // Never overwrite a ride the webhook moved on while we were asking.
          .eq("state", ride.state);

        if (updateError) {
          // Most likely the eta_updated_at migration isn't applied yet. The
          // fresh reading is still returned; it just isn't cached.
          console.warn(`[dashboard/rider] eta cache write failed ride=${ride.id}: ${updateError.message}`);
        }
      }
    } catch (err) {
      // Bolt being slow or down must not blank the panel — fall back to the
      // stored snapshot, counted down from when it was taken.
      console.warn(
        `[dashboard/rider] eta refresh failed ride=${ride.bolt_ride_id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  const body: RiderDetails = {
    orderId,
    hasRider: true,
    rideState: ride.state,
    leg: riderLegForState(ride.state),
    riderName: driverName,
    riderPhone: driverPhone,
    vehicleCategory: ride.vehicle_category,
    etaSeconds: remainingEtaSeconds(etaSeconds, etaAsOf),
    etaAsOf: new Date().toISOString(),
    pickupAddress: ride.pickup_address_sent ?? null,
    dropoffAddress: ride.dropoff_address_sent ?? deliveryAddress ?? null,
    driverAssignedAt: ride.driver_assigned_at,
    pickedUpAt: ride.picked_up_at,
    trackingUrl,
    attempt: ride.attempt,
  };

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
