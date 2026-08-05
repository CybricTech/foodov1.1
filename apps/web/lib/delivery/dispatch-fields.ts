/**
 * The rider-side fields a merchant client needs echoed back to it.
 *
 * Both dashboard write routes can request a rider as a side effect — Mark Ready
 * at a platform merchant (update-status) and the hybrid picker (dispatch) — and
 * when they do, three columns change that the caller cannot predict:
 * dispatch_type, dispatch_state and rider_requested_at.
 *
 * Clients used to guess at them in their optimistic update and guess wrong, so
 * the "Kitchyn rider handling" pill never appeared and the merchant was left
 * tapping a button that had already done its job. Returning the row as it
 * actually stands after the write removes the guess: the client applies facts,
 * not predictions, and is correct even when Realtime is down or the tab is
 * offline.
 *
 * Read AFTER the write, deliberately — a rider request fired by that same
 * request must be reflected, which is the whole point.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrderDispatchFields {
  /** NOT NULL in the database — safe for a client to apply straight onto a row. */
  status: string;
  dispatch_type: string | null;
  dispatch_state: string | null;
  rider_requested_at: string | null;
}

export async function readOrderDispatchFields(
  supabase: SupabaseClient,
  orderId: string
): Promise<OrderDispatchFields | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("status, dispatch_type, dispatch_state, rider_requested_at")
    .eq("id", orderId)
    .single();

  // Never fatal: the write already succeeded, and a client that gets no echo
  // simply falls back to Realtime or its next refetch. Failing the request here
  // would tell the merchant their action failed when it did not.
  if (error || !data) {
    console.error(
      `[dispatch-fields] could not read back order=${orderId}: ${error?.message ?? "no row"}`
    );
    return null;
  }

  return data as unknown as OrderDispatchFields;
}
