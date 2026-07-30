import { createServiceClient } from "@/lib/supabase/server";
import { RidersClient } from "@/components/admin/riders-client";

export const dynamic = "force-dynamic";

/**
 * Rides are fetched separately rather than as a nested select so a single
 * query can cover both the active and historical order sets, and so the page
 * still renders if the Bolt tables aren't present yet.
 */
const RIDE_COLUMNS =
  "id, order_id, attempt, bolt_ride_id, state, fare_kobo, estimate_kobo, invoice_url, " +
  "fare_breakdown, driver_name, driver_phone, vehicle_category, eta_seconds, " +
  "driver_lat, driver_lng, location_updated_at, last_error, created_at, booked_at, " +
  "driver_assigned_at, picked_up_at, completed_at, cancelled_at";

export default async function AdminRidersPage() {
  const supabase = createServiceClient();

  const [{ data: activeDeliveries }, { data: history }, { data: settings }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        customer_name,
        customer_phone,
        delivery_address,
        delivery_fee_kobo,
        total_kobo,
        created_at,
        status,
        dispatch_state,
        rider_request_source,
        bolt_booking_claimed_at,
        bolt_autobook_stopped_at,
        restaurants (name, location_verified_at)
      `
      )
      // Since migration 101 a rider is requested up to a lead time before the
      // food is ready, so an order awaiting one is identified by having asked
      // (rider_requested_at) and not being over — not by a single status.
      // 'assigned_to_rider' remains in the list for orders dispatched pre-101.
      .not("rider_requested_at", "is", null)
      .in("status", [
        "confirmed",
        "preparing",
        "ready_for_pickup",
        "assigned_to_rider",
        "in_transit",
      ])
      .order("created_at", { ascending: false }),

    supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        customer_name,
        customer_phone,
        delivery_address,
        delivery_fee_kobo,
        delivery_cost_kobo,
        delivery_cost_source,
        delivery_distance_km,
        total_kobo,
        delivered_at,
        updated_at,
        created_at,
        restaurants (name),
        delivery_assignments (assigned_at)
      `
      )
      .eq("dispatch_type", "platform_rider")
      .eq("status", "delivered")
      .order("updated_at", { ascending: false })
      .limit(200),

    supabase
      .from("platform_settings")
      .select("bolt_booking_enabled, bolt_booking_shadow, bolt_environment")
      .single(),
  ]);

  const orderIds = [
    ...((activeDeliveries as { id: string }[] | null) ?? []).map((o) => o.id),
    ...((history as { id: string }[] | null) ?? []).map((o) => o.id),
  ];

  const { data: rides } = orderIds.length
    ? await supabase
        .from("bolt_rides")
        .select(RIDE_COLUMNS)
        .in("order_id", orderIds)
        .order("attempt", { ascending: true })
    : { data: [] };

  const s = settings as {
    bolt_booking_enabled?: boolean;
    bolt_booking_shadow?: boolean;
    bolt_environment?: string;
  } | null;

  return (
    <RidersClient
      /* eslint-disable @typescript-eslint/no-explicit-any */
      initialDeliveries={(activeDeliveries as unknown as any[]) ?? []}
      initialHistory={(history as unknown as any[]) ?? []}
      initialRides={(rides as unknown as any[]) ?? []}
      /* eslint-enable @typescript-eslint/no-explicit-any */
      boltStatus={{
        enabled: s?.bolt_booking_enabled ?? false,
        shadow: s?.bolt_booking_shadow ?? true,
        environment: s?.bolt_environment ?? "sandbox",
      }}
    />
  );
}
