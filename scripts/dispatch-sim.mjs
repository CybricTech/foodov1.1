#!/usr/bin/env node
// Dispatch simulator — drives the policy/timer half of the delivery flow.
//
// The rider request is time-driven: a platform merchant's order asks for a rider
// ~10 minutes before the food is ready. Testing that honestly would mean sitting
// through a 35-minute countdown per attempt, so the due time is a plain column
// and this script writes to it. Pairs with scripts/bolt-sandbox.mjs, which
// drives the other half (the ride itself) through every state on demand.
//
// Nothing here books a ride or spends money on its own. It moves rows and pokes
// the cron; whether a real Bolt ride results is decided by the platform's own
// switches (bolt_booking_enabled / bolt_booking_shadow / bolt_environment).
//
// Usage:
//   node scripts/dispatch-sim.mjs status <orderNumber>
//       Everything about one order's dispatch: policy, food status, rider state,
//       due time, which trigger fired, and any Bolt ride attached.
//
//   node scripts/dispatch-sim.mjs policy <slug> <platform|in_house|hybrid>
//       Move a merchant onto a lane.
//
//   node scripts/dispatch-sim.mjs lead <slug> <minutes|clear>
//       Per-merchant lead-time override.
//
//   node scripts/dispatch-sim.mjs due <orderNumber> [minutesFromNow]
//       Force an order's countdown. Default 0 = due right now, so the next tick
//       (or `dispatch-sim tick`) picks it up. THE time-travel button.
//
//   node scripts/dispatch-sim.mjs arm <orderNumber> <prepMinutes>
//       Pretend the merchant just accepted with this prep time: sets the ETA and
//       recomputes the due time from it, the same way update-status does.
//
//   node scripts/dispatch-sim.mjs dry
//       Ask the cron what it WOULD request. Claims nothing, sends nothing.
//
//   node scripts/dispatch-sim.mjs tick [orderNumber]
//       Run the cron for real, optionally scoped to one order.
//
//   node scripts/dispatch-sim.mjs reset <orderNumber> [--force]
//       Un-request an order so it can be tested again: clears the latch, the
//       rider state and the delivery-split ledger rows. It DELETES
//       wallet_transactions rows, so by default it refuses to touch anything but
//       a TEST- order. --force overrides that; think before you use it.
//
//   node scripts/dispatch-sim.mjs settings [on|off]
//       Show, or flip, the timed-request master switch.
//
// Reads SUPABASE_URL / SERVICE_ROLE_KEY and APP_BASE_URL from apps/web/.env,
// or the process env if already exported. Secrets are never printed.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = resolve(REPO_ROOT, "apps/web/.env");

/* ── env ─────────────────────────────────────────────────────────────────── */

function loadEnvFile(path) {
  try {
    const out = {};
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      // apps/web/.env escapes $ as \$ so Next's dotenv-expand leaves it alone.
      out[m[1]] = v.replace(/\\\$/g, "$");
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = loadEnvFile(ENV_FILE);
const env = (k) => process.env[k] || fileEnv[k];

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL") || env("SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const APP_BASE_URL = (env("APP_BASE_URL") || "http://localhost:3000").replace(/\/$/, "");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (apps/web/.env or env)."
  );
  process.exit(1);
}

/* ── tiny PostgREST client ───────────────────────────────────────────────── */

async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function findOrder(orderNumber) {
  const rows = await rest(
    `orders?order_number=eq.${encodeURIComponent(orderNumber)}&select=` +
      "id,order_number,status,fulfillment_type,dispatch_type,dispatch_state," +
      "estimated_delivery_at,rider_request_due_at,rider_requested_at," +
      "rider_request_source,delivery_fee_kobo,restaurant_id," +
      "restaurants(name,slug,dispatch_policy,rider_request_lead_minutes)"
  );
  if (!rows?.length) throw new Error(`No order with number ${orderNumber}`);
  return rows[0];
}

async function findRestaurant(slug) {
  const rows = await rest(
    `restaurants?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug,dispatch_policy,rider_request_lead_minutes`
  );
  if (!rows?.length) throw new Error(`No restaurant with slug ${slug}`);
  return rows[0];
}

const rel = (iso) => {
  if (!iso) return "—";
  const secs = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const mins = Math.round(Math.abs(secs) / 60);
  const when = Math.abs(secs) < 60 ? `${Math.abs(secs)}s` : `${mins}m`;
  return `${iso}  (${secs >= 0 ? "in " : ""}${when}${secs < 0 ? " ago" : ""})`;
};

/* ── cron ────────────────────────────────────────────────────────────────── */

async function callCron(body) {
  const res = await fetch(`${APP_BASE_URL}/api/cron/request-due-riders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text);
}

/* ── commands ────────────────────────────────────────────────────────────── */

const commands = {
  async status([orderNumber]) {
    if (!orderNumber) throw new Error("usage: status <orderNumber>");
    const o = await findOrder(orderNumber);
    const r = o.restaurants ?? {};

    console.log(`\nOrder #${o.order_number}`);
    console.log(`  merchant        ${r.name} (${r.slug})`);
    console.log(`  policy          ${r.dispatch_policy ?? "—"}`);
    console.log(`  lead override   ${r.rider_request_lead_minutes ?? "— (platform default)"}`);
    console.log(`  fulfillment     ${o.fulfillment_type}`);
    console.log(`\n  FOOD`);
    console.log(`    status        ${o.status}`);
    console.log(`    ready at      ${rel(o.estimated_delivery_at)}`);
    console.log(`\n  RIDER`);
    console.log(`    dispatch_state ${o.dispatch_state ?? "—"}`);
    console.log(`    lane           ${o.dispatch_type ?? "—"}`);
    console.log(`    due at         ${rel(o.rider_request_due_at)}`);
    console.log(`    requested at   ${rel(o.rider_requested_at)}`);
    console.log(`    triggered by   ${o.rider_request_source ?? "—"}`);

    const rides = await rest(
      `bolt_rides?order_id=eq.${o.id}&select=attempt,state,bolt_ride_id,estimate_kobo,fare_kobo,tracking_url,last_error&order=attempt.desc`
    );
    if (rides?.length) {
      console.log(`\n  BOLT RIDES`);
      for (const ride of rides) {
        console.log(
          `    #${ride.attempt} ${ride.state}` +
            (ride.bolt_ride_id ? ` ride=${ride.bolt_ride_id}` : "") +
            (ride.estimate_kobo != null ? ` est=₦${ride.estimate_kobo / 100}` : "") +
            (ride.fare_kobo != null ? ` fare=₦${ride.fare_kobo / 100}` : "") +
            (ride.last_error ? ` err="${ride.last_error}"` : "")
        );
        if (ride.tracking_url) console.log(`       track: ${ride.tracking_url}`);
      }
    } else {
      console.log(`\n  BOLT RIDES     none (manual lane, or not requested yet)`);
    }
    console.log("");
  },

  async policy([slug, policy]) {
    if (!slug || !policy) throw new Error("usage: policy <slug> <platform|in_house|hybrid>");
    if (!["platform", "in_house", "hybrid"].includes(policy)) {
      throw new Error("policy must be platform, in_house or hybrid");
    }
    const r = await findRestaurant(slug);
    await rest(`restaurants?id=eq.${r.id}`, {
      method: "PATCH",
      body: { dispatch_policy: policy },
    });
    console.log(`${r.name}: ${r.dispatch_policy} → ${policy}`);
  },

  async lead([slug, minutes]) {
    if (!slug || !minutes) throw new Error("usage: lead <slug> <minutes|clear>");
    const r = await findRestaurant(slug);
    const value = minutes === "clear" ? null : Number(minutes);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 120)) {
      throw new Error("minutes must be 0-120, or 'clear'");
    }
    await rest(`restaurants?id=eq.${r.id}`, {
      method: "PATCH",
      body: { rider_request_lead_minutes: value },
    });
    console.log(`${r.name}: lead override → ${value ?? "platform default"}`);
  },

  async due([orderNumber, minutesFromNow = "0"]) {
    if (!orderNumber) throw new Error("usage: due <orderNumber> [minutesFromNow]");
    const o = await findOrder(orderNumber);
    const at = new Date(Date.now() + Number(minutesFromNow) * 60_000).toISOString();
    await rest(`orders?id=eq.${o.id}`, {
      method: "PATCH",
      body: { rider_request_due_at: at, dispatch_state: o.dispatch_state ?? "pending" },
    });
    console.log(`#${o.order_number}: due at ${rel(at)}`);
    if (o.rider_requested_at) {
      console.log(
        "  NOTE: already requested — the latch will make the cron skip it.\n" +
          "        Run `reset` first if you want it to fire again."
      );
    }
  },

  async arm([orderNumber, prepMinutes]) {
    if (!orderNumber || !prepMinutes) throw new Error("usage: arm <orderNumber> <prepMinutes>");
    const o = await findOrder(orderNumber);
    const r = o.restaurants ?? {};

    const settings = await rest(
      "platform_settings?select=rider_request_lead_minutes,timed_rider_request_enabled&limit=1"
    );
    const lead =
      r.rider_request_lead_minutes ?? settings?.[0]?.rider_request_lead_minutes ?? 10;

    const readyAt = new Date(Date.now() + Number(prepMinutes) * 60_000);
    // Same rule as computeRiderRequestDueAt: never a moment in the past.
    const dueMs = Math.max(Date.now(), readyAt.getTime() - lead * 60_000);

    await rest(`orders?id=eq.${o.id}`, {
      method: "PATCH",
      body: {
        estimated_delivery_at: readyAt.toISOString(),
        rider_request_due_at:
          r.dispatch_policy === "platform" && o.fulfillment_type === "delivery"
            ? new Date(dueMs).toISOString()
            : null,
        dispatch_state: o.fulfillment_type === "delivery" ? "pending" : "not_required",
      },
    });

    console.log(`#${o.order_number}: ready in ${prepMinutes}m, lead ${lead}m`);
    console.log(`  ready at ${rel(readyAt.toISOString())}`);
    console.log(`  due at   ${rel(new Date(dueMs).toISOString())}`);
    if (r.dispatch_policy !== "platform") {
      console.log(`  policy is '${r.dispatch_policy}' — no timer armed (expected).`);
    }
    if (settings?.[0] && !settings[0].timed_rider_request_enabled) {
      console.log("  WARNING: timed_rider_request_enabled is OFF — the cron is a no-op.");
    }
  },

  async dry() {
    const result = await callCron({ dry_run: true });
    console.log(JSON.stringify(result, null, 2));
  },

  async tick([orderNumber]) {
    let body = {};
    if (orderNumber) {
      const o = await findOrder(orderNumber);
      body = { order_ids: [o.id] };
    }
    const result = await callCron(body);
    console.log(JSON.stringify(result, null, 2));
  },

  async reset([orderNumber, flag]) {
    if (!orderNumber) throw new Error("usage: reset <orderNumber> [--force]");
    const o = await findOrder(orderNumber);

    // This deletes ledger rows. On a real order that is destructive and hard to
    // undo, so the default is to only ever touch orders the test tooling made.
    const isTestOrder = String(o.order_number).startsWith("TEST-");
    const localDb = /localhost|127\.0\.0\.1/.test(SUPABASE_URL);
    if (!isTestOrder && !localDb && flag !== "--force") {
      throw new Error(
        `#${o.order_number} is not a TEST- order and this is not a local database.\n` +
          `  reset deletes wallet_transactions rows — refusing.\n` +
          `  Use a test order (Admin › Settings › Testing), or pass --force if you\n` +
          `  are certain.`
      );
    }

    await rest(`orders?id=eq.${o.id}`, {
      method: "PATCH",
      body: {
        rider_requested_at: null,
        rider_request_source: null,
        rider_request_due_at: null,
        rider_alert_sent_at: null,
        bolt_booking_claimed_at: null,
        bolt_autobook_stopped_at: null,
        dispatch_state: o.fulfillment_type === "delivery" ? "pending" : "not_required",
      },
    });

    // The split's ledger rows, so a re-run writes them cleanly rather than
    // short-circuiting on the existing logistics_fee row.
    //
    // ONLY the two rows commitDeliverySplit wrote. `order_credit` is shared with
    // the order's food revenue (written by the Paystack/Monnify webhooks and
    // /api/checkout/status), so it is matched on the delivery-share description
    // rather than by type — deleting by type alone would wipe the payment credit.
    await rest(`wallet_transactions?order_id=eq.${o.id}&type=eq.logistics_fee`, {
      method: "DELETE",
    });
    await rest(
      `wallet_transactions?order_id=eq.${o.id}&type=eq.order_credit` +
        `&description=like.Delivery%20share%20(*`,
      { method: "DELETE" }
    );
    await rest(`delivery_assignments?order_id=eq.${o.id}`, { method: "DELETE" });

    await rest("rpc/recompute_restaurant_wallet", {
      method: "POST",
      body: { p_restaurant_id: o.restaurant_id },
    });

    console.log(`#${o.order_number}: rider request reset (latches, split, assignment cleared)`);
  },

  async settings([toggle]) {
    if (toggle) {
      if (!["on", "off"].includes(toggle)) throw new Error("usage: settings [on|off]");
      await rest("platform_settings?id=not.is.null", {
        method: "PATCH",
        body: { timed_rider_request_enabled: toggle === "on" },
      });
    }
    const rows = await rest(
      "platform_settings?select=timed_rider_request_enabled,rider_request_lead_minutes," +
        "bolt_booking_enabled,bolt_booking_shadow,bolt_environment&limit=1"
    );
    const s = rows?.[0] ?? {};
    console.log("\nDispatch settings");
    console.log(`  timed requests   ${s.timed_rider_request_enabled ? "ON" : "OFF"}`);
    console.log(`  lead minutes     ${s.rider_request_lead_minutes}`);
    console.log(`  bolt booking     ${s.bolt_booking_enabled ? "ON" : "OFF"}`);
    console.log(`  bolt shadow      ${s.bolt_booking_shadow ? "ON (books nothing)" : "OFF"}`);
    console.log(`  bolt environment ${s.bolt_environment}\n`);
  },
};

/* ── main ────────────────────────────────────────────────────────────────── */

const [cmd, ...args] = process.argv.slice(2);

if (!cmd || !commands[cmd]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.startsWith("//"))
    .map((l) => l.replace(/^\/\/ ?/, ""))
    .join("\n"));
  process.exit(cmd ? 1 : 0);
}

commands[cmd](args).catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
