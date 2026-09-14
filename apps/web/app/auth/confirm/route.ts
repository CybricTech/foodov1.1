/**
 * GET /auth/confirm — Supabase SSR token_hash verification.
 *
 * Email links (password reset first and foremost) land here as
 *   /auth/confirm?token_hash=…&type=recovery&next=/reset-password
 *
 * We verify the one-time token server-side with verifyOtp, which establishes a
 * cookie session for whichever browser opened the link, then redirect to
 * `next`. This deliberately avoids the PKCE `?code=` flow: PKCE needs the code
 * verifier stored by the browser that REQUESTED the email, and reset emails are
 * routinely opened on a different device (a phone mail app, often launched
 * from the Kitchyn Merchant app's "Forgot password").
 *
 * Requires the Supabase "Reset Password" email template to link here with
 * {{ .TokenHash }} instead of {{ .ConfirmationURL }}.
 */
import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { safeRedirect } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

const EMAIL_OTP_TYPES: ReadonlySet<string> = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

const LINK_EXPIRED_PATH = "/forgot-password?error=link_expired";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // Only same-origin relative paths — never an absolute or protocol-relative URL.
  const next = safeRedirect(searchParams.get("next"), "/");

  if (tokenHash && type && EMAIL_OTP_TYPES.has(type)) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    console.warn(`[auth/confirm] verifyOtp failed type=${type}: ${error.message}`);
  }

  return NextResponse.redirect(new URL(LINK_EXPIRED_PATH, origin));
}
