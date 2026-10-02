"use client";

import { useState } from "react";
import { cn } from "@foodo/ui";
import {
  formatPhoneDisplay,
  resolveRiderContact,
  type RiderContactFallbackReason,
  type RiderContactMode,
  type RiderContactSource,
  type RiderContactStatus,
} from "@foodo/utils";
import {
  displayPhone,
  merchantPhoneProblem,
  patchStoreRiderContact,
  RiderContactSwitch,
} from "./rider-contact-shared";

/**
 * Whose phone a Bolt driver gets when collecting from one store, from the
 * admin side: what drivers get right now, the "use this store's number"
 * switch, and the merchant's rider number (editable on their behalf).
 *
 * The same switch appears for every store in Settings › Dispatch. Both write
 * through the same route.
 *
 * "Right now" is computed with the same resolver the booking path uses
 * (resolveRiderContact), so this card can't disagree with what the next ride
 * actually goes out with.
 */

const SOURCE_LABEL: Record<RiderContactSource, string> = {
  merchant_custom: "Store's rider number",
  merchant_whatsapp: "Store's WhatsApp number",
  ops: "Kitchyn dispatch line",
};

const FALLBACK_LABEL: Record<RiderContactFallbackReason, string> = {
  rollout_off: "Settings › Dispatch is set to the Kitchyn line for every store.",
  not_selected: "This store isn't selected to use its own number.",
  no_number: "The store has no rider number and no WhatsApp number.",
  invalid_number: "The store's number isn't a Nigerian mobile a rider can ring.",
  lookup_failed: "The store's contact couldn't be read.",
};

const MODE_HINT: Record<RiderContactMode, string> = {
  selected:
    "Takes effect from the next booking. You can also pick stores from one list in Settings › Dispatch.",
  ops: "Settings › Dispatch is set to the Kitchyn line for every store, so this takes effect once it's back on selected stores.",
  merchant:
    "Every store currently gives drivers its own number, so this switch has no effect right now.",
};

export function MerchantRiderContactCard({
  restaurantId,
  restaurantName,
  initialStatus,
  initialSelected,
  mode,
  opsPhone,
}: {
  restaurantId: string;
  restaurantName: string;
  initialStatus: RiderContactStatus | null;
  initialSelected: boolean;
  mode: RiderContactMode;
  opsPhone: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [selected, setSelected] = useState(initialSelected);
  const [phoneDraft, setPhoneDraft] = useState(initialStatus?.customPhone ?? "");
  const [savingSelected, setSavingSelected] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [error, setError] = useState("");

  async function toggleSelected() {
    const next = !selected;
    setSelected(next); // optimistic; reverted below if the save fails
    setSavingSelected(true);
    setError("");
    try {
      const data = await patchStoreRiderContact(restaurantId, { selected: next });
      setSelected(data.selected);
      if (data.status) setStatus(data.status);
    } catch (e) {
      setSelected(!next);
      setError(e instanceof Error ? e.message : "Failed to save");
    }
    setSavingSelected(false);
  }

  async function savePhone(e: React.FormEvent) {
    e.preventDefault();
    setSavingPhone(true);
    setError("");
    try {
      const data = await patchStoreRiderContact(restaurantId, { phone: phoneDraft.trim() || null });
      if (data.status) {
        setStatus(data.status);
        setPhoneDraft(data.status.customPhone ?? "");
      }
      setPhoneSaved(true);
      setTimeout(() => setPhoneSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
    setSavingPhone(false);
  }

  if (!status) {
    return (
      <div className="border border-black-100 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-black-900">Rider contact</h2>
        <p className="text-xs text-cinnabar-500 mt-1">Couldn&apos;t load this store&apos;s rider contact.</p>
      </div>
    );
  }

  const now = resolveRiderContact({
    mode,
    selected,
    customPhone: status.customPhone,
    whatsappNumber: status.whatsappNumber,
    opsPhone,
  });
  const merchantIsContact = now.source !== "ops";
  const phoneDirty = (phoneDraft.trim() || null) !== (status.customPhone ?? null);
  const problem = merchantPhoneProblem(status.merchant, status.whatsappNumber);

  return (
    <div className="border border-black-100 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-black-900">Rider contact</h2>
          <p className="text-xs text-black-400 mt-0.5">
            Who a Bolt driver calls when collecting from this store. Bolt gives a ride one contact,
            and the driver treats it as the person at the pickup. The customer&apos;s number is in the
            driver note for the drop-off.
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
            merchantIsContact ? "bg-viridian-100 text-viridian-500" : "bg-black-100 text-black-500"
          )}
        >
          {merchantIsContact ? "Calls the store" : "Calls Kitchyn"}
        </span>
      </div>

      {/* What the very next booking goes out with. */}
      <div className="rounded-xl bg-black-50 px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-black-400">Drivers call now</p>
        <p className="text-sm font-semibold text-black-900 mt-0.5 tabular-nums">
          {formatPhoneDisplay(now.phone)}
        </p>
        <p className="text-xs text-black-500 mt-0.5">
          {SOURCE_LABEL[now.source]}
          {now.fallbackReason && <> · {FALLBACK_LABEL[now.fallbackReason]}</>}
        </p>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-black-900">Use this store&apos;s number</p>
          <p className="text-xs text-black-400 mt-0.5 leading-relaxed">{MODE_HINT[mode]}</p>
        </div>
        <RiderContactSwitch
          checked={selected}
          onToggle={toggleSelected}
          disabled={savingSelected}
          label={`Use ${restaurantName}'s number`}
        />
      </div>

      {/* Selecting a store whose number won't work just routes calls back to
          ops. Harmless, but not what the switch looks like it did. */}
      {problem && (
        <p className="text-xs text-black-900 bg-dixie-100 border border-dixie-500/40 rounded-xl px-3 py-2">
          {problem}, so this store&apos;s drivers will keep calling Kitchyn. Set a rider number below
          to fix it.
        </p>
      )}

      <form onSubmit={savePhone} className="space-y-1.5">
        <label className="block text-xs font-semibold text-black-500">Rider number</label>
        <div className="flex gap-2">
          <input
            type="tel"
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value)}
            placeholder="0803 123 4567"
            className="w-48 border border-black-200 rounded-xl px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={savingPhone || !phoneDirty}
            className="bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            {savingPhone ? "Saving…" : phoneSaved ? "Saved!" : "Save"}
          </button>
        </div>
        <p className="text-[11px] text-black-400">
          Leave blank to follow their WhatsApp number
          {status.whatsappNumber ? ` (${displayPhone(status.whatsappNumber)})` : ""}. The merchant can change this
          themselves in Settings.
        </p>
      </form>

      {error && <p className="text-xs text-cinnabar-500">{error}</p>}
    </div>
  );
}
