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
  //
  // Wrap in a 5s timeout so a Supabase connectivity issue never hangs the
  // middleware indefinitely. On timeout we skip the auth redirect and let the
  // request reach the Server Component, where getDashboardUser() runs its own
  // auth check and can still enforce access.
  //
  // PERF NOTE: getDashboardUser() calls supabase.auth.getUser() again — a second
  // ~600ms auth-server round-trip per request on top of this one (the single
  // biggest dashboard latency cost; see docs/performance-audit-2026-06.md). The
  // safe fix is migrating Supabase to asymmetric JWT signing keys so both calls
  // verify the token locally via getClaims() instead of over the network.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  let authCheckFailed = false;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("supabase_timeout")), 5000)
      ),
    ]);
    user = result.data.user;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "supabase_timeout") {
      console.warn("[middleware] Supabase unreachable — skipping auth redirect, Server Components will handle auth");
      authCheckFailed = true;
    } else {
      console.error("[middleware] getUser error:", msg);
    }
  }

  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") ?? "";

  // Copy supabaseResponse cookies onto any new response we create.
  // Per Supabase SSR docs: every response returned from middleware MUST carry
  // the same Set-Cookie headers as supabaseResponse, otherwise the browser and
  // server go out of sync and the session gets stuck in a broken/403 state.
  function withSessionCookies(res: NextResponse): NextResponse {
    supabaseResponse.cookies.getAll().forEach(({ name, value }) => {
      res.cookies.set(name, value);
    });
    return res;
  }

  // If Supabase definitively reported "no user" but the request carries auth
  // cookies, the cookies are poisoned — clear them so the user isn't trapped
  // in a permanent 403 state. (Skip when authCheckFailed: that's a Supabase
  // outage, not a bad cookie, so don't punish the user for it.)
  function clearPoisonedAuthCookies(res: NextResponse) {
    if (user || authCheckFailed) return;
    for (const c of request.cookies.getAll()) {
      if (c.name.startsWith("sb-")) {
        res.cookies.set(c.name, "", { maxAge: 0, path: "/" });
      }
    }
  }

  // ─── Subdomain routing ─────────────────────────────────────────────────────
  const isDashboardSub = hostname === "dashboard.kitchyn.app";
  const isAdminSub     = hostname === "admin.kitchyn.app";
  // Reserved subdomains that are NOT restaurant storefronts. "staging" is the
  // staging environment and must behave like the apex domain (path-based slug
  // routing, e.g. /get-drizzys), not be treated as a restaurant named "staging".
  const isReservedSub  =
    hostname === "www.kitchyn.app" || hostname === "staging.kitchyn.app";
  const isStorefrontSub =
    hostname.endsWith(".kitchyn.app") &&
    !isDashboardSub &&
    !isAdminSub &&
    !isReservedSub;

  // dashboard.kitchyn.app/ → redirect to /dashboard (all /dashboard/* paths work as-is)
  if (isDashboardSub && pathname === "/") {
    return withSessionCookies(NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  // admin.kitchyn.app/ → redirect to /admin
  if (isAdminSub && pathname === "/") {
    return withSessionCookies(NextResponse.redirect(new URL("/admin", request.url)));
  }

  // slug.kitchyn.app/* → rewrite to /{slug}/*  (but NOT /api/* or /ingest/*
  // paths). /ingest is the PostHog reverse proxy (see next.config.mjs rewrites)
  // — rewriting it to /{slug}/ingest breaks client-side analytics on storefront
  // subdomains, so only server-side events would ever reach PostHog.
  if (isStorefrontSub) {
    const slug = hostname.replace(".kitchyn.app", "");
    if (
      !pathname.startsWith("/api") &&
      !pathname.startsWith("/ingest") &&
      !pathname.startsWith(`/${slug}`)
    ) {
      const rewritePath = pathname === "/" ? `/${slug}` : `/${slug}${pathname}`;
      const rewriteRes = withSessionCookies(NextResponse.rewrite(new URL(rewritePath, request.url)));
      clearPoisonedAuthCookies(rewriteRes);
      return rewriteRes;
    }
  }

  // ─── Merchant Dashboard guard ──────────────────────────────────────────────
  if (pathname.startsWith("/dashboard") && !pathname.startsWith("/dashboard/login")) {
    // Only redirect to login if we know for certain the user is unauthenticated.
    // If getUser() timed out (authCheckFailed), let the Server Component handle
    // auth via getSession() (cookie-based, no network needed).
    if (!user && !authCheckFailed) {
      const loginUrl = new URL("/dashboard/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      const redirectRes = withSessionCookies(NextResponse.redirect(loginUrl));
      clearPoisonedAuthCookies(redirectRes);
      return redirectRes;
    }
  }

  // ─── Super Admin guard ─────────────────────────────────────────────────────
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    if (!user && !authCheckFailed) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      const redirectRes = withSessionCookies(NextResponse.redirect(loginUrl));
      clearPoisonedAuthCookies(redirectRes);
      return redirectRes;
    }
  }

  // Clear poisoned cookies on all routes (including storefront) so a stale
  // Supabase session on *.kitchyn.app doesn't keep sending large cookie headers
  // that trigger Vercel's WAF — the root cause of the recurring storefront 403.
  clearPoisonedAuthCookies(supabaseResponse);
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
