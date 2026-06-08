/** Owner Wallet tab — read-only money for the signed-in restaurant. */
import { useAuth } from "../../src/lib/auth";
import { WalletScreen } from "../../src/features/owner/wallet-screen";

export default function OwnerWalletRoute() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <WalletScreen restaurantId={profile.restaurantId} />;
}
