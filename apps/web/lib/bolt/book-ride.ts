/**
 * Bolt ride booking engine.
 *
 * Called wherever an order enters `assigned_to_rider`. Every abort path falls
 * back to the Telegram driver note, so an order can never end up silently
 * unbooked — the worst case is today's manual flow.
 *
 * Two invariants worth stating up front:
 *
 *  - **Motorbike only.** If no motorbike is available we do not book at all.
 *    Silently substituting a car would multiply the cost of a delivery whose
 *    fee was quoted for a bike.
 *  - **Verified pickup only.** A store whose coordinates weren't resolved from
 *    a picked Google place is not trusted to send a rider to; those stores fall
 *    back to Telegram until someone confirms the address in Settings.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BoltApiError,
  createRide,
  estimateRide,
  selectMotorbikeFare,
  type BoltEnvironment,
  type BoltStop,
} from "@/lib/bolt";
import { buildDriverNote } from "@/lib/delivery/driver-note";

/**
 * The phone number registered as the "rider" on every Bolt trip we book —
 * never the customer's own number. Kept as one constant so it's a single
 * place to change platform-wide.
 */
const BOLT_RIDER_CONTACT_PHONE = "+2348063662721";

/**
 * The name registered alongside BOLT_RIDER_CONTACT_PHONE. Deliberately not
 * the customer's name — the driver sees this name and number as a pair, and
 * the real customer contact lives in note_to_driver, not here.
 */
const BOLT_RIDER_CONTACT_NAME = "Check message for ride details";

export type BookingOutcome =
  /** Ride is booked with Bolt; humans need not be paged. */
  | { outcome: "booked"; rideId: number; boltRideId: number }
  /** Shadow mode: estimated only. Humans still book manually. */
  | { outcome: "shadow"; estimateKobo: number | null }
  /** Another caller owns this order's booking. Do nothing. */
  | { outcome: "skipped" }
  /** Could not book. Caller must fall back to the Telegram note. */
  | { outcome: "fallback"; reason: string };

export interface BoltSettings {
  enabled: boolean;
  shadow: boolean;
  environment: BoltEnvironment;
}

export async function readBoltSettings(supabase: SupabaseClient): Promise<BoltSettings> {
  const { data } = await supabase
    .from("platform_settings")
    .select("bolt_booking_enabled, bolt_booking_shadow, bolt_environment")
    .single();

  const row = data as {
    bolt_booking_enabled?: boolean;
    bolt_booking_shadow?: boolean;
    bolt_environment?: string;
  } | null;

  return {
    enabled: row?.bolt_booking_enabled ?? false,
    shadow: row?.bolt_booking_shadow ?? true,
    environment: row?.bolt_environment === "production" ? "production" : "sandbox",
  };
}

interface OrderRow {
  id: string;
  order_number: string | number;
  restaurant_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
}

interface RestaurantRow {
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  location_verified_at: string | null;
}

/**
 * Books the next ride attempt for an order and records it in `bolt_rides`.
 *
 * Every call writes a row, success or failure, so the Riders console and the
 * reconciliation cron always have a record of what was tried and why it
 * didn't work.
 */
export async function createRideAttempt(
  supabase: SupabaseClient,
  orderId: string,
  settings: BoltSettings,
  source: string
): Promise<BookingOutcome> {
  const [{ data: orderData }, { data: attemptRows }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_number, restaurant_id, customer_name, customer_phone, delivery_address, delivery_lat, delivery_lng"
      )
      .eq("id", orderId)
      .single(),
    supabase
      .from("bolt_rides")
      .select("attempt")
      .eq("order_id", orderId)
      .order("attempt", { ascending: false })
      .limit(1),
  ]);

  const order = orderData as OrderRow | null;
  if (!order) return { outcome: "fallback", reason: "order not found" };

  const { data: restaurantData } = await supabase
    .from("restaurants")
    .select("name, address, latitude, longitude, location_verified_at")
    .eq("id", order.restaurant_id)
    .single();
  const restaurant = restaurantData as RestaurantRow | null;

  const attempt = ((attemptRows as { attempt: number }[] | null)?.[0]?.attempt ?? 0) + 1;

  const noteToDriver = buildDriverNote({
    orderNumber: order.order_number,
    restaurantName: restaurant?.name,
    deliveryAddress: order.delivery_address,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
  });

  // Claim the attempt number up front. The unique index on (order_id, attempt)
  // means two racing re-books can't both take the same slot.
  const { data: created, error: insertErr } = await supabase
    .from("bolt_rides")
    .insert({
      order_id: order.id,
      restaurant_id: order.restaurant_id,
      attempt,
      environment: settings.environment,
      state: "PENDING_CREATE",
      note_to_driver: noteToDriver,
      pickup_lat: restaurant?.latitude ?? null,
      pickup_lng: restaurant?.longitude ?? null,
      dropoff_lat: order.delivery_lat,
      dropoff_lng: order.delivery_lng,
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    // 23505 = another caller took this attempt number.
    if ((insertErr as { code?: string } | null)?.code === "23505") {
      return { outcome: "skipped" };
    }
    console.error(`[bolt] could not record ride attempt order=${orderId}:`, insertErr);
    return { outcome: "fallback", reason: "could not record ride attempt" };
  }

  const rideRowId = (created as { id: string }).id;

  const fail = async (reason: string, code: string | null = null): Promise<BookingOutcome> => {
    await supabase
      .from("bolt_rides")
      .update({
        state: "CREATE_FAILED",
        last_error: reason,
        last_error_code: code,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rideRowId);
    console.error(`[bolt] booking failed order=${order.order_number} source=${source}: ${reason}`);
    return { outcome: "fallback", reason };
  };

  // ── Pickup must be a confirmed address ────────────────────────────────────
  if (!restaurant?.location_verified_at || restaurant.latitude == null || restaurant.longitude == null) {
    return fail("store address is not confirmed — set it in Settings › Restaurant location");
  }
  if (order.delivery_lat == null || order.delivery_lng == null) {
    return fail("order has no delivery coordinates");
  }

  // Built once and reused verbatim for both calls: the fare_id is single-use,
  // expires in 5 minutes, and Bolt rejects a create whose stops differ at all
  // from the estimate they were quoted against.
  //
  // Coordinates only — Bolt's schema says not to send `address` unless they've
  // told you to. The human-readable addresses travel in note_to_driver instead.
  const stops: BoltStop[] = [
    { lat: Number(restaurant.latitude), lng: Number(restaurant.longitude) },
    { lat: Number(order.delivery_lat), lng: Number(order.delivery_lng) },
  ];

  let categories;
  try {
    categories = await estimateRide(settings.environment, stops);
  } catch (err) {
    const e = err as BoltApiError;
    return fail(`estimation failed: ${e.message}`, e.code ?? null);
  }

  const fare = selectMotorbikeFare(categories);
  if (!fare) {
    return fail("no motorbike available for this trip");
  }

  // ── Shadow: record what we would have booked, book nothing ────────────────
  if (settings.shadow) {
    await supabase
      .from("bolt_rides")
      .update({
        state: "SHADOW",
        estimate_kobo: fare.estimateKobo,
        vehicle_category: fare.categoryName,
        eta_seconds: fare.etaSeconds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rideRowId);
    console.log(
      `[bolt] shadow estimate order=${order.order_number} kobo=${fare.estimateKobo} source=${source}`
    );
    return { outcome: "shadow", estimateKobo: fare.estimateKobo };
  }

  // ── Live booking ──────────────────────────────────────────────────────────
  let ride;
  try {
    ride = await createRide(settings.environment, {
      fareId: fare.fareId,
      stops,
      // Fixed, same reasoning as the phone below: showing the real customer's
      // name next to an ops phone number is its own source of confusion — the
      // driver would see a name that doesn't match whoever picks up when they
      // call. Pointed at the note_to_driver field instead, which actually has
      // the real name, phone and address together.
      riderName: BOLT_RIDER_CONTACT_NAME,
      // The registered "rider" contact on every Bolt trip — deliberately NOT
      // the customer's own phone. The customer is never the one talking to
      // the driver; the note_to_driver instruction already carries the real
      // customer number for the driver to call on arrival (buildDriverNote).
      // This is the operations line instead, so Bolt's own driver-facing
      // contact and any Bolt-side SMS/calls land in one consistent place.
      riderPhone: BOLT_RIDER_CONTACT_PHONE,
      noteToDriver,
    });
  } catch (err) {
    const e = err as BoltApiError;
    return fail(`create failed: ${e.message}`, e.code ?? null);
  }

  if (!ride?.ride_id) {
    return fail("create returned no ride_id");
  }

  await supabase
    .from("bolt_rides")
    .update({
      bolt_ride_id: ride.ride_id,
      state: "SEARCHING",
      estimate_kobo: fare.estimateKobo,
      vehicle_category: fare.categoryName,
      eta_seconds: fare.etaSeconds,
      booked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rideRowId);

  console.log(
    `[bolt] booked order=${order.order_number} ride=${ride.ride_id} attempt=${attempt} source=${source}`
  );

  return { outcome: "booked", rideId: ride.ride_id, boltRideId: ride.ride_id };
}

/**
 * First booking for an order, called from the dispatch path.
 *
 * Claims `orders.bolt_booking_claimed_at` the same way the Telegram alert
 * claims `rider_alert_sent_at` (migration 063) — dispatch reaches this from
 * three separate write paths and they must not race into a double booking.
 *
 * The claim is deliberately never released: a failure leaves a CREATE_FAILED
 * row for the Riders console to act on. Releasing it would let a later
 * dispatch write auto-book a ride on top of one a human already booked from
 * the Telegram fallback.
 */
export async function bookRideForOrder(
  supabase: SupabaseClient,
  orderId: string,
  source: string
): Promise<BookingOutcome> {
  const settings = await readBoltSettings(supabase);
  if (!settings.enabled) {
    return { outcome: "fallback", reason: "bolt booking disabled" };
  }

  const { data: claimed, error: claimErr } = await supabase
    .from("orders")
    .update({ bolt_booking_claimed_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("bolt_booking_claimed_at", null)
    .select("id");

  if (claimErr) {
    // 42703 = migration 095 not applied here. Fail closed: without the latch
    // we could double-book, and double-booking spends real money.
    console.error(`[bolt] claim failed order=${orderId}: ${claimErr.message}`);
    return { outcome: "fallback", reason: "could not claim booking" };
  }

  if (!claimed || claimed.length === 0) {
    return { outcome: "skipped" };
  }

  return createRideAttempt(supabase, orderId, settings, source);
}
