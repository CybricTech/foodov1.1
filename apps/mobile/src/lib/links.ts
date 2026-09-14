/**
 * Public kitchyn.app pages the app links out to. These are the same canonical
 * URLs submitted to App Store Connect / Play Console — keep them in sync.
 */
import { Linking } from "react-native";

// kitchyn.app / www.kitchyn.app is the separate marketing site (Vercel
// "landingpage" project). The Next.js app — legal pages, password reset, and
// the dashboard — is served on the dashboard subdomain.
export const MARKETING_URL = "https://www.kitchyn.app";
export const APP_ORIGIN = "https://dashboard.kitchyn.app";
export const PRIVACY_URL = `${APP_ORIGIN}/privacy`;
export const TERMS_URL = `${APP_ORIGIN}/terms`;
export const SUPPORT_URL = `${APP_ORIGIN}/support`;
export const FORGOT_PASSWORD_URL = `${APP_ORIGIN}/forgot-password`;
export const DASHBOARD_URL = `${APP_ORIGIN}/dashboard`;
export const SUPPORT_EMAIL = "admin@kitchyn.app";

export async function openLink(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    // No handler (e.g. no mail app configured) — nothing useful to do.
  }
}
