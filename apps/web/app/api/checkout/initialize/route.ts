import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  DELIVERY_BASE_FEE_KOBO,
  DELIVERY_PER_KM_RATE_KOBO,
  DELIVERY_MAX_RADIUS_KM,
  DELIVERY_MAX_FEE_KOBO,
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
  specialInstructions: z.string().max(500).optional(),
  deliveryFeeKobo: z.number().int().min(0).optional(),
  deliveryDistanceKm: z.number().min(0).optional(),
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
    .select("id, name, accepts_orders, min_order_amount, delivery_fee")
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
    .select("id, price_kobo")
    .in("id", menuItemIds);

  const menuItemPriceMap = new Map(
    (menuItems ?? []).map((m) => [m.id, m.price_kobo])
  );

  // Validate all submitted items exist in the menu
  for (const item of data.items) {
    if (!menuItemPriceMap.has(item.menuItemId)) {
      return NextResponse.json(
        { error: "One or more items are no longer available" },
        { status: 422 }
      );
    }
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
      .select("id, price_modifier_kobo")
      .in("id", allChoiceIds);

    choicePriceMap = new Map(
      (choices ?? []).map((c) => [c.id, c.price_modifier_kobo ?? 0])
    );
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
        const destination = encodeURIComponent(data.deliveryAddress);
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
  }

  // VAT — applied on subtotal only (not delivery fee)
  const vatPct = vatPercentageRaw ? Number(vatPercentageRaw) : 0;
  const vatKobo = vatPct > 0 ? Math.round(subtotalKobo * vatPct / 100) : 0;

  // Platform service fee — charged to the customer
  const { data: feeSettings } = await supabase
    .from("platform_settings")
    .select("service_charge_pct, service_charge_fixed_kobo")
    .single();
  const serviceChargePct = Number(feeSettings?.service_charge_pct ?? 0);
  const serviceChargeFixedKobo = Number(feeSettings?.service_charge_fixed_kobo ?? 0);
  const serviceFeeKobo =
    serviceChargePct > 0 || serviceChargeFixedKobo > 0
      ? Math.round(subtotalKobo * serviceChargePct) + serviceChargeFixedKobo
      : 0;

  const totalKobo = subtotalKobo + deliveryFeeKobo + vatKobo + serviceFeeKobo;

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

  // Generate Monnify paymentReference (our internal id, sent on the request
  // and echoed back in webhooks). Format kept identical to the legacy Paystack
  // reference for log readability and downstream tooling compatibility.
  const monnifyRef = `FD-${data.restaurantId.slice(0, 8)}-${Date.now()}`;

  // Create payment record (pending)
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      restaurant_id: data.restaurantId,
      monnify_ref: monnifyRef,
      amount_kobo: totalKobo,
      monnify_status: "pending",
      payment_provider: "monnify",
      currency: "NGN",
      metadata: {
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
      } as import("@foodo/database").Json,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select("id")
    .single();

  if (paymentError || !payment) {
    console.error("Payment insert error:", paymentError);
    return NextResponse.json(
      { error: "Failed to create payment record" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    monnifyRef,
    paymentId: payment.id,
    totalKobo,
    deliveryFeeKobo,
    vatKobo,
    vatPercentage: vatPct,
    serviceFeeKobo,
    serviceChargePct,
  });
}
