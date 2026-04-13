import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  DELIVERY_BASE_FEE_KOBO,
  DELIVERY_PER_KM_RATE_KOBO,
  DELIVERY_MAX_RADIUS_KM,
  DELIVERY_MAX_FEE_KOBO,
} from "@foodo/utils";

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

  // Fetch vat_percentage separately (column added after type generation)
  const { data: vatRow } = await supabase
    .from("restaurants")
    .select("vat_percentage")
    .eq("id", data.restaurantId)
    .single();
  const vatPercentageRaw = vatRow ? (vatRow as Record<string, unknown>)["vat_percentage"] : null;

  if (restError || !restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  if (!restaurant.accepts_orders) {
    return NextResponse.json(
      { error: "This restaurant is currently closed" },
      { status: 409 }
    );
  }

  // Compute subtotal
  const subtotalKobo = data.items.reduce(
    (sum, item) => sum + item.priceKobo * item.quantity,
    0
  );

  // Delivery fee — dynamic distance-based pricing
  let deliveryFeeKobo = 0;

  if (data.fulfillmentType === "delivery") {
    if (data.deliveryFeeKobo !== undefined && data.deliveryAddress && data.deliveryDistanceKm !== undefined) {
      // Server-side re-verification: re-fetch pricing and re-call Distance Matrix
      // to ensure the client-submitted fee wasn't tampered with.
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("delivery_base_fee_kobo, delivery_per_km_rate_kobo, delivery_max_radius_km, delivery_max_fee_kobo")
        .single();

      const baseFeeKobo = Number(settings?.delivery_base_fee_kobo ?? DELIVERY_BASE_FEE_KOBO);
      const perKmRateKobo = Number(settings?.delivery_per_km_rate_kobo ?? DELIVERY_PER_KM_RATE_KOBO);
      const maxRadiusKm = Number(settings?.delivery_max_radius_km ?? DELIVERY_MAX_RADIUS_KM);
      const maxFeeKobo = Number(settings?.delivery_max_fee_kobo ?? DELIVERY_MAX_FEE_KOBO);

      const { data: rest } = await supabase
        .from("restaurants")
        .select("latitude, longitude, max_delivery_radius_km")
        .eq("id", data.restaurantId)
        .single();

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
          const clientFee = data.deliveryFeeKobo ?? 0;
          // Reject if client fee differs from server re-calc by more than 10%
          if (Math.abs(clientFee - serverFee) / Math.max(serverFee, 1) > 0.10) {
            return NextResponse.json(
              { error: "Delivery fee mismatch — please refresh and try again." },
              { status: 422 }
            );
          }
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
      // No dynamic fee submitted — fall back to restaurant's flat rate
      deliveryFeeKobo = restaurant.delivery_fee ?? 0;
    }
  }

  // VAT — applied on subtotal only (not delivery fee)
  const vatPct = vatPercentageRaw ? Number(vatPercentageRaw) : 0;
  const vatKobo = vatPct > 0 ? Math.round(subtotalKobo * vatPct / 100) : 0;

  const totalKobo = subtotalKobo + deliveryFeeKobo + vatKobo;

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

  // Generate Paystack reference
  const paystackRef = `FD-${data.restaurantId.slice(0, 8)}-${Date.now()}`;

  // Create payment record (pending)
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      restaurant_id: data.restaurantId,
      paystack_ref: paystackRef,
      amount_kobo: totalKobo,
      paystack_status: "pending",
      currency: "NGN",
      metadata: {
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        customer_email: data.customerEmail || null,
        fulfillment_type: data.fulfillmentType,
        delivery_address: data.deliveryAddress || null,
        special_instructions: data.specialInstructions || null,
        items: data.items as unknown as import("@foodo/database").Json,
        subtotal_kobo: subtotalKobo,
        delivery_fee_kobo: deliveryFeeKobo,
        vat_kobo: vatKobo,
        vat_percentage: vatPct,
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

  // Initialize Paystack transaction
  const paystackRes = await fetch(
    "https://api.paystack.co/transaction/initialize",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference: paystackRef,
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
    accessCode: paystackData.data.access_code,
    paystackRef,
    paymentId: payment.id,
    totalKobo,
    deliveryFeeKobo,
    vatKobo,
    vatPercentage: vatPct,
  });
}
