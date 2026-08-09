import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDriverNote } from "@/lib/delivery/driver-note";

/**
 * parse_mode is HTML, so escape interpolated values — names and addresses can
 * contain & < >, which would otherwise break the message or be dropped.
 */
export function escapeTelegramHtml(v: string | number | null | undefined): string {
  return String(v ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Post a message to the rider group. Best-effort: returns false rather than
 * throwing, so an alert failing can never take down the caller.
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  return postToTelegramChat(process.env.TELEGRAM_CHAT_ID, text);
}

/**
 * Post a message to the ops/alerts group — TELEGRAM_ALERTS_CHAT_ID, a
 * separate chat from the rider group above (same bot token, different
 * destination). Already used by the Sentry webhook; audit alerts share it
 * rather than adding a third channel.
 */
export async function sendTelegramAlert(text: string): Promise<boolean> {
  return postToTelegramChat(process.env.TELEGRAM_ALERTS_CHAT_ID, text);
}

async function postToTelegramChat(
  chatId: string | undefined,
  text: string
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[telegram] send failed status=${res.status} ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[telegram] send threw:", err);
    return false;
  }
}

/**
 * Send the "New Rider Request" Telegram alert for an order — exactly once.
 *
 * Idempotency is enforced here, at the single chokepoint, so it holds no matter
 * which route calls it (new dispatch, re-dispatch, or status update) or how many
 * times. We atomically claim orders.rider_alert_sent_at: only the first caller
 * flips it from NULL, so concurrent or repeat calls update 0 rows and skip.
 * See migration 063 for the incident this prevents.
 *
 * @param source short label for logs identifying the trigger (e.g.
 *   "dispatch:new", "dispatch:existing", "status-update").
 */
export async function sendTelegramRiderAlert(
  supabase: SupabaseClient,
  orderId: string,
  restaurantId: string,
  orderNumber: string | number,
  source = "unknown"
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  // ── Idempotency claim ──────────────────────────────────────────────────────
  // Atomic: the WHERE on rider_alert_sent_at IS NULL means only one of any number
  // of concurrent/duplicate callers wins the row.
  let claimedHere = false;
  const { data: claimed, error: claimErr } = await supabase
    .from("orders")
    .update({ rider_alert_sent_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("rider_alert_sent_at", null)
    .select("id");

  if (claimErr) {
    // 42703 = column missing (migration 063 not yet applied to this DB). Fail
    // OPEN — keep sending so riders still get requests — until the column lands,
    // at which point full dedup activates with no code change.
    if (claimErr.code === "42703") {
      console.warn(
        `[rider-alert] dedup column missing; sending without idempotency order=${orderNumber} source=${source}`
      );
    } else {
      console.error(
        `[rider-alert] claim error order=${orderNumber} source=${source}: ${claimErr.message} — sending anyway`
      );
    }
  } else if (!claimed || claimed.length === 0) {
    // Already alerted (or won by a concurrent caller) — suppress the duplicate.
    console.log(`[rider-alert] skip duplicate order=${orderNumber} source=${source}`);
    return;
  } else {
    claimedHere = true;
    console.log(`[rider-alert] send order=${orderNumber} source=${source}`);
  }

  const [{ data: order }, { data: restaurant }] = await Promise.all([
    supabase
      .from("orders")
      .select("customer_name, customer_phone, delivery_address")
      .eq("id", orderId)
      .single(),
    supabase
      .from("restaurants")
      .select("name")
      .eq("id", restaurantId)
      .single(),
  ]);

  // Driver note: a self-contained block the dispatcher copies (the <pre> is
  // tap-to-copy in Telegram) and pastes straight into Bolt's “Note to driver”
  // when booking the ride manually. Built by the same helper the API booking
  // path uses, so both routes send a rider the identical instruction.
  const driverNote = buildDriverNote({
    orderNumber,
    restaurantName: restaurant?.name,
    deliveryAddress: order?.delivery_address,
    customerName: order?.customer_name,
    customerPhone: order?.customer_phone,
  });

  const text =
    `🔔 <b>New Rider Request</b>\n` +
    `Copy the note below → paste into Bolt’s “Note to driver”:\n\n` +
    `<pre>${escapeTelegramHtml(driverNote)}</pre>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[rider-alert] telegram send failed order=${orderNumber} source=${source} status=${res.status} ${body}`
      );
      // The send didn't land — release our claim so a later attempt can retry.
      if (claimedHere) {
        await supabase
          .from("orders")
          .update({ rider_alert_sent_at: null })
          .eq("id", orderId);
      }
    }
  } catch (err) {
    console.error(
      `[rider-alert] telegram send threw order=${orderNumber} source=${source}:`,
      err
    );
    if (claimedHere) {
      await supabase
        .from("orders")
        .update({ rider_alert_sent_at: null })
        .eq("id", orderId);
    }
  }
}
