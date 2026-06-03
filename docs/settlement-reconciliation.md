# Settlement Reconciliation Report

_Generated 2026-06-03 from **live data** · merchant charge 1.00%, delivery commission 10%_

**Correct net** is recomputed live off `total_kobo` (what the customer actually paid, **post-discount**) minus Foodo fees, using the canonical formula in `@foodo/utils`. A payout can never exceed money collected; merchant-funded discounts are borne by the merchant. `amount_kobo` is the cash that actually left the bank.

> ⚠️ This supersedes the frozen `settlements.canonical_net_kobo` column, which was backfilled at the buggy figure for some discount days (e.g. DRIZZY'S 31 May & 1 Jun were frozen equal to the paid amount, hiding the overpay). The numbers below are recomputed from current orders.

**Delta = Paid − Correct** (positive = overpaid). Overpayment has two root causes: the **discount bug** (settled off the pre-discount subtotal) and the **delivery-commission bug** (flat 10% applied to platform-rider orders that should have been 100%).

| Merchant | Paid settlements | Total Paid | Correct (live) | Delta (overpaid) | ├ Discount | └ Delivery/other | Current pending |
|---|--:|--:|--:|--:|--:|--:|--:|
| DRIZZY'S | 30 | ₦3,463,990.93 | ₦3,343,898.77 | +₦120,092.16 | ₦33,780.00 | ₦86,312.16 | ₦100,156.08 |
| By Sophie's Confectionary | 11 | ₦435,139.45 | ₦425,648.40 | +₦9,491.05 | ₦0.00 | ₦9,491.05 | ₦293,436.29 |
| The Copper Pot | 4 | ₦21,459.25 | ₦21,459.25 | +₦0.00 | ₦0.00 | ₦0.00 | ₦7,840.53 |
| MATCHA STREET | 4 | ₦224,035.10 | ₦224,035.10 | +₦0.00 | ₦0.00 | ₦0.00 | ₦0.00 |
| **TOTAL** | 49 | **₦4,144,624.73** | **₦4,015,041.52** | **+₦129,583.21** | **₦33,780.00** | **₦95,803.21** | **₦401,432.90** |

## Overpaid days (detail)

Every settled day where cash out exceeded the correct net.

| Merchant | Day (orders made) | Orders | Paid | Correct | Overpaid | Discount that day |
|---|---|--:|--:|--:|--:|--:|
| By Sophie's Confectionary | 2026-05-15 | 2 | ₦33,055.54 | ₦26,652.15 | +₦6,403.39 | — |
| By Sophie's Confectionary | 2026-05-18 | 2 | ₦23,837.24 | ₦20,749.59 | +₦3,087.65 | — |
| DRIZZY'S | 2026-04-13 | 6 | ₦61,537.60 | ₦59,729.18 | +₦1,808.42 | — |
| DRIZZY'S | 2026-04-14 | 8 | ₦139,518.10 | ₦138,054.78 | +₦1,463.32 | — |
| DRIZZY'S | 2026-04-15 | 13 | ₦178,454.37 | ₦176,045.57 | +₦2,408.80 | — |
| DRIZZY'S | 2026-04-16 | 6 | ₦94,060.90 | ₦91,277.21 | +₦2,783.69 | — |
| DRIZZY'S | 2026-04-17 | 8 | ₦169,344.88 | ₦167,878.41 | +₦1,466.47 | — |
| DRIZZY'S | 2026-04-20 | 6 | ₦85,646.21 | ₦83,981.13 | +₦1,665.08 | — |
| DRIZZY'S | 2026-04-21 | 9 | ₦172,976.05 | ₦170,465.34 | +₦2,510.71 | — |
| DRIZZY'S | 2026-04-22 | 6 | ₦119,032.13 | ₦118,542.00 | +₦490.13 | — |
| DRIZZY'S | 2026-04-23 | 9 | ₦164,597.36 | ₦162,750.36 | +₦1,847.00 | — |
| DRIZZY'S | 2026-04-24 | 8 | ₦82,579.16 | ₦81,599.74 | +₦979.42 | — |
| DRIZZY'S | 2026-04-25 | 8 | ₦214,560.27 | ₦212,718.98 | +₦1,841.29 | — |
| DRIZZY'S | 2026-04-26 | 2 | ₦21,875.15 | ₦21,170.13 | +₦705.02 | — |
| DRIZZY'S | 2026-04-27 | 8 | ₦115,869.19 | ₦115,058.42 | +₦810.77 | — |
| DRIZZY'S | 2026-05-07 | 10 | ₦208,492.55 | ₦191,990.96 | +₦16,501.59 | — |
| DRIZZY'S | 2026-05-08 | 6 | ₦146,019.49 | ₦143,917.94 | +₦2,101.55 | — |
| DRIZZY'S | 2026-05-09 | 9 | ₦186,159.11 | ₦176,513.35 | +₦9,645.76 | — |
| DRIZZY'S | 2026-05-14 | 5 | ₦88,541.37 | ₦85,805.86 | +₦2,735.51 | — |
| DRIZZY'S | 2026-05-15 | 10 | ₦150,969.72 | ₦130,238.03 | +₦20,731.69 | — |
| DRIZZY'S | 2026-05-16 | 5 | ₦50,431.82 | ₦46,138.82 | +₦4,293.00 | — |
| DRIZZY'S | 2026-05-17 | 6 | ₦110,676.96 | ₦101,154.06 | +₦9,522.90 | — |
| DRIZZY'S | 2026-05-31 | 9 | ₦137,375.27 | ₦118,155.27 | +₦19,220.00 | ₦19,220.00 |
| DRIZZY'S | 2026-06-01 | 11 | ₦180,440.84 | ₦165,880.82 | +₦14,560.02 | ₦14,560.00 |

---
_Source: read-only query of production via scripts/generate-reconciliation.mjs. Orders pulled: 295; paid settlements: 49._
