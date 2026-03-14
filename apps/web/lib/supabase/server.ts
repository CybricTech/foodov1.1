/**
 * Supabase SSR client for Next.js Server Components, Server Actions, and Route Handlers.
 *
 * Use this in: app/ layouts, pages, API routes.
 * Session is managed via httpOnly cookies (PRD §10: merchants use httpOnly cookie sessions).
 */
import { createServerClient as _createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database, TypedSupabaseClient } from "@foodo/database";
import type { CookieOptions } from "@supabase/ssr";

export async function createServerClient(): Promise<TypedSupabaseClient> {
  const cookieStore = await cookies();

  const client = _createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll can be called in Server Components where setting is not possible.
            // Middleware handles the actual cookie refresh.
          }
        },
      },
    }
  );
  return client as unknown as TypedSupabaseClient;
}

/**
 * Service role client for super_admin operations and Edge Function equivalents.
 * ⚠️ NEVER expose this to the client.
 */
export function createServiceClient(): TypedSupabaseClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  ) as unknown as TypedSupabaseClient;
}
