#!/usr/bin/env node
// READ-ONLY (DB) reconciliation generator. Pulls every merchant's recorded
// settlements + orders, recomputes the canonical post-discount net live, and
// writes docs/settlement-reconciliation.md. No DB writes.
//
//   node scripts/generate-reconciliation.mjs
import fs from "node:fs";

const envText = fs.readFileSync(new URL("../apps/web/.env", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").replace(/\\\$/g, "$");
}
const URL_ = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("Missing SUPABASE_URL / SERVICE_ROLE_KEY in apps/web/.env"); process.exit(1); }
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(path) {
  const res = await fetch(`${URL_}/rest/v1${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
// Paginate past PostgREST's 1000-row ceiling.
async function restAll(pathNoRange, pageSize = 1000) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await rest(`${pathNoRange}&limit=${pageSize}&offset=${offset}`);
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

const f = (k) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const watDay = (iso) => new Date(new Date(iso).getTime() + 3600_000).toISOString().slice(0, 10);

const settings = (await rest(`/platform_settings?select=merchant_charge_pct,delivery_commission_pct&limit=1`))[0] ?? {};
const MP = settings.merchant_charge_pct ?? 0.01;
const DP = settings.delivery_commission_pct ?? 0.1;

function deliveryCommission(o) {
  const fee = o.delivery_fee_kobo ?? 0;
  if (fee <= 0) return 0;
  if (o.dispatch_type === "platform_rider") return fee;
  if (o.dispatch_type === "own_rider" || o.dispatch_type === "third_party") return Math.round(fee * DP);
  return 0;
}
// Canonical net — settled off total_kobo (post-discount), dispatch-aware commission.
function correctNet(o) {
  const sub = o.subtotal_kobo ?? 0, vat = o.vat_kobo ?? 0, del = o.delivery_fee_kobo ?? 0, svc = o.service_fee_kobo ?? 0;
  const total = o.total_kobo ?? sub + vat + del + svc;
  return total - svc - Math.round(total * MP) - deliveryCommission(o);
}

const restaurants = await rest(`/restaurants?select=id,name,logistics_default&order=name.asc`);
const logisticsByRest = new Map(restaurants.map((r) => [r.id, r.logistics_default ?? null]));
const settlements = await restAll(
  `/settlements?status=eq.paid&select=restaurant_id,period_date,amount_kobo,canonical_net_kobo,order_count`
);
const orders = await restAll(
  `/orders?status=neq.cancelled&status=neq.pending&select=restaurant_id,created_at,subtotal_kobo,vat_kobo,delivery_fee_kobo,service_fee_kobo,total_kobo,discount_kobo,dispatch_type,settlement_id,delivery_assignments(dispatch_type)&order=created_at.asc`
);

// Canonical dispatch-type resolution (mirrors @foodo/utils resolveDispatchType +
// the settlement pages): orders.dispatch_type → delivery_assignments → the
// restaurant's logistics_default → null. Mutate each order in place so the rest
// of the script reads the resolved value.
for (const o of orders) {
  const asg = Array.isArray(o.delivery_assignments) ? o.delivery_assignments : null;
  o.dispatch_type =
    o.dispatch_type ??
    (asg && asg.length > 0 ? asg[0].dispatch_type : null) ??
    logisticsByRest.get(o.restaurant_id) ??
    null;
}

// Index orders by restaurant → WAT day.
const ordByRestDay = new Map();
const pendingByRest = new Map();
for (const o of orders) {
  const r = o.restaurant_id;
  if (!o.settlement_id) pendingByRest.set(r, (pendingByRest.get(r) ?? 0) + correctNet(o));
  let dm = ordByRestDay.get(r);
  if (!dm) { dm = new Map(); ordByRestDay.set(r, dm); }
  const d = watDay(o.created_at);
  (dm.get(d) ?? dm.set(d, []).get(d)).push(o);
}

const nameById = new Map(restaurants.map((r) => [r.id, r.name]));
const settByRest = new Map();
for (const s of settlements) {
  let arr = settByRest.get(s.restaurant_id);
  if (!arr) { arr = []; settByRest.set(s.restaurant_id, arr); }
  arr.push(s);
}

const rows = [];
const perDayOverpaid = []; // detail rows for overpaid days
let T = { paid: 0, correct: 0, delta: 0, disc: 0, deliv: 0, pending: 0, count: 0 };

for (const [rid, setts] of settByRest) {
  const dayMap = ordByRestDay.get(rid) ?? new Map();
  let paid = 0, correct = 0, discountOver = 0;
  for (const s of setts) {
    const dayOrders = dayMap.get(s.period_date) ?? [];
    const dayCorrect = dayOrders.reduce((a, o) => a + correctNet(o), 0);
    const dayDiscount = dayOrders.reduce((a, o) => a + (o.discount_kobo ?? 0), 0);
    const over = s.amount_kobo - dayCorrect;
    paid += s.amount_kobo;
    correct += dayCorrect;
    // Discount-attributable slice of the overpay (bounded by the day's discount).
    if (over > 1 && dayDiscount > 0) discountOver += Math.min(over, dayDiscount);
    if (over > 1) {
      perDayOverpaid.push({
        name: nameById.get(rid) ?? rid, date: s.period_date, orders: dayOrders.length,
        paid: s.amount_kobo, correct: dayCorrect, over, discount: dayDiscount,
      });
    }
  }
  const delta = paid - correct;
  const deliveryOther = delta - discountOver;
  const pending = pendingByRest.get(rid) ?? 0;
  rows.push({
    name: nameById.get(rid) ?? rid, count: setts.length, paid, correct, delta,
    discountOver, deliveryOther, pending,
  });
  T.paid += paid; T.correct += correct; T.delta += delta;
  T.disc += discountOver; T.deliv += deliveryOther; T.pending += pending; T.count += setts.length;
}

rows.sort((a, b) => b.delta - a.delta);
perDayOverpaid.sort((a, b) => (a.name === b.name ? a.date.localeCompare(b.date) : a.name.localeCompare(b.name)));

const today = new Date().toISOString().slice(0, 10);
let md = `# Settlement Reconciliation Report

_Generated ${today} from **live data** · merchant charge ${(MP * 100).toFixed(2)}%, delivery commission ${(DP * 100).toFixed(0)}%_

**Correct net** is recomputed live off \`total_kobo\` (what the customer actually paid, **post-discount**) minus Foodo fees, using the canonical formula in \`@foodo/utils\`. A payout can never exceed money collected; merchant-funded discounts are borne by the merchant. \`amount_kobo\` is the cash that actually left the bank.

> ⚠️ This supersedes the frozen \`settlements.canonical_net_kobo\` column, which was backfilled at the buggy figure for some discount days (e.g. DRIZZY'S 31 May & 1 Jun were frozen equal to the paid amount, hiding the overpay). The numbers below are recomputed from current orders.

**Delta = Paid − Correct** (positive = overpaid). Overpayment has two root causes: the **discount bug** (settled off the pre-discount subtotal) and the **delivery-commission bug** (flat 10% applied to platform-rider orders that should have been 100%).

| Merchant | Paid settlements | Total Paid | Correct (live) | Delta (overpaid) | ├ Discount | └ Delivery/other | Current pending |
|---|--:|--:|--:|--:|--:|--:|--:|
`;
for (const r of rows) {
  md += `| ${r.name} | ${r.count} | ${f(r.paid)} | ${f(r.correct)} | ${r.delta >= 0 ? "+" : ""}${f(r.delta)} | ${f(r.discountOver)} | ${f(r.deliveryOther)} | ${f(r.pending)} |\n`;
}
md += `| **TOTAL** | ${T.count} | **${f(T.paid)}** | **${f(T.correct)}** | **${T.delta >= 0 ? "+" : ""}${f(T.delta)}** | **${f(T.disc)}** | **${f(T.deliv)}** | **${f(T.pending)}** |\n`;

md += `\n## Overpaid days (detail)\n\nEvery settled day where cash out exceeded the correct net.\n\n| Merchant | Day (orders made) | Orders | Paid | Correct | Overpaid | Discount that day |\n|---|---|--:|--:|--:|--:|--:|\n`;
for (const d of perDayOverpaid) {
  md += `| ${d.name} | ${d.date} | ${d.orders} | ${f(d.paid)} | ${f(d.correct)} | +${f(d.over)} | ${d.discount > 0 ? f(d.discount) : "—"} |\n`;
}

md += `\n---\n_Source: read-only query of production via scripts/generate-reconciliation.mjs. Orders pulled: ${orders.length}; paid settlements: ${settlements.length}._\n`;

fs.writeFileSync(new URL("../docs/settlement-reconciliation.md", import.meta.url), md);
console.log(md);
console.error(`\n✔ wrote docs/settlement-reconciliation.md  (orders=${orders.length}, settlements=${settlements.length})`);
