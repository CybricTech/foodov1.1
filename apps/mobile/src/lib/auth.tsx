/**
 * Auth + session context for the Kitchyn Merchant app.
 *
 * Mirrors the web `getDashboardUser` contract: after a Supabase session exists,
 * we load the caller's `user_profiles` row (role, restaurant_id, full_name) and
 * gate access on a present `restaurant_id`. A signed-in user with no merchant
 * profile / restaurant is treated as unauthorized (signed out), matching web.
 *
 * Exposes: { loading, session, profile, error, signIn, signOut }. Screens read
 * `profile.role` to route (Phase 1 routes BOTH merchant_owner + merchant_staff
 * to the frontline experience) and `profile.restaurantId` for queries.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { getSupabase, isSupabaseConfigured } from "./supabase";
import { capture, getPostHog } from "./observability";

export type MerchantRole = "merchant_owner" | "merchant_staff";

export interface MerchantProfile {
  userId: string;
  email: string;
  restaurantId: string;
  fullName: string;
  role: MerchantRole;
}

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  profile: MerchantProfile | null;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Loads the merchant profile for an authenticated user, or null if ineligible. */
async function loadProfile(
  userId: string,
  email: string
): Promise<MerchantProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("user_profiles")
    .select("role, restaurant_id, full_name")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  if (!data.restaurant_id) return null;
  const role = data.role as string;
  if (role !== "merchant_owner" && role !== "merchant_staff") return null;

  return {
    userId,
    email,
    restaurantId: data.restaurant_id as string,
    fullName: (data.full_name as string | null) ?? "",
    role,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const mounted = useRef(true);

  // Resolve a session into a gated profile (or clear it). Centralized so the
  // initial boot and every auth-state change run identical logic.
  const resolveSession = useCallback(async (next: Session | null) => {
    setSession(next);
    if (!next?.user) {
      setProfile(null);
      return;
    }
    const loaded = await loadProfile(next.user.id, next.user.email ?? "");
    if (!mounted.current) return;
    setProfile(loaded);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    (async () => {
      const { data } = await supabase.auth.getSession();
      await resolveSession(data.session ?? null);
      if (mounted.current) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // Keep profile in sync as tokens refresh / sign-out happens elsewhere.
      void resolveSession(next ?? null);
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [resolveSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const supabase = getSupabase();
      if (!supabase) {
        return { error: "App is not configured. Contact support." };
      }
      const trimmed = email.trim();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (error) {
        return { error: error.message };
      }
      // Eagerly resolve the profile so routing has it immediately, and reject
      // accounts that aren't merchants (mirrors web's restaurant_id gate).
      const loaded = data.session?.user
        ? await loadProfile(data.session.user.id, data.session.user.email ?? "")
        : null;
      if (!loaded) {
        await supabase.auth.signOut();
        return {
          error: "This account isn't linked to a restaurant. Contact support.",
        };
      }
      setSession(data.session ?? null);
      setProfile(loaded);
      getPostHog()?.identify(trimmed);
      capture("merchant_login", { email: trimmed, role: loaded.role });
      return { error: null };
    },
    []
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    capture("merchant_logout");
    await supabase?.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      profile,
      configured: isSupabaseConfigured,
      signIn,
      signOut,
    }),
    [loading, session, profile, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
