import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getPostHogClient } from "@/lib/posthog";

/**
 * Mark an order as refunded/cancelled so the merchant is NOT paid for it.
 *
 * Refunds themselves are processed out-of-band (money sent to the customer from
 * a separate bank). This endpoint is the *ledger* side of that: it guarantees a
 * refunded order never reaches a merchant payout.
 *
 * Two timing cases (see the settlement design):
 *   • UNSETTLED (the common case, within the 24h hold): the order isn't locked
 *     to a settlement yet. We cancel it + flag payment_status='refunded' and
 *     recompute the wallet — its net simply drops out of the merchant's pending
 *     balance. Clean, automatic, no money to claw back.
 *   • ALREADY SETTLED (rare): the order is locked to a 'processing' or 'paid'
 *     settlement — the merchant has been (or is being) paid. We do NOT silently
 *     reverse this; we BLOCK with a clear message so a human handles recovery
 *     (debit the merchant's next settlement). Failing loudly here is the safe
 *     choice for a money path.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { order_id, reason } = body as { order_id?: string; reason?: string };
  if (!order_id) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  // Fetch the order's current settlement linkage + amount.
  const { data: order, error: orderErr } = await serviceClient
    .from("orders")
    .select("id, restaurant_id, status, payment_status, settlement_id, total_kobo, order_number")
    .eq("id", order_id)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status === "cancelled") {
    return NextResponse.json(
      { error: "Order is already cancelled/refunded" },
      { status: 409 }
    );
  }

  // ── Case 2 guard: is this order already locked to a non-failed settlement? ──
  if (order.settlement_id) {
    const { data: settlement } = await serviceClient
      .from("settlements")
      .select("id, status, settlement_type, paystack_transfer_ref")
      .eq("id", order.settlement_id)
      .maybeSingle();

    // A FAILED settlement releases its orders (webhook nulls settlement_id);
    // if we still see the link, it's mid-release — ask the admin to retry.
    if (settlement && settlement.status !== "failed") {
      return NextResponse.json(
        {
          error:
            `This order is already part of settlement ${settlement.id} ` +
            `(status: ${settlement.status}). The merchant has been or is being paid for it. ` +
            `Process the customer refund out-of-band, then recover the amount by ` +
            `debiting the merchant's next settlement — this cannot be auto-reversed.`,
          alreadySettled: true,
          settlementId: settlement.id,
          settlementStatus: settlement.status,
        },
        { status: 409 }
      );
    }
  }

  // ── Unsettled path: cancel + flag refunded, race-guarded against the cron ──
  // The filter `settlement_id IS NULL` ensures we don't cancel an order the
  // payout cron locked between our read and write. Also clears any link to a
  // failed settlement so the row is clean.
  const { data: updated, error: updateErr } = await serviceClient
    .from("orders")
    .update({
      status: "cancelled",
      payment_status: "refunded",
      settlement_id: null,
    })
    .eq("id", order_id)
    .or(`settlement_id.is.null,settlement_id.eq.${order.settlement_id ?? "00000000-0000-0000-0000-000000000000"}`)
    .neq("status", "cancelled")
    .select("id")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!updated) {
    // 0 rows → the order was locked for settlement just now (race). Safe: tell
    // the admin to retry; nothing was changed.
    return NextResponse.json(
      {
        error:
          "Order was just locked for settlement — refund not applied. Re-check the " +
          "order's settlement status and retry.",
      },
      { status: 409 }
    );
  }

  // Re-derive the merchant wallet from source — the cancelled order now drops
  // out of pending automatically (recompute excludes cancelled). Loyalty
  // accrual/redemption is reversed by the existing order triggers on cancel.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceClient.rpc as any)("recompute_restaurant_wallet", {
    p_restaurant_id: order.restaurant_id,
  });

  await serviceClient.from("audit_logs").insert({
    actor_id: user.id,
    action: "order_refunded",
    target_type: "order",
    target_id: order_id,
    metadata: {
      restaurant_id: order.restaurant_id,
      order_number: order.order_number,
      total_kobo: order.total_kobo,
      reason: reason ?? null,
    },
  });

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "order refunded",
    properties: {
      order_id,
      restaurant_id: order.restaurant_id,
      total_kobo: order.total_kobo,
    },
  });
  await posthog.shutdown();

  return NextResponse.json({
    ok: true,
    order_id,
    // The amount to refund the customer out-of-band, for the admin's reference.
    refundAmountKobo: order.total_kobo,
    message: "Order cancelled and excluded from merchant payout. Process the customer refund out-of-band.",
  });
}
