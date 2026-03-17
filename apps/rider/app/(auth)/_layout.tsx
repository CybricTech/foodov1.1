import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/lib/stores/auth";

export default function AuthLayout() {
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);

  if (loading) return null;

  // Already signed in — go to app
  if (session) return <Redirect href="/(app)" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0A0A" } }} />
  );
}
