#!/usr/bin/env node
// Backfill ONLY rows that are genuinely stale because dispatch_type was
// changed after the wallet rows were written:
//
//   - logistics_fee:                 100% of delivery for platform_rider
//                                    10% for own_rider/third_party
//                                    0 otherwise
//   - order_credit "delivery share": delivery − logistics_fee
//                                    (= 0 for platform_rider/pickup; 90% for own/third)
//
// merchant_charge (1% × total) and initial order_credit (subtotal + VAT − merchant_charge)
// are LEFT ALONE — they were correct when written and the formula hasn't changed.
//
// Usage:
//   DRY_RUN=1 node scripts/backfill-wallet-transactions.mjs   # default
//   DRY_RUN=0 node scripts/backfill-wallet-transactions.mjs

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN !== "0";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function rest(path, init) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function fmtKobo(k) {
  return `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function logisticsFor(o, defaultPct) {
  const fee = o.delivery_fee_kobo ?? 0;
  if (fee === 0) return 0;
  if (o.dispatch_type === "platform_rider") return fee;
  if (o.dispatch_type === "own_rider" || o.dispatch_type === "third_party") {
    return Math.round(fee * defaultPct);
  }
  return 0;
}

async function main() {
  const [settings] = await rest("/platform_settings?select=merchant_charge_pct,delivery_commission_pct");
  const merchantPct = Number(settings?.merchant_charge_pct ?? 0.01);
  const deliveryPct = Number(settings?.delivery_commission_pct ?? 0.1);
  console.log(`merchant_charge_pct=${merchantPct}, delivery_commission_pct=${deliveryPct}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log();

  // Pull every wallet_transaction with its joined order in one shot
  const txns = await rest(
    "/wallet_transactions?select=id,order_id,type,direction,amount_kobo,description," +
      "orders(order_number,subtotal_kobo,vat_kobo,delivery_fee_kobo,service_fee_kobo,total_kobo,dispatch_type)" +
      "&order=created_at.asc&limit=10000"
  );
  console.log(`Found ${txns.length} wallet_transactions rows`);

  // Group by order_id so we can keep track of which order_credit row is the
  // "initial" one vs the "delivery share" one.
  const byOrder = new Map();
  for (const t of txns) {
    if (!t.order_id || !t.orders) continue;
    if (!byOrder.has(t.order_id)) byOrder.set(t.order_id, []);
    byOrder.get(t.order_id).push(t);
  }
  console.log(`Spanning ${byOrder.size} orders`);
  console.log();

  const stats = { changed: 0, unchanged: 0 };
  const updates = []; // { id, amount_kobo, description, before }

  for (const [, rows] of byOrder) {
    const o = rows[0].orders;
    const logisticsCorrect = logisticsFor(o, deliveryPct);
    const merchantDeliveryShare = (o.delivery_fee_kobo ?? 0) - logisticsCorrect;

    for (const t of rows) {
      let nextAmount = t.amount_kobo;
      let nextDescription = t.description;

      if (t.type === "logistics_fee" && t.direction === "debit") {
        nextAmount = logisticsCorrect;
        if (o.dispatch_type === "platform_rider") {
          nextDescription = `Delivery fee (platform rider, 100%) — Order #${o.order_number}`;
        } else if (o.dispatch_type === "own_rider" || o.dispatch_type === "third_party") {
          nextDescription =
            `Delivery commission (${(deliveryPct * 100).toFixed(0)}%, ${o.dispatch_type}) — Order #${o.order_number}`;
        } else {
          nextDescription = `Delivery fee — Order #${o.order_number} (no dispatch)`;
        }
      } else if (t.type === "order_credit" && t.direction === "credit") {
        // Only touch the delivery-share row, identified by its description.
        // Leave the initial "net revenue" credit alone — it was computed from
        // the merchant_charge that was correct at the time of writing.
        const isDeliveryShare = (t.description || "").toLowerCase().includes("delivery share");
        if (!isDeliveryShare) continue;
        nextAmount = merchantDeliveryShare;
        nextDescription =
          o.dispatch_type === "platform_rider"
            ? `Delivery share (platform rider, 0%) — Order #${o.order_number}`
            : `Delivery share (${o.dispatch_type ?? "n/a"}) — Order #${o.order_number}`;
      } else {
        continue;
      }

      if (nextAmount !== t.amount_kobo || nextDescription !== t.description) {
        updates.push({
          id: t.id,
          before: { amount_kobo: t.amount_kobo, description: t.description, type: t.type },
          after: { amount_kobo: nextAmount, description: nextDescription },
          orderNumber: o.order_number,
        });
        stats.changed++;
      } else {
        stats.unchanged++;
      }
    }
  }

  // Print first 30 updates as a sample diff
  console.log(`Sample diffs (showing up to 30 of ${updates.length}):`);
  for (const u of updates.slice(0, 30)) {
    console.log(
      `  ${u.orderNumber}  ${u.before.type}  ` +
        `${fmtKobo(u.before.amount_kobo)} → ${fmtKobo(u.after.amount_kobo)}`
    );
  }

  console.log();
  console.log(`Summary:`);
  console.log(`  rows to change: ${stats.changed}`);
  console.log(`  rows unchanged: ${stats.unchanged}`);

  if (DRY_RUN) {
    console.log(`\nDry run — re-run with DRY_RUN=0 to apply.`);
    return;
  }

  console.log(`\nApplying ${updates.length} updates…`);
  let applied = 0;
  for (const u of updates) {
    await rest(`/wallet_transactions?id=eq.${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        amount_kobo: u.after.amount_kobo,
        description: u.after.description,
      }),
    });
    applied++;
    if (applied % 50 === 0) console.log(`  ${applied}/${updates.length}…`);
  }
  console.log(`Applied ${applied} updates.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
