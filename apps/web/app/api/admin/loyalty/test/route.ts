import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { formatLoyaltyReward, loyaltyProgress } from "@foodo/utils";

/**
 * Admin loyalty test helper — inspect or reset a phone's stamp balance for a
 * restaurant's active program, so the earn→redeem loop can be re-run cleanly.
 * Super-admin only; service client (bypasses RLS) on the admin's own request.
 */
async function requireSuperAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "super_admin") return null;
  return service;
}

export async function POST(req: NextRequest) {
  const service = await requireSuperAdmin();
  if (!service) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { action?: string; restaurantId?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { action, restaurantId, phone } = body;
  // The "participants" roster needs only a restaurant; lookup/reset need a phone.
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
  }

  const { data: program } = await service
    .from("loyalty_programs")
    .select("id, stamps_required, reward_type, reward_value, reward_max_discount_kobo, reward_label, is_active")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!program) return NextResponse.json({ error: "No loyalty program for this restaurant" }, { status: 404 });

  // Roster mode: every phone with stamp activity in this program, no phone input.
  if (action === "participants") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (service.rpc as any)("loyalty_program_participants", {
      p_program_id: program.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    type ParticipantRow = {
      customer_phone: string;
      balance: number;
      total_earned: number;
      stamp_count: number;
      last_activity: string;
    };
    const participants = ((rows ?? []) as ParticipantRow[]).map((r) => {
      const progress = loyaltyProgress(r.balance, program.stamps_required);
      return {
        phone: r.customer_phone,
        balance: progress.balance,
        totalEarned: r.total_earned,
        stampCount: Number(r.stamp_count),
        lastActivity: r.last_activity,
        redeemable: progress.redeemable,
        remaining: progress.remaining,
      };
    });
    return NextResponse.json({
      programActive: program.is_active,
      rewardLabel: formatLoyaltyReward(program),
      required: program.stamps_required,
      participantCount: participants.length,
      participants,
    });
  }

  // lookup/reset both need a phone (the roster branch returned above).
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  if (action === "reset") {
    const { error } = await service
      .from("loyalty_stamps")
      .delete()
      .eq("program_id", program.id)
      .eq("customer_phone", phone);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: balanceRaw } = await (service.rpc as any)("loyalty_balance", {
    p_program_id: program.id,
    p_phone: phone,
  });
  const balance = typeof balanceRaw === "number" ? balanceRaw : 0;

  const { data: ledger } = await service
    .from("loyalty_stamps")
    .select("id, delta, reason, order_id, created_at")
    .eq("program_id", program.id)
    .eq("customer_phone", phone)
    .order("created_at", { ascending: false })
    .limit(50);

  const progress = loyaltyProgress(balance, program.stamps_required);
  return NextResponse.json({
    programActive: program.is_active,
    rewardLabel: formatLoyaltyReward(program),
    balance: progress.balance,
    required: progress.required,
    remaining: progress.remaining,
    redeemable: progress.redeemable,
    ledger: ledger ?? [],
  });
}
