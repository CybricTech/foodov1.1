import { NextRequest, NextResponse } from "next/server";

/**
 * Unauthenticated escape hatch for poisoned Supabase sessions.
 *
 * If a user lands on a 403 they can't escape because every signout button is
 * inside an authenticated nav, hitting GET /logout from any browser/tab will
 * delete every Supabase auth cookie and bounce them back to "/" — the
 * subdomain's middleware then redirects to the appropriate login page.
 */
export function GET(request: NextRequest) {
  const target = new URL(request.nextUrl.searchParams.get("to") ?? "/", request.url);
  const response = NextResponse.redirect(target);

  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  }

  return response;
}
