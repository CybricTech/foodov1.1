# Testing dispatch on your laptop — step by step

Written to be followed without knowing the internals. Every step says what you
should see, so you know whether it worked.

---

## First, the one thing to understand

There are two separate "sandboxes" and only one of them exists.

**The Bolt sandbox is real and it protects your money.** It's a fake copy of Bolt
that behaves identically but books no real rides, involves no real drivers, and
costs nothing. You drive it by hand: you tell it "now the driver has accepted",
"now he's arrived", and it plays along.

**There is no database sandbox.** Bolt being in sandbox mode does not make your
data fake. `apps/web/.env` points at your live Supabase, so a test order is a
real row in your real orders table.

That is fine, and it's what you already do — the "Send test order to CopperPot"
button has always created a fake order in the live database. Just know that's
what's happening, and stick to the test merchant.

**Rule of thumb: only ever touch orders whose number starts with `TEST-`.**

---

## Step 1 — Apply the two new migrations

The code expects database columns that don't exist yet. Nothing works until
these are applied.

Open Supabase → SQL Editor, and run the contents of these two files, in order:

1. `supabase/migrations/101_dispatch_policy.sql`
2. `supabase/migrations/102_rider_request_cron.sql`

**What you should see:** no errors. 102 may print a warning that it wasn't
scheduled because some settings aren't set — **that's fine and expected**. You
don't need the automatic every-minute timer for testing, because you'll be
firing it by hand.

**Nothing changes for anyone when you do this.** Every merchant is set to
"hybrid", which is exactly what they do today, and the new timer ships switched
off. Your merchants will not notice.

---

## Step 2 — Create a Bolt sandbox

One command, once:

```bash
node scripts/bolt-sandbox.mjs create
```

It prints a UUID. Copy it into `apps/web/.env` as a new line:

```
BOLT_SANDBOX_UUID=the-uuid-it-printed
```

**If it fails:** your `BOLT_CLIENT_ID` / `BOLT_CLIENT_SECRET` are wrong or
expired. Everything else in this guide still works — you'll just be testing the
Telegram half rather than the automatic-booking half.

---

## Step 3 — Start the app

```bash
npm run dev
```

Leave it running. Open <http://localhost:3000/admin/settings>.

---

## Step 4 — Set the switches

On that Settings page, find the new **Dispatch** section:

| Setting | Set it to | Why |
|---|---|---|
| Request riders on a timer | **ON** | this is the thing you're testing |
| Lead time | **10** | leave it |
| Automated Bolt booking | **ON** | so it books instead of pestering Telegram |
| Shadow mode | **OFF** | shadow books nothing, so nothing would happen |
| Bolt environment | **Sandbox** | fake rides, no money — the important one |

**Check "Bolt environment" says Sandbox before you turn shadow mode off.** That
one field is the difference between a pretend ride and a real one.

There's no red warning line showing? Good — the warning only appears when the
combination would spend real money.

---

## Step 5 — Put the test merchant on the Platform lane

```bash
node scripts/dispatch-sim.mjs policy the-copper-pot platform
```

**You should see:** `The Copper Pot: hybrid → platform`

(If it says no restaurant found, run `node scripts/dispatch-sim.mjs` on its own
to see the commands, and check the slug in your admin panel.)

---

## Step 6 — Make a test delivery order

On the admin Settings page, in the **Testing** box, click
**"Send test DELIVERY order"**.

**You should see:** `✅ Sent delivery order TEST-123456 to The Copper Pot`.
Write that order number down — call it `TEST-123456` below.

You may get a warning that the store's address isn't confirmed. If so, Bolt
booking will fall back to a Telegram note instead of booking. To test the
booking properly, set The Copper Pot's address in its Settings first.

---

## Step 7 — Accept it as the merchant would

Go to the merchant dashboard orders page and accept the order, saying it'll take
35 minutes. Or skip the clicking and do it directly:

```bash
node scripts/dispatch-sim.mjs arm TEST-123456 35
```

**You should see** the food is ready in ~35 minutes and the rider is due in ~25
— i.e. ten minutes before the food. That gap is the entire feature.

---

## Step 8 — Check what would happen, without doing it

```bash
node scripts/dispatch-sim.mjs dry
```

This asks "what would you request right now?" and touches nothing. Since the
order isn't due for another 25 minutes, it should list **nothing**. That's
correct — it proves the timer isn't firing early.

---

## Step 9 — Jump the countdown forward

This is the point of the tooling. Rather than waiting 25 minutes:

```bash
node scripts/dispatch-sim.mjs due TEST-123456
```

**You should see:** `due at … (in 0s)`.

Now run `dry` again — this time the order **should** appear in `would_request`.
Still nothing has actually happened.

---

## Step 10 — Fire it for real

```bash
node scripts/dispatch-sim.mjs tick TEST-123456
```

**You should see:** `"requested": 1`.

Then:

```bash
node scripts/dispatch-sim.mjs status TEST-123456
```

**This is the moment of truth.** Look at the two blocks:

```
  FOOD
    status        confirmed        ← still cooking
  RIDER
    dispatch_state requested       ← already getting a rider
    triggered by   cron:due
  BOLT RIDES
    #1 SEARCHING ride=12345
```

Food still cooking, rider already being found. **That is the whole redesign in
four lines.** Before this change those two could not disagree.

---

## Step 11 — Walk the ride through its life

Use the ride number from the last step:

```bash
node scripts/bolt-sandbox.mjs state 12345 DRIVER_ON_ROUTE_TO_CLIENT
node scripts/bolt-sandbox.mjs state 12345 ARRIVED_AT_CLIENT
node scripts/bolt-sandbox.mjs state 12345 DRIVING_WITH_CLIENT
node scripts/bolt-sandbox.mjs state 12345 COMPLETED
```

After each one, run `status` again and watch the RIDER block move while the FOOD
block stays put — until `DRIVING_WITH_CLIENT`, where the rider physically has
the food and the order finally becomes "on the way".

> **Confusingly named:** in Bolt's wording "client" means the **pickup point** —
> the restaurant, not your customer. So `ARRIVED_AT_CLIENT` means the rider is at
> the kitchen, and `DRIVING_WITH_CLIENT` means he's left with the food.

Sandbox state changes may not reach your laptop (Bolt can't call localhost). If
`status` doesn't update, nudge it:

```bash
curl -X POST http://localhost:3000/api/cron/reconcile-bolt-rides \
  -H "Authorization: Bearer $(grep SUPABASE_SERVICE_ROLE_KEY apps/web/.env | cut -d= -f2-)"
```

That's the safety net that catches missed notifications in production too, so
it's worth seeing it work.

---

## Step 12 — Try it again

```bash
node scripts/dispatch-sim.mjs reset TEST-123456
```

Puts the order back to un-requested so you can run it again. It refuses to touch
anything that isn't a `TEST-` order, because it deletes ledger rows.

---

## The other things worth checking

**The merchant keeps working while the rider comes.** With a test order sitting
at `dispatch_state = requested`, open the merchant orders page. You should still
see the **Mark Ready** button, and a purple note saying *"Carry on cooking —
we're getting a rider to you for when it's ready."* If Mark Ready has vanished,
that's a bug — tell me.

**Early ready.** Reset the order, arm it for 35 minutes, then click Mark Ready
straight away in the dashboard. The rider should be requested immediately, and
`status` should show `triggered by ready:platform`. Then run `tick` — it should
report `skipped`, not a second request. **One rider, never two.**

**In-house merchants.** `dispatch-sim policy the-copper-pot in_house`, then make
a new test delivery order. The merchant should get **no** "who delivers this?"
question at all, and no rider is ever requested.

**Hybrid is unchanged.** `dispatch-sim policy the-copper-pot hybrid` — the
two-button picker comes back exactly as it is today. This is the important one:
it's what every merchant is set to right now.

---

## Turning it all off

```bash
node scripts/dispatch-sim.mjs settings off
node scripts/dispatch-sim.mjs policy the-copper-pot hybrid
```

That returns everything to pre-change behaviour. The `settings off` switch is
the kill switch — it works platform-wide, instantly, no deploy needed.

---

## If something looks wrong

`node scripts/dispatch-sim.mjs settings` prints every switch at once. Nine times
out of ten the answer is in there:

- timed requests **OFF** → the timer does nothing, by design
- shadow **ON** → it works out what it would book and books nothing
- bolt booking **OFF** → the request goes to Telegram instead of the API

And `node scripts/dispatch-sim.mjs status TEST-123456` shows one order's whole
story: policy, food, rider, which trigger fired, and every ride attempted.
