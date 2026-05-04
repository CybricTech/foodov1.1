import { createServerClient } from "@/lib/supabase/server";
import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import { WalletClient } from "@/components/dashboard/wallet-client";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = await createServerClient();

  const [
    { data: transactions },
    { data: settlements },
    { data: allCredits },
    { data: paidSettlements },
    { data: pendingCredits },
  ] = await Promise.all([
    supabase
      .from("wallet_transactions")
      .select("*")
      .eq("restaurant_id", session.restaurantId)
      .order("created_at", { ascending: false })
      .limit(30),

    supabase
      .from("settlements")
      .select("*")
      .eq("restaurant_id", session.restaurantId)
      .order("created_at", { ascending: false })
      .limit(10),

    // Total Earned: sum of all order_credit transactions (lifetime net to merchant)
    supabase
      .from("wallet_transactions")
      .select("amount_kobo")
      .eq("restaurant_id", session.restaurantId)
      .eq("type", "order_credit"),

    // Total Paid Out: sum of paid settlements (matches admin view)
    supabase
      .from("settlements")
      .select("amount_kobo")
      .eq("restaurant_id", session.restaurantId)
      .eq("status", "paid"),

    // Awaiting Payout: order_credit txns not yet flipped to 'settled'
    supabase
      .from("wallet_transactions")
      .select("amount_kobo")
      .eq("restaurant_id", session.restaurantId)
      .eq("type", "order_credit")
      .neq("status", "settled"),
  ]);

  const sumKobo = (rows: Array<{ amount_kobo: number }> | null) =>
    (rows ?? []).reduce((s, r) => s + (r.amount_kobo ?? 0), 0);

  const totalEarnedKobo = sumKobo(allCredits);
  const totalWithdrawnKobo = sumKobo(paidSettlements);
  const pendingBalanceKobo = sumKobo(pendingCredits);

  return (
    <WalletClient
      restaurantId={session.restaurantId}
      pendingBalanceKobo={pendingBalanceKobo}
      totalEarnedKobo={totalEarnedKobo}
      totalWithdrawnKobo={totalWithdrawnKobo}
      transactions={transactions ?? []}
      settlements={settlements ?? []}
    />
  );
}
