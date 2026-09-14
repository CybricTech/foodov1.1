/**
 * Public kitchyn.app pages the app links out to. These are the same canonical
 * URLs submitted to App Store Connect / Play Console — keep them in sync.
 */
import { Linking } from "react-native";

// www is the canonical host: the apex 307-redirects here.
export const WEB_URL = "https://www.kitchyn.app";
export const PRIVACY_URL = `${WEB_URL}/privacy`;
export const TERMS_URL = `${WEB_URL}/terms`;
export const SUPPORT_URL = `${WEB_URL}/support`;
export const FORGOT_PASSWORD_URL = `${WEB_URL}/forgot-password`;
export const DASHBOARD_URL = `${WEB_URL}/dashboard`;
export const SUPPORT_EMAIL = "admin@kitchyn.app";

export async function openLink(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    // No handler (e.g. no mail app configured) — nothing useful to do.
  }
}
