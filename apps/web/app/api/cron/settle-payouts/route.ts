import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import {
  summarizeSettlement,
  SETTLEMENT_ORDER_COLUMNS,
  type RawSettlementOrder,
} from "@/lib/settlements/build-settlement";
import {
  initiateTransfer,
  createTransferRecipient,
  getNgnBalanceKobo,
} from "@/lib/paystack";
import { getPostHogClient } from "@/lib/posthog";

export const dynamic = "force-dynamic";
// Transfers run sequentially (so the balance preflight stays accurate), so give
// the function headroom for a fleet of merchants. One Paystack call each.
export const maxDuration = 120;

/**
 * Automated merchant payout engine.
 *
 * Triggered once daily by the settle-payouts edge function (itself fired by
 * pg_cron — see migration 082). All the money logic lives HERE, in the Next.js
 * app, so it can use the canonical @foodo/utils formula via the shared
 * summariser — the exact same math the manual admin route uses.
 *
 * Per run, for every payout-enabled merchant:
 *   1. Select unsettled, billable orders whose 24h hold has elapsed.
 *   2. Compute the canonical net. Skip if ≤ 0 (refund-heavy day → carry forward).
 *   3. SHADOW MODE: log what we *would* pay and stop. No DB writes, no money.
 *   4. REAL MODE: ensure a transfer recipient for the *current* saved account,
 *      preflight our Paystack balance, insert a settlement (status=processing),
 *      lock the orders, then initiate the transfer. The transfer.success webhook
 *      flips it to paid; a failure unlocks the orders and releases the wallet.
 *
 * Safety invariants:
 *   • The settlement `reference` is deterministic (STL-<rest8>-<period>), so a
 *     retry/double-fire can never double-pay (Paystack dedupes on reference,
 *     and a partial unique index forbids a second automated row per period).
 *   • Orders are locked to a 'processing' settlement BEFORE the transfer fires;
 *     on any failure they are unlocked and the wallet recomputed from source.
 *   • One bad merchant is isolated in try/catch and never aborts the run.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // ── Load controls + fee config ────────────────────────────────────────────
  const { data: settings, error: settingsErr } = await supabase
    .from("platform_settings")
    .select(
      "merchant_charge_pct, delivery_commission_pct, settlement_hold_hours, " +
        "auto_payout_enabled, auto_payout_shadow, admin_alert_email"
    )
    .single();

  if (settingsErr || !settings) {
    return NextResponse.json({ error: "Failed to load platform settings" }, { status: 500 });
  }

  const s = settings as unknown as {
    merchant_charge_pct: number | null;
    delivery_commission_pct: number | null;
    settlement_hold_hours: number | null;
    auto_payout_enabled: boolean | null;
    auto_payout_shadow: boolean | null;
    admin_alert_email: string | null;
  };

  if (!s.auto_payout_enabled) {
    return NextResponse.json({ disabled: true, message: "auto_payout_enabled is false" });
  }

  const shadow = s.auto_payout_shadow !== false; // default-safe: only real when explicitly false
  const holdHours = Number(s.settlement_hold_hours ?? 24);
  const feeSettings = {
    merchantChargePct: Number(s.merchant_charge_pct ?? 0.01),
    deliveryCommissionPct: Number(s.delivery_commission_pct ?? 0.1),
  };

  const nowMs = Date.now();
  // Only orders whose own hold window has fully elapsed are eligible. This is
  // what enforces the 24h hold — NOT the cron schedule.
  const cutoffIso = new Date(nowMs - holdHours * 60 * 60 * 1000).toISOString();
  // Settlement period label = the run date in WAT (en-CA → YYYY-MM-DD).
  const periodDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
  }).format(new Date());

  // ── Eligible merchants ────────────────────────────────────────────────────
  const { data: merchants, error: merchErr } = await supabase
    .from("restaurants")
    .select(
      "id, name, logistics_default, paystack_recipient_code, bank_code, " +
        "bank_account_number, bank_account_name" as never
    )
    .eq("auto_payout_enabled", true as never);

  if (merchErr) {
    return NextResponse.json({ error: merchErr.message }, { status: 500 });
  }

  type Merchant = {
    id: string;
    name: string | null;
    logistics_default: string | null;
    paystack_recipient_code: string | null;
    bank_code: string | null;
    bank_account_number: string | null;
    bank_account_name: string | null;
  };
  const eligible = (merchants ?? []) as unknown as Merchant[];

  // Balance preflight (real mode only). We decrement as we pay so we never kick
  // off a transfer we can't fund — which would leave orders locked to a failed
  // settlement and a merchant unpaid mid-run.
  let remainingBalanceKobo = Infinity;
  if (!shadow) {
    try {
      remainingBalanceKobo = await getNgnBalanceKobo();
    } catch (err) {
      // Can't read balance → do not gamble. Abort the whole run; nothing moved.
      alertAdmin("Payout run aborted", {
        reason: "Could not read Paystack balance",
        detail: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "Could not read Paystack balance — run aborted" },
        { status: 502 }
      );
    }
  }

  const result = {
    shadow,
    periodDate,
    eligibleMerchants: eligible.length,
    paid: 0,
    initiated: 0,
    skippedNoOrders: 0,
    skippedZeroNet: 0,
    skippedNoRecipient: 0,
    skippedInsufficientBalance: 0,
    failed: 0,
    wouldPay: [] as Array<{ restaurantId: string; name: string | null; orderCount: number; netKobo: number }>,
  };

  for (const m of eligible) {
    try {
      // 1. Already settled this period? (defence in depth; unique index also guards)
      const { data: existing } = await supabase
        .from("settlements")
        .select("id")
        .eq("restaurant_id", m.id)
        .eq("period_date", periodDate)
        .eq("settlement_type", "automatic")
        .neq("status", "failed")
        .limit(1);
      if (existing && existing.length > 0) continue;

      // 2. Unsettled, billable, hold-elapsed orders.
      const { data: ordersRaw, error: ordersErr } = await supabase
        .from("orders")
        .select(SETTLEMENT_ORDER_COLUMNS)
        .eq("restaurant_id", m.id)
        .is("settlement_id", null)
        .neq("status", "cancelled")
        .neq("status", "pending")
        .lte("created_at", cutoffIso);

      if (ordersErr) throw new Error(`order fetch: ${ordersErr.message}`);
      if (!ordersRaw || ordersRaw.length === 0) {
        result.skippedNoOrders++;
        continue;
      }

      const { computed, orderIds } = summarizeSettlement(
        ordersRaw as unknown as RawSettlementOrder[],
        m.logistics_default,
        feeSettings
      );
      const netKobo = computed.netPayout;

      if (netKobo <= 0) {
        result.skippedZeroNet++;
        continue;
      }

      // 3. Shadow mode — log only, move nothing.
      if (shadow) {
        result.wouldPay.push({
          restaurantId: m.id,
          name: m.name,
          orderCount: computed.orderCount,
          netKobo,
        });
        console.log(
          `[settle-payouts][shadow] WOULD PAY ${m.name ?? m.id}: ` +
            `₦${(netKobo / 100).toFixed(2)} across ${computed.orderCount} order(s)`
        );
        continue;
      }

      // 4a. Resolve the recipient for the CURRENT saved account. Prefer the
      // stored code; if absent, create it on the fly from the saved details so
      // we always pay whatever account is in the merchant's settings right now.
      let recipientCode = m.paystack_recipient_code;
      if (!recipientCode) {
        if (!m.bank_code || !m.bank_account_number) {
          result.skippedNoRecipient++;
          alertAdmin("Merchant has no payout account", {
            restaurantId: m.id,
            name: m.name,
            netKobo,
          });
          continue;
        }
        try {
          const recipient = await createTransferRecipient({
            name: m.bank_account_name || m.name || "Merchant",
            accountNumber: m.bank_account_number,
            bankCode: m.bank_code,
          });
          recipientCode = recipient.recipientCode;
          // Persist so the next run reuses it (kept in sync on every save).
          await supabase
            .from("restaurants")
            .update({ paystack_recipient_code: recipientCode } as never)
            .eq("id", m.id);
        } catch (err) {
          result.skippedNoRecipient++;
          alertAdmin("Recipient creation failed", {
            restaurantId: m.id,
            name: m.name,
            detail: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
      }

      // 4b. Balance preflight.
      if (netKobo > remainingBalanceKobo) {
        result.skippedInsufficientBalance++;
        alertAdmin("Insufficient Paystack balance for payout", {
          restaurantId: m.id,
          name: m.name,
          netKobo,
          remainingBalanceKobo,
        });
        continue;
      }

      // 4c. Record the settlement (processing) BEFORE moving money. The
      // deterministic reference is the idempotency key; the unique index makes a
      // duplicate impossible even under a concurrent run.
      const reference = `STL-${m.id.slice(0, 8)}-${periodDate.replace(/-/g, "")}`;
      const initiatedAt = new Date().toISOString();

      const { data: settlement, error: insertErr } = await supabase
        .from("settlements")
        .insert({
          restaurant_id: m.id,
          settlement_type: "automatic",
          status: "processing",
          amount_kobo: netKobo,
          canonical_net_kobo: netKobo,
          period_date: periodDate,
          order_count: computed.orderCount,
          gross_total_kobo: computed.grossTotal,
          service_fee_total_kobo: computed.serviceFeeTotal,
          merchant_charge_total_kobo: computed.merchantChargeTotal,
          delivery_commission_kobo: computed.deliveryCommissionTotal,
          paystack_transfer_ref: reference,
          initiated_at: initiatedAt,
        } as never)
        .select("id")
        .single();

      if (insertErr || !settlement) {
        // 23505 = unique violation → another run already claimed this period.
        if ((insertErr as { code?: string } | null)?.code === "23505") continue;
        throw new Error(`settlement insert: ${insertErr?.message ?? "unknown"}`);
      }

      // 4d. Lock the orders to this settlement (only ones still unlocked) and
      // verify we locked EXACTLY the set we priced. If a concurrent process
      // grabbed any of them, the locked set no longer matches the amount — so we
      // fully roll back and let the next run settle cleanly. This guarantees the
      // transferred amount always equals the sum of the orders it represents.
      const { data: lockedRows, error: lockErr } = await supabase
        .from("orders")
        .update({ settlement_id: settlement.id } as never)
        .in("id", orderIds)
        .is("settlement_id", null)
        .select("id");

      if (lockErr || !lockedRows || lockedRows.length !== orderIds.length) {
        await supabase
          .from("orders")
          .update({ settlement_id: null } as never)
          .eq("settlement_id", settlement.id);
        await supabase.from("settlements").delete().eq("id", settlement.id);
        if (lockErr) throw new Error(`order lock: ${lockErr.message}`);
        // Race, not an error — skip this merchant; next run retries.
        console.warn(
          `[settle-payouts] lock mismatch for ${m.id}: expected ${orderIds.length}, ` +
            `locked ${lockedRows?.length ?? 0} — rolled back, will retry next run`
        );
        continue;
      }

      // Re-derive wallet counters now that orders are locked (no order trigger).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)("recompute_restaurant_wallet", { p_restaurant_id: m.id });

      // 4e. Move the money.
      try {
        const transfer = await initiateTransfer({
          amountKobo: netKobo,
          recipientCode,
          reason: `Kitchyn payout — ${computed.orderCount} order(s) · ${periodDate}`,
          reference,
        });

        const patch: Record<string, unknown> = { paystack_transfer_code: transfer.transferCode };
        // Some transfers settle synchronously; the webhook is still the
        // authoritative confirmation, but reflect an immediate success too.
        if (transfer.status === "success") {
          patch.status = "paid";
          patch.paid_at = new Date().toISOString();
          result.paid++;
        } else {
          result.initiated++;
        }
        await supabase.from("settlements").update(patch as never).eq("id", settlement.id);

        remainingBalanceKobo -= netKobo;
        // The settlement row (transfer_code, ref, amounts, status) is itself the
        // queryable money trail — no separate audit row needed (and audit_logs
        // requires a human actor_id this cron doesn't have).
        console.log(
          `[settle-payouts] initiated ${m.name ?? m.id}: ₦${(netKobo / 100).toFixed(2)} ` +
            `(${transfer.status}) ref=${reference} transfer=${transfer.transferCode}`
        );
      } catch (transferErr) {
        // Transfer failed to even start (e.g. balance race, bad recipient).
        // Unlock the orders, mark the settlement failed, release the wallet.
        result.failed++;
        await supabase
          .from("orders")
          .update({ settlement_id: null } as never)
          .eq("settlement_id", settlement.id);
        await supabase
          .from("settlements")
          .update({
            status: "failed",
            failure_reason:
              transferErr instanceof Error ? transferErr.message : "Transfer initiation failed",
          } as never)
          .eq("id", settlement.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)("recompute_restaurant_wallet", { p_restaurant_id: m.id });
        alertAdmin("Payout transfer failed", {
          restaurantId: m.id,
          name: m.name,
          netKobo,
          detail: transferErr instanceof Error ? transferErr.message : String(transferErr),
        });
      }
    } catch (err) {
      result.failed++;
      console.error(`[settle-payouts] merchant ${m.id} errored:`, err);
      getPostHogClient().captureException(err, "settle-payouts-cron", {
        restaurant_id: m.id,
      });
    }
  }

  if (shadow) {
    const total = result.wouldPay.reduce((sum, w) => sum + w.netKobo, 0);
    console.log(
      `[settle-payouts][shadow] run complete — would pay ${result.wouldPay.length} merchant(s), ` +
        `₦${(total / 100).toFixed(2)} total`
    );
  }

  await getPostHogClient().shutdown();

  return NextResponse.json(result);
}

/** Bearer == service-role key, length-guarded constant-time compare. */
function isAuthorized(request: NextRequest): boolean {
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Best-effort operator alert. Surfaces to the console (→ Sentry) and PostHog so
 * a skipped/failed payout is visible in the observability stack. Never throws —
 * alerting must never break the payout loop. Failed *transfers* additionally
 * leave a settlements row (status='failed', failure_reason); skips (no
 * recipient, low balance) only alert here and are retried on the next run.
 */
function alertAdmin(subject: string, detail: Record<string, unknown>): void {
  console.error(`[settle-payouts] ALERT: ${subject}`, detail);
  try {
    getPostHogClient().capture({
      distinctId: "settle-payouts-cron",
      event: "payout_alert",
      properties: { subject, ...detail },
    });
  } catch {
    /* observability is best-effort */
  }
}
