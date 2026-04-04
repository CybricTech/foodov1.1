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
    { data: wallet },
    { data: transactions },
    { data: settlements },
  ] = await Promise.all([
    supabase
      .from("restaurant_wallets")
      .select("*")
      .eq("restaurant_id", session.restaurantId)
      .single(),

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
  ]);

  return (
    <WalletClient
      restaurantId={session.restaurantId}
      wallet={wallet}
      transactions={transactions ?? []}
      settlements={settlements ?? []}
    />
  );
}
