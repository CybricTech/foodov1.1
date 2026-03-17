/**
 * Supabase client factories.
 *
 * Usage:
 *   - In Next.js Server Components / Route Handlers: import { createServerClient } from '@foodo/database/client'
 *   - In Next.js Client Components: import { createBrowserClient } from '@foodo/database/client'
 *   - In Expo: import { createMobileClient } from '@foodo/database/client'
 *
 * The service role client is only available server-side and must never be
 * shipped to the browser or the Expo bundle.
 */

import { createClient, SupabaseClient, SupportedStorage } from "@supabase/supabase-js";
import type { Database } from "./types";

export type TypedSupabaseClient = SupabaseClient<Database>;

// ─── Environment variable helpers ────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Ensure it is set in your .env.local file.`
    );
  }
  return value;
}

// ─── Browser client (singleton for Client Components) ─────────────────────

let _browserClient: TypedSupabaseClient | null = null;

/**
 * Returns a singleton Supabase client for use in Next.js Client Components.
 * Uses the anon key — subject to RLS policies.
 */
export function createBrowserClient(): TypedSupabaseClient {
  if (_browserClient) return _browserClient;
  _browserClient = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
  return _browserClient;
}

// ─── Mobile client (Expo React Native) ────────────────────────────────────

/**
 * Creates a Supabase client for Expo React Native.
 * The caller must provide a storage implementation (expo-secure-store adapter).
 */
export function createMobileClient(
  storage: SupportedStorage
): TypedSupabaseClient {
  // Support both Next.js (NEXT_PUBLIC_*) and Expo (EXPO_PUBLIC_*) env var conventions
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient<Database>(
    url,
    anonKey,
    {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    }
  );
}

// ─── Service role client (Edge Functions / Server Actions only) ────────────

/**
 * Creates a Supabase admin client using the service role key.
 *
 * ⚠️  DANGER: This client bypasses ALL RLS policies.
 *    ONLY use it in Supabase Edge Functions or Next.js Route Handlers
 *    that run on the server. NEVER expose this to the client.
 */
export function createServiceClient(): TypedSupabaseClient {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
