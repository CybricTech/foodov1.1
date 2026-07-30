import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRideDetails, type BoltEnvironment } from "@/lib/bolt";
import { applyRideState, type BoltRideRow } from "@/lib/bolt/apply-ride-state";
import { handleFailedRide } from "@/lib/bolt/rebook";
import { getPostHogClient } from "@/lib/posthog";

/**
 * Bolt ride-state webhook.
 *
 * Auth is a bearer token *we* generate and hand to Bolt (there is no signing
 * secret in this direction), compared in constant time.
 *
 * Bolt retries on any non-2xx and its docs state events are neither ordered nor
 * deduplicated, so past the auth check this always answers 200 — a failure here
 * belongs in our logs, not amplified into a retry storm. Correctness comes from
 * applyRideState refusing to move an already-terminal ride, not from Bolt
 * delivering cleanly.
 *
 * The payload's `state` is deliberately ignored. Bolt recommends treating a
 * webhook as "something changed" and re-reading the ride, which is also what
 * makes out-of-order delivery safe.
 */

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const expectedToken = process.env.BOLT_WEBHOOK_TOKEN;
  // Fail closed: an unset token must not mean "accept everything".
  if (!expectedToken) {
    console.error("[bolt-webhook] BOLT_WEBHOOK_TOKEN is not configured");
    return false;
  }
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${expectedToken}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { ride_id?: number; type?: string; state?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rideId = payload?.ride_id;
  if (typeof rideId !== "number") {
    console.warn("[bolt-webhook] payload without a numeric ride_id:", payload);
    return NextResponse.json({ received: true });
  }

  try {
    const supabase = createServiceClient();

    const { data } = await supabase
      .from("bolt_rides")
      .select("id, order_id, restaurant_id, attempt, bolt_ride_id, state, fare_kobo, environment")
      .eq("bolt_ride_id", rideId)
      .maybeSingle();

    const ride = data as BoltRideRow | null;
    if (!ride) {
      // A ride we didn't book, or one booked against a different environment.
      console.warn(`[bolt-webhook] unknown ride_id=${rideId}`);
      return NextResponse.json({ received: true });
    }

    const env: BoltEnvironment = ride.environment === "production" ? "production" : "sandbox";

    // Source of truth is the API, not the payload.
    const details = await getRideDetails(env, rideId);
    const result = await applyRideState(supabase, ride, details, env);

    console.log(
      `[bolt-webhook] ride=${rideId} payload_state=${payload.state} actual=${details.state} action=${result.action}`
    );

    if (result.action === "failed") {
      await handleFailedRide(supabase, {
        orderId: ride.order_id,
        attempt: ride.attempt,
        failedState: result.state,
      });
    }

    if (result.action === "delivered") {
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: ride.order_id,
        event: "order delivered",
        properties: {
          order_id: ride.order_id,
          delivery_cost_kobo: result.fareKobo,
          source: "bolt",
          attempt: ride.attempt,
        },
      });
      await posthog.shutdown();
    }
  } catch (err) {
    // Swallowed on purpose — see the note above about retry storms. The
    // reconciliation cron re-polls anything left in a non-terminal state.
    console.error(`[bolt-webhook] processing failed ride=${rideId}:`, err);
  }

  return NextResponse.json({ received: true });
}
