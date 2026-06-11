/**
 * Native intent helpers — call the customer and open their address in maps.
 *
 * Web frontline uses `<a href="tel:…">`; on mobile we use Linking. Maps is
 * platform-appropriate: Apple Maps on iOS, the geo: scheme on Android (falls
 * back to a Google Maps web URL if no maps app handles it).
 */
import { Linking, Platform } from "react-native";

export async function callCustomer(phone: string | null | undefined): Promise<void> {
  if (!phone) return;
  const url = `tel:${phone.replace(/\s+/g, "")}`;
  try {
    await Linking.openURL(url);
  } catch {
    // No dialer (e.g. tablet) — silently ignore.
  }
}

export async function openInMaps(address: string | null | undefined): Promise<void> {
  if (!address) return;
  const query = encodeURIComponent(address);
  const native =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?q=${query}`
      : `geo:0,0?q=${query}`;
  const fallback = `https://www.google.com/maps/search/?api=1&query=${query}`;
  try {
    const supported = await Linking.canOpenURL(native);
    await Linking.openURL(supported ? native : fallback);
  } catch {
    try {
      await Linking.openURL(fallback);
    } catch {
      // No browser/maps app — ignore.
    }
  }
}
