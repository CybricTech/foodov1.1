/**
 * Next.js Middleware — Auth guards + session refresh.
 *
 * Routes:
 *   /dashboard/* — requires authenticated merchant_owner or merchant_staff
 *   /admin/*     — requires authenticated super_admin
 *   /[slug]/*    — public; slug validation happens in the layout Server Component
 *   /delivery/*  — public; token validation happens in the page Server Component
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@foodo/database";
import type { CookieOptions } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env vars are missing, skip auth checks and let the request through
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase env vars in middleware");
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT add logic between createServerClient and getUser().
  // Refer to: https://supabase.com/docs/guides/auth/server-side/nextjs
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ─── Merchant Dashboard guard ──────────────────────────────────────────────
  if (pathname.startsWith("/dashboard") && !pathname.startsWith("/dashboard/login")) {
    if (!user) {
      const loginUrl = new URL("/dashboard/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Verify role (merchant_owner or merchant_staff)
    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const profile = profileData as { role: string } | null;

    if (
      !profile ||
      !["merchant_owner", "merchant_staff"].includes(profile.role)
    ) {
      return NextResponse.redirect(new URL("/dashboard/login", request.url));
    }
  }

  // ─── Super Admin guard ─────────────────────────────────────────────────────
  // Only check session here. Role verification (super_admin) is done in the
  // layout server component using the service client — more reliable and not
  // subject to RLS or prefetch-request timing issues.
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    if (!user) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
