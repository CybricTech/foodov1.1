/**
 * Supabase browser client for Next.js Client Components.
 * Singleton — only one instance per browser session.
 */
"use client";

import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";
import type { Database, TypedSupabaseClient } from "@foodo/database";

let _client: TypedSupabaseClient | null = null;

export function createBrowserClient(): TypedSupabaseClient {
  if (_client) return _client;
  _client = _createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as unknown as TypedSupabaseClient;
  return _client;
}
