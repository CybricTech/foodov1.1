#!/usr/bin/env node
// Recompute every settlements row using the same per-order formula the UI shows.
// Usage:
//   DRY_RUN=1 node scripts/backfill-settlements.mjs   # print diffs only (default)
//   DRY_RUN=0 node scripts/backfill-settlements.mjs   # apply updates
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env.

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
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function fmtKobo(k) {
  return `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function deliveryCommissionFor(o, defaultPct) {
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
  console.log(`Using merchant_charge_pct=${merchantPct}, delivery_commission_pct=${deliveryPct}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "APPLY (will update DB)"}`);
  console.log();

  const settlements = await rest(
    "/settlements?select=id,period_date,restaurant_id,amount_kobo,gross_total_kobo,merchant_charge_total_kobo,delivery_commission_kobo,service_fee_total_kobo,order_count&order=period_date.desc"
  );
  console.log(`Found ${settlements.length} settlements`);
  console.log();

  const stats = { changed: 0, unchanged: 0, missingOrders: 0, deltaAmount: 0 };

  for (const s of settlements) {
    const orders = await rest(
      `/orders?settlement_id=eq.${s.id}&select=id,subtotal_kobo,vat_kobo,delivery_fee_kobo,service_fee_kobo,dispatch_type`
    );

    if (orders.length === 0) {
      stats.missingOrders++;
      console.log(`⚠️  ${s.id} (${s.period_date}) — no orders linked, skipping`);
      continue;
    }

    let gross = 0;
    let merchantCharge = 0;
    let deliveryCommission = 0;
    let serviceFee = 0;
    for (const o of orders) {
      const oGross = (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0);
      const oTotal = oGross + (o.service_fee_kobo ?? 0);
      gross += oGross;
      // Merchant charge is 1% of the full Paystack total (includes service fee
      // in the base, even though service fee itself goes to Foodo).
      merchantCharge += Math.round(oTotal * merchantPct);
      deliveryCommission += deliveryCommissionFor(o, deliveryPct);
      serviceFee += o.service_fee_kobo ?? 0;
    }
    const amount = gross - merchantCharge - deliveryCommission;

    const changed =
      amount !== s.amount_kobo ||
      gross !== s.gross_total_kobo ||
      merchantCharge !== s.merchant_charge_total_kobo ||
      deliveryCommission !== s.delivery_commission_kobo ||
      serviceFee !== (s.service_fee_total_kobo ?? 0) ||
      orders.length !== s.order_count;

    if (!changed) {
      stats.unchanged++;
      continue;
    }

    stats.changed++;
    stats.deltaAmount += amount - s.amount_kobo;

    console.log(`${s.period_date}  ${s.id}  (${orders.length} orders)`);
    if (amount !== s.amount_kobo)
      console.log(`  amount_kobo               ${fmtKobo(s.amount_kobo)} → ${fmtKobo(amount)}  (Δ ${fmtKobo(amount - s.amount_kobo)})`);
    if (gross !== s.gross_total_kobo)
      console.log(`  gross_total_kobo          ${fmtKobo(s.gross_total_kobo)} → ${fmtKobo(gross)}`);
    if (merchantCharge !== s.merchant_charge_total_kobo)
      console.log(`  merchant_charge_total_kobo ${fmtKobo(s.merchant_charge_total_kobo)} → ${fmtKobo(merchantCharge)}`);
    if (deliveryCommission !== s.delivery_commission_kobo)
      console.log(`  delivery_commission_kobo  ${fmtKobo(s.delivery_commission_kobo)} → ${fmtKobo(deliveryCommission)}`);
    if (serviceFee !== (s.service_fee_total_kobo ?? 0))
      console.log(`  service_fee_total_kobo    ${fmtKobo(s.service_fee_total_kobo ?? 0)} → ${fmtKobo(serviceFee)}`);
    if (orders.length !== s.order_count)
      console.log(`  order_count               ${s.order_count} → ${orders.length}`);

    if (!DRY_RUN) {
      await rest(`/settlements?id=eq.${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          amount_kobo: amount,
          gross_total_kobo: gross,
          merchant_charge_total_kobo: merchantCharge,
          delivery_commission_kobo: deliveryCommission,
          service_fee_total_kobo: serviceFee,
          order_count: orders.length,
        }),
      });
    }
  }

  console.log();
  console.log(`Summary:`);
  console.log(`  changed:        ${stats.changed}`);
  console.log(`  unchanged:      ${stats.unchanged}`);
  console.log(`  missing orders: ${stats.missingOrders}`);
  console.log(`  total amount delta: ${fmtKobo(stats.deltaAmount)}`);
  if (DRY_RUN) {
    console.log();
    console.log(`Dry run — re-run with DRY_RUN=0 to apply.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
