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
  const hostname = request.headers.get("host") ?? "";

  // ─── Subdomain routing ─────────────────────────────────────────────────────
  const isDashboardSub = hostname === "dashboard.kitchyn.app";
  const isAdminSub     = hostname === "admin.kitchyn.app";
  const isStorefrontSub =
    hostname.endsWith(".kitchyn.app") && !isDashboardSub && !isAdminSub;

  // dashboard.kitchyn.app/ → redirect to /dashboard (all /dashboard/* paths work as-is)
  if (isDashboardSub && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // admin.kitchyn.app/ → redirect to /admin
  if (isAdminSub && pathname === "/") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  // slug.kitchyn.app/* → rewrite to /{slug}/*  (but NOT /api/* paths)
  if (isStorefrontSub) {
    const slug = hostname.replace(".kitchyn.app", "");
    if (!pathname.startsWith("/api") && !pathname.startsWith(`/${slug}`)) {
      const rewritePath = pathname === "/" ? `/${slug}` : `/${slug}${pathname}`;
      const response = NextResponse.rewrite(new URL(rewritePath, request.url));
      supabaseResponse.cookies.getAll().forEach((c) => {
        response.cookies.set(c.name, c.value);
      });
      return response;
    }
  }

  // ─── Merchant Dashboard guard ──────────────────────────────────────────────
  if (pathname.startsWith("/dashboard") && !pathname.startsWith("/dashboard/login")) {
    if (!user) {
      const loginUrl = new URL("/dashboard/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ─── Super Admin guard ─────────────────────────────────────────────────────
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
