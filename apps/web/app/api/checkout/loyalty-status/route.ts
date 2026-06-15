import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { formatLoyaltyReward, loyaltyProgress, computeLoyaltyRewardKobo } from "@foodo/utils";

/**
 * Storefront loyalty progress preview.
 *
 * Given a restaurant + customer phone (+ the current cart), returns the active
 * stamp-card program, the customer's balance/progress, and whether the reward
 * would be auto-applied to THIS order. For a free-item reward it also reports
 * the eligible item names and whether one is already in the cart, so the
 * checkout can either confirm "applied" or prompt "add a free X to claim".
 * PREVIEW only; redemption is recomputed server-side in /api/checkout/initialize
 * (where a promo code takes precedence over loyalty).
 */
const Schema = z.object({
  restaurantId: z.string().uuid(),
  phone: z.string().max(20),
  subtotalKobo: z.number().int().min(0).default(0),
  deliveryFeeKobo: z.number().int().min(0).default(0),
  items: z
    .array(z.object({ menuItemId: z.string().uuid(), unitPriceKobo: z.number().int().min(0) }))
    .default([]),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ active: false });
  const { restaurantId, phone, subtotalKobo, deliveryFeeKobo, items } = parsed.data;

  const supabase = createServiceClient();
  const { data: program } = await supabase
    .from("loyalty_programs")
    .select(
      "id, stamps_required, earn_min_order_kobo, reward_type, reward_value, reward_max_discount_kobo, reward_label, reward_item_ids"
    )
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();

  if (!program) return NextResponse.json({ active: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: balanceRaw } = await (supabase.rpc as any)("loyalty_balance", {
    p_program_id: program.id,
    p_phone: phone,
  });
  const balance = typeof balanceRaw === "number" ? balanceRaw : 0;
  const progress = loyaltyProgress(balance, program.stamps_required);
  const reward = computeLoyaltyRewardKobo(program, { subtotalKobo, deliveryFeeKobo, items });
  const rewardValueKobo = reward.discountSubtotalKobo + reward.discountDeliveryKobo;

  // For a free-item reward, surface the eligible item names so the checkout can
  // prompt the customer to add one when it isn't in the cart yet.
  let freeItemNames: string[] = [];
  if (program.reward_type === "free_item" && (program.reward_item_ids?.length ?? 0) > 0) {
    const { data: rows } = await supabase
      .from("menu_items")
      .select("name")
      .in("id", program.reward_item_ids);
    freeItemNames = (rows ?? []).map((r) => r.name as string);
  }

  return NextResponse.json({
    active: true,
    rewardType: program.reward_type,
    balance: progress.balance,
    required: progress.required,
    remaining: progress.remaining,
    redeemable: progress.redeemable,
    rewardLabel: formatLoyaltyReward(program),
    // True when the reward has a checkout-applicable value right now.
    autoAppliable: rewardValueKobo > 0,
    freeItemNames,
  });
}
