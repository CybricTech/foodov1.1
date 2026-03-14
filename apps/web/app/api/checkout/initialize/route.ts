import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { ngnToKobo } from "@foodo/utils";

const InitializeSchema = z.object({
  restaurantId: z.string().uuid(),
  customerName: z.string().min(2).max(100),
  customerPhone: z.string().min(10).max(20),
  customerEmail: z.string().email().optional().or(z.literal("")),
  fulfillmentType: z.enum(["delivery", "pickup"]),
  deliveryAddress: z.string().optional(),
  specialInstructions: z.string().max(500).optional(),
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
  const supabase = await createServerClient();

  // Verify restaurant exists and accepts orders
  const { data: restaurant, error: restError } = await supabase
    .from("restaurants")
    .select("id, name, accepts_orders, min_order_amount, delivery_fee")
    .eq("id", data.restaurantId)
    .eq("is_active", true)
    .single();

  if (restError || !restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  if (!restaurant.accepts_orders) {
    return NextResponse.json(
      { error: "This restaurant is currently closed" },
      { status: 409 }
    );
  }

  // Compute total
  const subtotalKobo = data.items.reduce(
    (sum, item) => sum + item.priceKobo * item.quantity,
    0
  );

  const deliveryFeeKobo =
    data.fulfillmentType === "delivery" ? (restaurant.delivery_fee ?? 0) : 0;

  const totalKobo = subtotalKobo + deliveryFeeKobo;

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
      } as import("@foodo/database").Json,
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
  });
}
