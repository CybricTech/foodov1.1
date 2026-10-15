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
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getSupabase, isSupabaseConfigured } from "./supabase";
import { capture, getPostHog } from "./observability";
import {
  registerForPushNotifications,
  unregisterForPushNotifications,
} from "./push";

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

/*
 * Last known merchant profile, cached on device.
 *
 * Cold start used to be strictly serial: read session -> fetch the profile over
 * the network -> only then route anywhere. That fetch is a full round trip
 * (often a fresh TLS handshake) before the merchant sees anything, and if it
 * failed (offline, a network blip) a signed-in merchant was bounced to the
 * login screen. With the cache, routing happens as soon as the local session
 * and cache are read; the profile is revalidated against the server in the
 * background and replaced (or cleared) if it changed.
 *
 * Holds only role, restaurant id, name and email: nothing a token grants. The
 * session itself stays in the secure store, and every query is still enforced
 * by RLS on the server, so a stale cache can't widen access.
 */
const PROFILE_CACHE_KEY = "kitchyn.profile.v1";

async function readCachedProfile(userId: string): Promise<MerchantProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as MerchantProfile;
    return cached.userId === userId ? cached : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: MerchantProfile | null) {
  const op = profile
    ? AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
    : AsyncStorage.removeItem(PROFILE_CACHE_KEY);
  void op.catch(() => undefined);
}

/** A failed lookup (network) vs. a definitive "not a merchant" answer. */
type ProfileResult = { profile: MerchantProfile | null; definitive: boolean };

/** Loads the merchant profile for an authenticated user, or null if ineligible. */
async function fetchProfile(userId: string, email: string): Promise<ProfileResult> {
  const supabase = getSupabase();
  if (!supabase) return { profile: null, definitive: true };
  const { data, error } = await supabase
    .from("user_profiles")
    .select("role, restaurant_id, full_name")
    .eq("id", userId)
    .maybeSingle();

  // A transport/server error says nothing about who this user is. Only a
  // successful read is allowed to revoke a cached profile.
  if (error) return { profile: null, definitive: false };
  if (!data || !data.restaurant_id) return { profile: null, definitive: true };
  const role = data.role as string;
  if (role !== "merchant_owner" && role !== "merchant_staff") {
    return { profile: null, definitive: true };
  }

  return {
    profile: {
      userId,
      email,
      restaurantId: data.restaurant_id as string,
      fullName: (data.full_name as string | null) ?? "",
      role,
    },
    definitive: true,
  };
}

async function loadProfile(userId: string, email: string): Promise<MerchantProfile | null> {
  return (await fetchProfile(userId, email)).profile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const mounted = useRef(true);

  // Which user the profile in state belongs to, so token refreshes and the
  // INITIAL_SESSION event (which supabase-js fires on subscribe, on top of the
  // boot read) don't each trigger another profile round trip.
  const profileUserRef = useRef<string | null>(null);

  const applyProfile = useCallback((next: MerchantProfile | null) => {
    profileUserRef.current = next?.userId ?? null;
    setProfile(next);
    writeCachedProfile(next);
  }, []);

  // Revalidate against the server. Keeps the cached profile when the network
  // fails; replaces or clears it only on a definitive answer.
  const revalidateProfile = useCallback(
    async (userId: string, email: string) => {
      const { profile: fresh, definitive } = await fetchProfile(userId, email);
      if (!mounted.current || !definitive) return;
      // Session changed hands while we were waiting: drop the stale answer.
      if (profileUserRef.current !== null && profileUserRef.current !== userId) return;
      applyProfile(fresh);
      if (fresh) void registerForPushNotifications().catch(() => undefined);
    },
    [applyProfile]
  );

  useEffect(() => {
    mounted.current = true;
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    (async () => {
      // Local reads only: the stored session and the cached profile. No
      // network on the path to the first screen.
      const { data } = await supabase.auth.getSession();
      const next = data.session ?? null;
      if (!mounted.current) return;
      setSession(next);
      if (!next?.user) {
        applyProfile(null);
        setLoading(false);
        return;
      }
      const cached = await readCachedProfile(next.user.id);
      if (!mounted.current) return;
      if (cached) {
        profileUserRef.current = cached.userId;
        setProfile(cached);
        setLoading(false);
        void revalidateProfile(next.user.id, next.user.email ?? "");
        return;
      }
      // First launch after install/upgrade: nothing cached, so this one time
      // we wait for the server before routing.
      await revalidateProfile(next.user.id, next.user.email ?? "");
      if (mounted.current) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next ?? null);
      if (!next?.user) {
        if (event === "SIGNED_OUT") applyProfile(null);
        return;
      }
      // Token refreshes and the boot-time INITIAL_SESSION for a user whose
      // profile is already loaded change nothing about who they are.
      if (profileUserRef.current === next.user.id && event !== "USER_UPDATED") return;
      void revalidateProfile(next.user.id, next.user.email ?? "");
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [applyProfile, revalidateProfile]);

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
      applyProfile(loaded);
      getPostHog()?.identify(trimmed);
      capture("merchant_login", { email: trimmed, role: loaded.role });
      // Register for push right after login (correct moment to prompt — not at
      // cold start). Fire-and-forget; safe no-op in Expo Go / on simulators.
      void registerForPushNotifications().catch(() => undefined);
      return { error: null };
    },
    [applyProfile]
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    capture("merchant_logout");
    // Best-effort: stop THIS device from receiving this account's order pushes.
    // Fire-and-forget — we never await it, so a slow network can't stall logout.
    // It only removes one device_tokens row (re-created on next login); the push
    // system itself is untouched. It reads the still-valid session token at call
    // time, so racing the sign-out below is fine (a 401 just no-ops).
    void unregisterForPushNotifications().catch(() => undefined);
    // Clear local auth state FIRST so the UI redirects to /login immediately,
    // independent of any network round-trip.
    setSession(null);
    applyProfile(null);
    // Server sign-out with LOCAL scope: clears the on-device session WITHOUT a
    // network call to the auth server, so a slow/unreachable Supabase can never
    // hang logout (the default 'global' scope does a network request that can
    // stall in React Native — the actual cause of the dead sign-out button).
    try {
      await supabase?.auth.signOut({ scope: "local" });
    } catch {
      /* state already cleared above */
    }
  }, [applyProfile]);

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
