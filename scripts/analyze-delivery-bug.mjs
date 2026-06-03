#!/usr/bin/env node
// READ-ONLY. Traces the delivery-commission (flat-10%) overpayment: reconstructs
// the OLD buggy net the record route computed and decomposes the overpay into
// the discount bug vs the delivery bug, then checks it against actual cash paid.
import fs from "node:fs";

const envText = fs.readFileSync(new URL("../apps/web/.env", import.meta.url), "utf8");
const env = {};
for (const l of envText.split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").replace(/\\\$/g, "$"); }
const U = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: K, Authorization: `Bearer ${K}` };
const rest = async (p) => { const r = await fetch(`${U}/rest/v1${p}`, { headers: h }); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); };
async function restAll(p, n = 1000) { const out = []; for (let o = 0; ; o += n) { const pg = await rest(`${p}&limit=${n}&offset=${o}`); out.push(...pg); if (pg.length < n) break; } return out; }
const f = (k) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
const watDay = (iso) => new Date(new Date(iso).getTime() + 3600e3).toISOString().slice(0, 10);

const RID = "86eb5243-7a89-4271-b602-74ebec2f2840"; // DRIZZY'S
const MP = 0.01, DP = 0.10;
const logisticsDefault = (await rest(`/restaurants?id=eq.${RID}&select=logistics_default`))[0]?.logistics_default ?? null;

const settlements = await rest(`/settlements?restaurant_id=eq.${RID}&status=eq.paid&select=period_date,amount_kobo&order=period_date.asc`);
const orders = await restAll(`/orders?restaurant_id=eq.${RID}&status=neq.cancelled&status=neq.pending&select=created_at,subtotal_kobo,vat_kobo,delivery_fee_kobo,service_fee_kobo,total_kobo,discount_kobo,dispatch_type,fulfillment_type,settlement_id,delivery_assignments(dispatch_type)`);
for (const o of orders) {
  const a = Array.isArray(o.delivery_assignments) ? o.delivery_assignments : null;
  o.dispatch_type = o.dispatch_type ?? (a && a.length ? a[0].dispatch_type : null) ?? logisticsDefault ?? null;
}
const dispatchAwareCommission = (o) => { const fee = o.delivery_fee_kobo ?? 0; if (fee <= 0) return 0; if (o.dispatch_type === "platform_rider") return fee; if (o.dispatch_type === "own_rider" || o.dispatch_type === "third_party") return Math.round(fee * DP); return 0; };

// Three nets per order:
//  A = CORRECT  : post-discount total, dispatch-aware commission (the truth)
//  B = delivery-bug only : post-discount total, flat 10% on every delivery order
//  C = both bugs : pre-discount component total, flat 10%  (what the old route paid)
function nets(o) {
  const sub = o.subtotal_kobo ?? 0, vat = o.vat_kobo ?? 0, del = o.delivery_fee_kobo ?? 0, svc = o.service_fee_kobo ?? 0;
  const total = o.total_kobo ?? sub + vat + del + svc;
  const preTotal = sub + vat + del + svc; // pre-discount
  const flat10 = del > 0 ? Math.round(del * DP) : 0;
  const A = (total - svc) - Math.round(total * MP) - dispatchAwareCommission(o);
  const B = (total - svc) - Math.round(total * MP) - flat10;
  const C = (preTotal - svc) - Math.round(preTotal * MP) - flat10;
  return { A, B, C, del, isPlatform: o.dispatch_type === "platform_rider" && del > 0 };
}

const byDay = {};
for (const o of orders) (byDay[watDay(o.created_at)] ||= []).push(o);

let tCorrect = 0, tDeliv = 0, tDisc = 0, tBuggy = 0, tPaid = 0, tPlatFee = 0, tPlatOrders = 0;
console.log(`DRIZZY'S delivery-commission bug trace (logistics_default=${logisticsDefault})\n`);
console.log("day        | #ord | plat-rider Δfee(90%) | deliveryOver(B−A) | discountOver(C−B) | correct(A) | buggy(C) | paid     | paid−C");
console.log("-".repeat(125));
for (const s of settlements) {
  const os = byDay[s.period_date] ?? [];
  let A = 0, B = 0, C = 0, platFee = 0, platN = 0;
  for (const o of os) { const n = nets(o); A += n.A; B += n.B; C += n.C; if (n.isPlatform) { platFee += n.del; platN++; } }
  const deliveryOver = B - A, discountOver = C - B, buggyOver = C - A;
  tCorrect += A; tDeliv += deliveryOver; tDisc += discountOver; tBuggy += C; tPaid += s.amount_kobo; tPlatFee += platFee; tPlatOrders += platN;
  if (deliveryOver > 1 || discountOver > 1) {
    console.log(`${s.period_date} | ${String(os.length).padStart(4)} | ${f(Math.round(platFee*0.9)).padStart(20)} | ${f(deliveryOver).padStart(17)} | ${f(discountOver).padStart(17)} | ${f(A).padStart(10)} | ${f(C).padStart(8)} | ${f(s.amount_kobo).padStart(8)} | ${f(s.amount_kobo - C)}`);
  }
}
console.log("-".repeat(125));
console.log(`\nTotals over paid settlements:`);
console.log(`  Platform-rider orders billed wrong : ${tPlatOrders}  (their delivery fees: ${f(tPlatFee)})`);
console.log(`  Delivery-bug overpay  (B−A) = 90% of those fees : ${f(tDeliv)}`);
console.log(`  Discount-bug overpay  (C−B)                     : ${f(tDisc)}`);
console.log(`  Modeled total overpay (C−A)                     : ${f(tBuggy - tCorrect)}`);
console.log(`  Actual overpay (paid − correct A)               : ${f(tPaid - tCorrect)}`);
console.log(`  Residual (actual paid − reconstructed buggy C)  : ${f(tPaid - tBuggy)}  ← ~0 means the old-route model is exact`);
