import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveDiscount, discountLabel } from "@/lib/discounts";

/**
 * Preview a discount for the storefront checkout.
 *
 * Returns the single best discount that applies (entered code or automatic),
 * or a specific error when an entered code can't be used. This is a PREVIEW —
 * the authoritative amount is recomputed server-side in /api/checkout/initialize.
 */

const QuoteSchema = z.object({
  restaurantId: z.string().uuid(),
  code: z.string().trim().max(40).optional(),
  subtotalKobo: z.number().int().min(0),
  deliveryFeeKobo: z.number().int().min(0).default(0),
  fulfillmentType: z.enum(["delivery", "pickup"]),
  customerPhone: z.string().max(20).optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = QuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const supabase = createServiceClient();

  const { applied, codeError, codeNotFound } = await resolveDiscount(supabase, {
    restaurantId: data.restaurantId,
    code: data.code,
    subtotalKobo: data.subtotalKobo,
    deliveryFeeKobo: data.deliveryFeeKobo,
    fulfillmentType: data.fulfillmentType,
    customerPhone: data.customerPhone,
  });

  if (data.code && codeNotFound) {
    return NextResponse.json(
      { discount: null, error: "That code isn't valid." },
      { status: 200 }
    );
  }

  if (data.code && codeError && (!applied || applied.rule.code !== data.code.trim().toUpperCase())) {
    return NextResponse.json(
      { discount: null, error: codeError },
      { status: 200 }
    );
  }

  if (!applied) {
    return NextResponse.json({ discount: null }, { status: 200 });
  }

  return NextResponse.json({
    discount: {
      id: applied.rule.id,
      label: discountLabel(applied),
      type: applied.rule.type,
      code: applied.rule.code,
      discountKobo: applied.result.discountKobo,
      freeDelivery: applied.result.freeDelivery,
    },
  });
}
