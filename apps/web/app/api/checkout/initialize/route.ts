import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveDiscount } from "@/lib/discounts";
import { createTestOrder } from "@/lib/checkout/create-test-order";
import { getPostHogClient } from "@/lib/posthog";
import {
  DELIVERY_BASE_FEE_KOBO,
  DELIVERY_PER_KM_RATE_KOBO,
  DELIVERY_MAX_RADIUS_KM,
  DELIVERY_MAX_FEE_KOBO,
  roundDeliveryFeeKobo,
  computeLoyaltyRewardKobo,
} from "@foodo/utils";

type DayHours = { enabled: boolean; open: string; close: string };
type OpeningHours = Record<string, DayHours>;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function isWithinOpeningHours(hours: OpeningHours): boolean {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  const day = hours[DAY_KEYS[now.getDay()]];
  if (!day?.enabled) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = day.open.split(":").map(Number);
  const [ch, cm] = day.close.split(":").map(Number);
  const open = oh * 60 + om;
  const close = ch * 60 + cm;
  return close <= open ? cur >= open || cur < close : cur >= open && cur < close;
}

const InitializeSchema = z.object({
  restaurantId: z.string().uuid(),
  customerName: z.string().min(2).max(100),
  customerPhone: z.string().min(10).max(20),
  customerEmail: z.string().email().optional().or(z.literal("")),
  fulfillmentType: z.enum(["delivery", "pickup"]),
  deliveryAddress: z.string().optional(),
  deliveryBaseAddress: z.string().optional(),
  /** Google place_id of the picked autocomplete prediction (exact destination). */
  deliveryPlaceId: z.string().max(300).optional(),
  /** Exact destination coordinates (resolved suggestion or device GPS). */
  deliveryLat: z.number().min(-90).max(90).optional(),
  deliveryLng: z.number().min(-180).max(180).optional(),
  specialInstructions: z.string().max(500).optional(),
  deliveryFeeKobo: z.number().int().min(0).optional(),
  deliveryDistanceKm: z.number().min(0).optional(),
  discountCode: z.string().trim().max(40).optional(),
  items: z.array(
    z.object({
      menuItemId: z.string().uuid(),
      name: z.string(),
      priceKobo: z.number().int().positive(),
      quantity: z.number().int().positive(),
      selectedOptions: z.array(
        z.object({
          optionId: z.string(),
          optionName: z.string(),
          choices: z.array(
            z.object({
              choiceId: z.string(),
              choiceName: z.string(),
              priceModifierKobo: z.number().int(),
              quantity: z.number().int().min(1).optional().default(1),
            })
          ),
        })
      ),
    })
  ),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = InitializeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const supabase = createServiceClient();

  // Verify restaurant exists and accepts orders
  const { data: restaurant, error: restError } = await supabase
    .from("restaurants")
    .select("id, name, accepts_orders, min_order_amount, delivery_fee, is_test")
    .eq("id", data.restaurantId)
    .eq("is_active", true)
    .single();

  // Fetch vat_percentage + opening_hours separately (columns added after type generation)
  const { data: extraRow } = await supabase
    .from("restaurants")
    .select("vat_percentage, opening_hours")
    .eq("id", data.restaurantId)
    .single();
  const vatPercentageRaw = extraRow ? (extraRow as unknown as Record<string, unknown>)["vat_percentage"] : null;
  const openingHoursRaw = extraRow ? (extraRow as unknown as Record<string, unknown>)["opening_hours"] : null;

  if (restError || !restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  if (!restaurant.accepts_orders) {
    return NextResponse.json(
      { error: "This restaurant is currently closed" },
      { status: 409 }
    );
  }

  // If the restaurant has operating hours configured, enforce them server-side
  if (openingHoursRaw && typeof openingHoursRaw === "object" && Object.keys(openingHoursRaw).length > 0) {
    if (!isWithinOpeningHours(openingHoursRaw as OpeningHours)) {
      return NextResponse.json(
        { error: "This restaurant is currently closed" },
        { status: 409 }
      );
    }
  }

  // ── Server-side price verification ─────────────────────────────────────────
  // Fetch base prices from DB — never trust client-submitted priceKobo
  const menuItemIds = data.items.map((i) => i.menuItemId);

  const { data: menuItems } = await supabase
    .from("menu_items")
    .select("id, price_kobo, is_available")
    .in("id", menuItemIds);

  const menuItemPriceMap = new Map(
    (menuItems ?? []).map((m) => [m.id, m.price_kobo])
  );
  const menuItemAvailableMap = new Map(
    (menuItems ?? []).map((m) => [m.id, m.is_available])
  );

  // Validate every submitted item still exists AND is switched on. Carts persist
  // in localStorage indefinitely, so a customer can reach checkout with an item a
  // merchant has since marked unavailable — this is the last server-side gate
  // before payment, so availability MUST be enforced here, not just hidden on the
  // storefront. Collect every offending line so the client can flag them precisely.
  const unavailable: { menuItemId: string; name: string }[] = [];
  for (const item of data.items) {
    if (
      !menuItemPriceMap.has(item.menuItemId) ||
      menuItemAvailableMap.get(item.menuItemId) === false
    ) {
      unavailable.push({ menuItemId: item.menuItemId, name: item.name });
    }
  }
  if (unavailable.length > 0) {
    const names = unavailable.map((u) => u.name).join(", ");
    return NextResponse.json(
      {
        error: `No longer available: ${names}. Please remove ${
          unavailable.length > 1 ? "these items" : "this item"
        } and try again.`,
        unavailableItemIds: unavailable.map((u) => u.menuItemId),
      },
      { status: 409 }
    );
  }

  // Fetch all choice modifier prices from DB
  const allChoiceIds: string[] = [];
  data.items.forEach((item) => {
    item.selectedOptions?.forEach((opt) => {
      opt.choices?.forEach((choice) => {
        if (choice.choiceId) allChoiceIds.push(choice.choiceId);
      });
    });
  });

  let choicePriceMap = new Map<string, number>();

  if (allChoiceIds.length > 0) {
    const { data: choices } = await supabase
      .from("menu_item_option_choices")
      .select("id, price_modifier_kobo, is_available")
      .in("id", allChoiceIds);

    choicePriceMap = new Map(
      (choices ?? []).map((c) => [c.id, c.price_modifier_kobo ?? 0])
    );

    // A selected option (e.g. a size/extra) can also be switched off. Reject the
    // order if any chosen modifier no longer exists or is unavailable.
    const choiceAvailableMap = new Map(
      (choices ?? []).map((c) => [c.id, c.is_available])
    );
    const unavailableChoices: string[] = [];
    data.items.forEach((item) => {
      item.selectedOptions?.forEach((opt) => {
        opt.choices?.forEach((choice) => {
          if (
            !choiceAvailableMap.has(choice.choiceId) ||
            choiceAvailableMap.get(choice.choiceId) === false
          ) {
            unavailableChoices.push(choice.choiceName);
          }
        });
      });
    });
    if (unavailableChoices.length > 0) {
      return NextResponse.json(
        {
          error: `No longer available: ${unavailableChoices.join(
            ", "
          )}. Please update your cart and try again.`,
        },
        { status: 409 }
      );
    }
  }

  // Recompute each item's true unit price from DB — client priceKobo is ignored
  let subtotalKobo = 0;
  const verifiedItems = data.items.map((item) => {
    const basePrice = menuItemPriceMap.get(item.menuItemId) ?? 0;

    let modifierTotal = 0;
    item.selectedOptions?.forEach((opt) => {
      opt.choices?.forEach((choice) => {
        const qty = choice.quantity ?? 1;
        const modifierPrice = choicePriceMap.get(choice.choiceId) ?? 0;
        modifierTotal += modifierPrice * qty;
      });
    });

    const verifiedUnitPrice = basePrice + modifierTotal;
    subtotalKobo += verifiedUnitPrice * item.quantity;

    return { ...item, priceKobo: verifiedUnitPrice };
  });

  // Delivery fee — dynamic distance-based pricing
  let deliveryFeeKobo = 0;

  if (data.fulfillmentType === "delivery") {
    if (data.deliveryFeeKobo !== undefined && data.deliveryAddress && data.deliveryDistanceKm !== undefined) {
      // Server-side re-verification: re-fetch pricing and re-call Distance Matrix
      // to ensure the client-submitted fee wasn't tampered with.
      const [{ data: settings }, { data: rest }, { data: restPricing }] = await Promise.all([
        supabase
          .from("platform_settings")
          .select("delivery_base_fee_kobo, delivery_per_km_rate_kobo, delivery_max_radius_km, delivery_max_fee_kobo")
          .single(),
        supabase
          .from("restaurants")
          .select("latitude, longitude, max_delivery_radius_km")
          .eq("id", data.restaurantId)
          .single(),
        // Fetch new per-restaurant pricing columns separately (not in generated types yet)
        supabase
          .from("restaurants")
          .select("restaurant_base_fee_kobo, restaurant_per_km_rate_kobo, restaurant_max_fee_kobo")
          .eq("id", data.restaurantId)
          .single() as unknown as Promise<{ data: Record<string, unknown> | null }>,
      ]);

      // Restaurant-specific values take priority; fall back to platform settings, then constants
      const baseFeeKobo = Number(
        restPricing?.restaurant_base_fee_kobo
        ?? settings?.delivery_base_fee_kobo
        ?? DELIVERY_BASE_FEE_KOBO
      );
      const perKmRateKobo = Number(
        restPricing?.restaurant_per_km_rate_kobo
        ?? settings?.delivery_per_km_rate_kobo
        ?? DELIVERY_PER_KM_RATE_KOBO
      );
      const maxRadiusKm = Number(settings?.delivery_max_radius_km ?? DELIVERY_MAX_RADIUS_KM);
      const maxFeeKobo = Number(
        restPricing?.restaurant_max_fee_kobo
        ?? settings?.delivery_max_fee_kobo
        ?? DELIVERY_MAX_FEE_KOBO
      );

      if (rest?.latitude && rest?.longitude) {
        const origin = `${rest.latitude},${rest.longitude}`;
        // Prefer the exact place_id the customer picked from autocomplete —
        // Distance Matrix then measures to that place, never re-geocoding a
        // free-text string. Free text can snap to a same-named street in a
        // different district (GD-1331: "Mallam el rufai street …Lugbe"
        // resolved to Wuse at 9.3km instead of River Park Estate at 22.2km →
        // ₦1.9k undercharge). Fall back to the raw Places text — never the
        // combined string with the apt/floor field, which can also mislead
        // geocoding ("House 14a Addis Ababa" → Addis Ababa Crescent).
        // Coordinates (resolved suggestion or device GPS) are the most
        // trusted destination — no geocoding at all.
        const hasCoords =
          data.deliveryLat !== undefined && data.deliveryLng !== undefined;
        const destination = hasCoords
          ? encodeURIComponent(`${data.deliveryLat},${data.deliveryLng}`)
          : data.deliveryPlaceId
            ? encodeURIComponent(`place_id:${data.deliveryPlaceId}`)
            : encodeURIComponent(data.deliveryBaseAddress ?? data.deliveryAddress ?? "");
        const mapsUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&mode=driving&units=metric&key=${process.env.GOOGLE_MAPS_API_KEY}`;

        const mapsRes = await fetch(mapsUrl);
        const mapsData = await mapsRes.json();
        const element = mapsData?.rows?.[0]?.elements?.[0];

        if (element?.status === "OK") {
          const distanceKm = element.distance.value / 1000;
          const effectiveMaxRadius = rest.max_delivery_radius_km
            ? Number(rest.max_delivery_radius_km)
            : maxRadiusKm;
          if (distanceKm > effectiveMaxRadius) {
            return NextResponse.json(
              { error: "Delivery address is outside the allowed radius" },
              { status: 422 }
            );
          }
          const serverFee = Math.min(
            baseFeeKobo + Math.round(distanceKm * perKmRateKobo),
            maxFeeKobo
          );
          deliveryFeeKobo = serverFee;
        } else {
          // Maps call failed — use client-submitted fee as fallback
          deliveryFeeKobo = data.deliveryFeeKobo ?? baseFeeKobo;
        }
      } else {
        // Restaurant has no coordinates — use client-submitted fee (base fee fallback)
        deliveryFeeKobo = data.deliveryFeeKobo ?? baseFeeKobo;
      }
    } else {
      // No distance submitted (restaurant has no coordinates or client omitted it).
      // Prefer the fee the UI already showed the customer; only fall back to the
      // restaurant's flat rate if the client sent nothing at all.
      deliveryFeeKobo = data.deliveryFeeKobo ?? restaurant.delivery_fee ?? 0;
    }

    // Round the charged delivery fee to the nearest ₦100 — keeps our books free
    // of odd kobo/tens figures. Mirrors /api/delivery/fee so the amount charged
    // always matches the quote the customer saw, across every pricing path.
    deliveryFeeKobo = roundDeliveryFeeKobo(deliveryFeeKobo);
  }

  // ── Discount (merchant-funded) ─────────────────────────────────────────────
  // Resolve the single best discount (entered code or active automatic) against
  // the gross subtotal + delivery fee. The engine is the source of truth; the
  // client only requests a code. One discount per order.
  const { applied: appliedDiscount } = await resolveDiscount(supabase, {
    restaurantId: data.restaurantId,
    code: data.discountCode,
    subtotalKobo,
    deliveryFeeKobo,
    fulfillmentType: data.fulfillmentType,
    customerPhone: data.customerPhone,
    // Exact destination — required for zone-targeted (geo-fenced) offers.
    destinationLat: data.deliveryLat,
    destinationLng: data.deliveryLng,
  });

  let discountSubtotalKobo = 0;
  let discountDeliveryKobo = 0;
  let discountId: string | null = null;
  let discountCode: string | null = null;
  // Dispatch attribution to stamp onto the order. A free-delivery promo
  // declares who delivers (own_rider / platform_rider); stamping it at
  // creation lets settlement attribute the (waived) delivery fee correctly —
  // platform_rider => merchant is debited the full fee (merchant-funded).
  let dispatchType: string | null = null;

  if (appliedDiscount) {
    discountId = appliedDiscount.rule.id;
    discountCode = appliedDiscount.rule.code;
    if (appliedDiscount.result.freeDelivery) {
      discountDeliveryKobo = appliedDiscount.result.discountKobo;
      dispatchType =
        (appliedDiscount.rule.free_delivery_dispatch as string | null) ?? null;
    } else {
      discountSubtotalKobo = appliedDiscount.result.discountKobo;
    }
  }

  // ── Loyalty reward (auto-applied when the customer is eligible) ────────────
  // Promo codes win: loyalty only applies when no discount was used. The reward
  // is merchant-funded like a discount and flows through settlement the same
  // way. Spending the stamps is recorded by the order trigger via the
  // loyalty_redeemed/loyalty_stamps_spent flags stamped at order creation.
  let loyaltyRedeemed = false;
  let loyaltyStampsSpent = 0;
  if (!appliedDiscount) {
    const { data: program } = await supabase
      .from("loyalty_programs")
      .select("id, stamps_required, reward_type, reward_value, reward_max_discount_kobo, reward_item_ids")
      .eq("restaurant_id", data.restaurantId)
      .eq("is_active", true)
      .maybeSingle();
    if (program) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: balance } = await (supabase.rpc as any)("loyalty_balance", {
        p_program_id: program.id,
        p_phone: data.customerPhone,
      });
      if (typeof balance === "number" && balance >= program.stamps_required) {
        const loyaltyCartItems = verifiedItems.map((i) => ({
          menuItemId: i.menuItemId,
          unitPriceKobo: i.priceKobo,
        }));
        const reward = computeLoyaltyRewardKobo(program, {
          subtotalKobo,
          deliveryFeeKobo,
          items: loyaltyCartItems,
        });
        if (reward.discountSubtotalKobo > 0 || reward.discountDeliveryKobo > 0) {
          discountSubtotalKobo = reward.discountSubtotalKobo;
          discountDeliveryKobo = reward.discountDeliveryKobo;
          loyaltyRedeemed = true;
          loyaltyStampsSpent = program.stamps_required;
        }
      }
    }
  }

  // Total customer benefit (subtotal portion + delivery waiver)
  const discountKobo = discountSubtotalKobo + discountDeliveryKobo;
  // Subtotal the customer effectively pays — VAT, service fee and merchant
  // credit are all based on this discounted figure.
  const discountedSubtotalKobo = subtotalKobo - discountSubtotalKobo;

  // VAT — applied on the (discounted) subtotal only, not the delivery fee
  const vatPct = vatPercentageRaw ? Number(vatPercentageRaw) : 0;
  const vatKobo = vatPct > 0 ? Math.round(discountedSubtotalKobo * vatPct / 100) : 0;

  // Platform service fee — charged to the customer, on the discounted subtotal
  const { data: feeSettings } = await supabase
    .from("platform_settings")
    .select("service_charge_pct, service_charge_fixed_kobo")
    .single();
  const serviceChargePct = Number(feeSettings?.service_charge_pct ?? 0);
  const serviceChargeFixedKobo = Number(feeSettings?.service_charge_fixed_kobo ?? 0);
  const serviceFeeKobo =
    serviceChargePct > 0 || serviceChargeFixedKobo > 0
      ? Math.round(discountedSubtotalKobo * serviceChargePct) + serviceChargeFixedKobo
      : 0;

  // total = gross subtotal + gross delivery + vat + service − total discount
  const totalKobo =
    subtotalKobo + deliveryFeeKobo + vatKobo + serviceFeeKobo - discountKobo;

  if (
    restaurant.min_order_amount &&
    subtotalKobo < restaurant.min_order_amount
  ) {
    return NextResponse.json(
      {
        error: `Minimum order is ₦${(restaurant.min_order_amount / 100).toFixed(0)}`,
      },
      { status: 422 }
    );
  }

  // PAYMENT_PROVIDER toggle (default monnify). Flip the env var on Vercel +
  // redeploy to switch gateways without touching git history.
  const provider: "monnify" | "paystack" =
    process.env.PAYMENT_PROVIDER === "paystack" ? "paystack" : "monnify";

  // Reference format kept identical across providers for log readability.
  const paymentRef = `FD-${data.restaurantId.slice(0, 8)}-${Date.now()}`;

  const sharedMetadata = {
    customer_name: data.customerName,
    customer_phone: data.customerPhone,
    customer_email: data.customerEmail || null,
    fulfillment_type: data.fulfillmentType,
    delivery_address: data.deliveryAddress || null,
    special_instructions: data.specialInstructions || null,
    items: verifiedItems as unknown as import("@foodo/database").Json,
    subtotal_kobo: subtotalKobo,
    delivery_fee_kobo: deliveryFeeKobo,
    vat_kobo: vatKobo,
    vat_percentage: vatPct,
    service_fee_kobo: serviceFeeKobo,
    service_charge_pct: serviceChargePct,
    delivery_distance_km: data.deliveryDistanceKm ?? null,
    // Exact destination coordinates (picked suggestion or device GPS), so the
    // webhook can persist them onto the order and the saved address — future
    // re-orders price from these coords with zero geocoding.
    delivery_lat: data.deliveryLat ?? null,
    delivery_lng: data.deliveryLng ?? null,
    // Stamped onto the order by the webhook (free-delivery promo's declared
    // rider) so settlement attributes the waived delivery fee correctly.
    dispatch_type: dispatchType,
    discount_id: discountId,
    discount_code: discountCode,
    discount_kobo: discountKobo,
    discount_subtotal_kobo: discountSubtotalKobo,
    loyalty_redeemed: loyaltyRedeemed,
    loyalty_stamps_spent: loyaltyStampsSpent,
  } as import("@foodo/database").Json;

  const paymentInsert =
    provider === "paystack"
      ? {
          restaurant_id: data.restaurantId,
          paystack_ref: paymentRef,
          amount_kobo: totalKobo,
          paystack_status: "pending",
          payment_provider: "paystack",
          currency: "NGN",
          metadata: sharedMetadata,
        }
      : {
          restaurant_id: data.restaurantId,
          monnify_ref: paymentRef,
          amount_kobo: totalKobo,
          monnify_status: "pending",
          payment_provider: "monnify",
          currency: "NGN",
          metadata: sharedMetadata,
        };

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(paymentInsert as any)
    .select("id")
    .single();

  if (paymentError || !payment) {
    console.error("Payment insert error:", paymentError);
    return NextResponse.json(
      { error: "Failed to create payment record" },
      { status: 500 }
    );
  }

  // ── Test merchant (is_test): no real charge ───────────────────────────────
  // For test/demo merchants (e.g. The Copper Pot) we skip the payment gateway
  // entirely and create the PAID order directly — identical to a real order in
  // every other way (queue, loyalty earn/redeem, settlements), so the merchant
  // can be used to exercise the full flow (pickup + delivery) without money
  // moving. Strictly gated to is_test; unreachable for a real merchant.
  if (restaurant.is_test) {
    try {
      const { orderId, orderNumber } = await createTestOrder(supabase, {
        paymentId: payment.id,
        restaurantId: data.restaurantId,
        meta: sharedMetadata as Record<string, unknown>,
      });
      return NextResponse.json({
        provider: "test",
        orderId,
        orderNumber,
        paymentId: payment.id,
        totalKobo,
        deliveryFeeKobo,
        vatKobo,
        serviceFeeKobo,
        discountKobo,
        discountCode,
      });
    } catch (e) {
      console.error("[checkout] test order creation failed:", e);
      return NextResponse.json({ error: "Test order creation failed" }, { status: 500 });
    }
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: data.customerPhone,
    event: "checkout initiated",
    properties: {
      payment_id: payment.id,
      restaurant_id: data.restaurantId,
      fulfillment_type: data.fulfillmentType,
      subtotal_kobo: subtotalKobo,
      delivery_fee_kobo: deliveryFeeKobo,
      discount_kobo: discountKobo,
      discount_code: discountCode,
      total_kobo: totalKobo,
      item_count: data.items.length,
      payment_provider: provider,
    },
  });
  await posthog.shutdown();

  if (provider === "paystack") {
    // Server-side init — binds the reference to our payment row before the
    // SDK opens. The client then calls resumeTransaction(access_code).
    const paystackRes = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reference: paymentRef,
          amount: totalKobo,
          email:
            data.customerEmail ||
            `${data.customerPhone.replace(/\D/g, "")}@foodo.ng`,
          currency: "NGN",
          metadata: {
            payment_id: payment.id,
            restaurant_id: data.restaurantId,
            customer_name: data.customerName,
            customer_phone: data.customerPhone,
          },
        }),
      }
    );

    if (!paystackRes.ok) {
      const errBody = await paystackRes.json().catch(() => ({}));
      console.error("Paystack init error:", errBody);
      return NextResponse.json(
        { error: "Payment gateway error" },
        { status: 502 }
      );
    }

    const paystackData = await paystackRes.json();

    return NextResponse.json({
      provider: "paystack",
      accessCode: paystackData.data.access_code,
      paystackRef: paymentRef,
      paymentId: payment.id,
      totalKobo,
      deliveryFeeKobo,
      vatKobo,
      vatPercentage: vatPct,
      serviceFeeKobo,
      serviceChargePct,
      discountKobo,
      discountCode,
    });
  }

  return NextResponse.json({
    provider: "monnify",
    monnifyRef: paymentRef,
    paymentId: payment.id,
    totalKobo,
    deliveryFeeKobo,
    vatKobo,
    vatPercentage: vatPct,
    serviceFeeKobo,
    serviceChargePct,
    discountKobo,
    discountCode,
  });
}
