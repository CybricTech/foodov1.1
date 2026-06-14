import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { formatLoyaltyReward, loyaltyProgress, computeLoyaltyRewardKobo } from "@foodo/utils";

/**
 * Storefront loyalty progress preview.
 *
 * Given a restaurant + customer phone, returns the active stamp-card program,
 * the customer's current balance/progress, and whether the reward would be
 * auto-applied to THIS order (needs a positive value — free-item rewards are
 * not auto-applied). PREVIEW only; redemption is recomputed server-side in
 * /api/checkout/initialize, where a promo code takes precedence over loyalty.
 */
const Schema = z.object({
  restaurantId: z.string().uuid(),
  phone: z.string().max(20),
  subtotalKobo: z.number().int().min(0).default(0),
  deliveryFeeKobo: z.number().int().min(0).default(0),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ active: false });
  }
  const { restaurantId, phone, subtotalKobo, deliveryFeeKobo } = parsed.data;

  const supabase = createServiceClient();
  const { data: program } = await supabase
    .from("loyalty_programs")
    .select("id, stamps_required, earn_min_order_kobo, reward_type, reward_value, reward_max_discount_kobo, reward_label")
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
  const reward = computeLoyaltyRewardKobo(program, { subtotalKobo, deliveryFeeKobo });
  const rewardValueKobo = reward.discountSubtotalKobo + reward.discountDeliveryKobo;

  return NextResponse.json({
    active: true,
    balance: progress.balance,
    required: progress.required,
    remaining: progress.remaining,
    redeemable: progress.redeemable,
    rewardLabel: formatLoyaltyReward(program),
    // True when the reward has a checkout-applicable value (excludes free_item).
    autoAppliable: rewardValueKobo > 0,
  });
}
