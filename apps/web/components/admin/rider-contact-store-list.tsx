"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@foodo/ui";
import {
  formatPhoneDisplay,
  resolveMerchantRiderPhone,
  type RiderContactMode,
} from "@foodo/utils";
import {
  merchantPhoneProblem,
  patchStoreRiderContact,
  RiderContactSwitch,
} from "./rider-contact-shared";

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/** One active store, as loaded by admin/(protected)/settings/page.tsx. */
export interface RiderContactStoreRow {
  id: string;
  name: string;
  isTest: boolean;
  whatsappNumber: string | null;
  customPhone: string | null;
  selected: boolean;
}

/**
 * Every active store with its own "use this store's number" switch, so the
 * selection can be made in one place instead of merchant by merchant.
 *
 * Each switch saves on its own, immediately, through the same route as the
 * switch on the merchant's page. It is independent of the "Save dispatch
 * settings" button, which only covers the platform-wide fields.
 *
 * Each row shows the number drivers would get once the store is selected, or
 * why there isn't one. Selecting a store with no usable number is allowed (the
 * number can be fixed afterwards), but it's flagged, because until then its
 * drivers keep calling Kitchyn, whatever the switch shows.
 */
export function RiderContactStoreList({
  stores,
  mode,
}: {
  /** null when the stores couldn't be loaded, e.g. the migration hasn't run. */
  stores: RiderContactStoreRow[] | null;
  /** The mode currently chosen above (saved or not), for the explanatory note. */
  mode: RiderContactMode;
}) {
  const [rows, setRows] = useState(stores ?? []);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  if (stores === null) {
    return (
      <p className="text-xs text-black-500 bg-black-50 rounded-xl px-3 py-2.5">
        The store list couldn&apos;t be loaded. If migration 20261002120000 hasn&apos;t been applied
        yet, apply it and reload this page.
      </p>
    );
  }

  const selectedCount = rows.filter((r) => r.selected).length;

  async function toggle(store: RiderContactStoreRow) {
    const next = !store.selected;
    const setRow = (selected: boolean) =>
      setRows((prev) => prev.map((r) => (r.id === store.id ? { ...r, selected } : r)));

    setRow(next); // optimistic; reverted below if the save fails
    setSaving((s) => ({ ...s, [store.id]: true }));
    setErrors((s) => without(s, store.id));
    try {
      const data = await patchStoreRiderContact(store.id, { selected: next });
      setRow(data.selected);
    } catch (e) {
      setRow(!next);
      setErrors((s) => ({ ...s, [store.id]: e instanceof Error ? e.message : "Failed to save" }));
    }
    setSaving((s) => without(s, store.id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-black-900">Stores</p>
          <p className="text-xs text-black-400 mt-0.5">
            {selectedCount === 0
              ? "None selected"
              : `${selectedCount} of ${rows.length} selected`}{" "}
            · switches save instantly
          </p>
        </div>
        {rows.length > 8 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // This list lives inside the Dispatch form. Without this, Enter in
            // the search box would submit (and save) the whole form.
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder="Find a store"
            aria-label="Find a store"
            className="w-40 border border-black-200 rounded-xl px-3 py-1.5 text-sm"
          />
        )}
      </div>

      {mode !== "selected" && (
        <p className="text-xs text-black-500 bg-black-50 rounded-xl px-3 py-2 leading-relaxed">
          {mode === "ops"
            ? "With “Kitchyn line for every store” chosen above, these switches are remembered but not used. Every driver calls the Kitchyn line."
            : "With “Every store calls the merchant” chosen above, every store uses its own number whether it's switched on here or not."}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-black-400">No active stores.</p>
      ) : (
        <ul className="divide-y divide-black-100 border border-black-200 rounded-xl overflow-hidden">
          {visible.map((store) => {
            const merchant = resolveMerchantRiderPhone({
              customPhone: store.customPhone,
              whatsappNumber: store.whatsappNumber,
            });
            const problem = merchantPhoneProblem(merchant, store.whatsappNumber);
            return (
              <li key={store.id} className={cn("px-3 py-2.5", store.selected && "bg-purple-50")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-black-900 truncate">
                      <Link href={`/admin/merchants/${store.id}`} className="hover:underline">
                        {store.name}
                      </Link>
                      {store.isTest && (
                        <span className="ml-2 align-middle text-[10px] font-medium text-black-500 bg-black-100 px-1.5 py-0.5 rounded">
                          Test
                        </span>
                      )}
                    </p>
                    {merchant.ok ? (
                      <p className="text-xs text-black-500 mt-0.5 tabular-nums">
                        {formatPhoneDisplay(merchant.phone)}
                        <span className="text-black-400">
                          {" "}
                          · {merchant.source === "merchant_custom" ? "rider number" : "WhatsApp"}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-1">
                        <span className="inline-block text-[11px] text-black-900 bg-dixie-100 border border-dixie-500/40 rounded-md px-1.5 py-0.5">
                          {problem}. Drivers keep calling Kitchyn.
                        </span>
                      </p>
                    )}
                  </div>
                  <RiderContactSwitch
                    checked={store.selected}
                    onToggle={() => toggle(store)}
                    disabled={!!saving[store.id]}
                    label={`Use ${store.name}'s number`}
                  />
                </div>
                {errors[store.id] && (
                  <p className="text-xs text-cinnabar-500 mt-1">{errors[store.id]}</p>
                )}
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-3 py-2.5 text-xs text-black-400">No stores match “{query}”.</li>
          )}
        </ul>
      )}
    </div>
  );
}
