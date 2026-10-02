import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMerchantRiderContactLive,
  resolveMerchantRiderPhone,
  resolveRiderContact,
  resolveRiderContactMode,
  type ResolvedRiderContact,
  type RiderContactMode,
  type RiderContactStatus,
} from "@foodo/utils";

/**
 * Server-side loaders for whose phone a Bolt driver gets at the pickup. The
 * decision itself is pure and tested in @foodo/utils (rider-contact.ts). This
 * file only fetches its inputs.
 *
 * Used by the API booking path (user.phone on /rides/create) and the
 * merchant's Settings, so both agree on the number. Deliberately NOT used by
 * the Telegram manual-booking alert (lib/telegram.ts) or buildDriverNote —
 * those stay exactly as they were, unaffected by this rollout.
 */

interface StoreContactRow {
  whatsapp_number: string | null;
  rider_contact_phone: string | null;
  rider_contact_selected: boolean | null;
}

/**
 * The contact to book a ride with. Never throws, and never returns an
 * unbookable number: anything that goes wrong reading the store's fields
 * becomes the ops line with fallbackReason "lookup_failed". A failed read here
 * costs ops a phone call. It must never cost a delivery.
 *
 * `settings` comes from readBoltSettings, which callers already hold.
 */
export async function loadRiderContact(
  supabase: SupabaseClient,
  restaurantId: string,
  settings: { riderContactMode: RiderContactMode; riderPhone: string }
): Promise<ResolvedRiderContact> {
  const ops = (fallbackReason: ResolvedRiderContact["fallbackReason"]): ResolvedRiderContact => ({
    phone: settings.riderPhone,
    source: "ops",
    fallbackReason,
  });

  // With the rollout off there is nothing to look up, and skipping the query
  // also keeps this path working on a database the migration hasn't reached.
  if (settings.riderContactMode === "ops") return ops("rollout_off");

  const { data, error } = await supabase
    .from("restaurants")
    .select("whatsapp_number, rider_contact_phone, rider_contact_selected")
    .eq("id", restaurantId)
    .single();

  if (error || !data) {
    console.warn(
      `[rider-contact] could not read store contact restaurant=${restaurantId} — using ops line: ${error?.message ?? "no row"}`
    );
    return ops("lookup_failed");
  }

  const row = data as StoreContactRow;
  return resolveRiderContact({
    mode: settings.riderContactMode,
    selected: row.rider_contact_selected === true,
    customPhone: row.rider_contact_phone,
    whatsappNumber: row.whatsapp_number,
    opsPhone: settings.riderPhone,
  });
}

/**
 * Everything the merchant's Settings needs to show the rider-contact section:
 * what they've chosen, what that resolves to, and whether it's live yet.
 *
 * Must be given the service client. platform_settings is admin-only under RLS,
 * so a merchant's own session can't read the rollout mode.
 */
export async function getRiderContactStatus(
  serviceClient: SupabaseClient,
  restaurantId: string
): Promise<RiderContactStatus | null> {
  const [{ data: store, error: storeErr }, { data: settings }] = await Promise.all([
    serviceClient
      .from("restaurants")
      .select("whatsapp_number, rider_contact_phone, rider_contact_selected")
      .eq("id", restaurantId)
      .single(),
    serviceClient.from("platform_settings").select("*").single(),
  ]);

  if (storeErr || !store) return null;

  const row = store as StoreContactRow;
  const mode = resolveRiderContactMode(
    (settings as { bolt_rider_contact_mode?: unknown } | null)?.bolt_rider_contact_mode
  );

  return {
    customPhone: row.rider_contact_phone,
    whatsappNumber: row.whatsapp_number,
    live: isMerchantRiderContactLive(mode, row.rider_contact_selected === true),
    merchant: resolveMerchantRiderPhone({
      customPhone: row.rider_contact_phone,
      whatsappNumber: row.whatsapp_number,
    }),
  };
}
