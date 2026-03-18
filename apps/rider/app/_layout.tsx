import "../global.css";
// Must import location-broadcast at root so TaskManager.defineTask runs on startup
import "../lib/tasks/location-broadcast";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/lib/stores/auth";

export default function RootLayout() {
  const setSession = useAuthStore((s) => s.setSession);
  const fetchRider = useAuthStore((s) => s.fetchRider);

  useEffect(() => {
    // Restore session on boot
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchRider();
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session) fetchRider();
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <StatusBar style="light" backgroundColor="#0A0A0A" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0A0A" } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
