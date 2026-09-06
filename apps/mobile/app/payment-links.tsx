import { Redirect } from "expo-router";
import { useAuth } from "../src/lib/auth";
import { PaymentLinksScreen } from "../src/features/payment-links/payment-links-screen";

export default function PaymentLinksRoute() {
  const { loading, profile } = useAuth();
  if (loading) return null;
  if (!profile || !["merchant_owner", "merchant_staff"].includes(profile.role)) return <Redirect href="/login" />;
  return <PaymentLinksScreen />;
}
