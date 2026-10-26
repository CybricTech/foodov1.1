"use client";

import { useState } from "react";
import { Loader2, MapPin, Check, Map as MapIcon } from "lucide-react";
import { GOOGLE_MAPS_BROWSER_KEY, loadGoogleMaps } from "@/lib/maps/load-google-maps";
import { PickupPointMap } from "@/components/shared/pickup-point-map";
import {
  CandidateList,
  candidateKey,
  type PickupCandidateOption,
  type PickupOptionsResponse,
} from "@/components/shared/pickup-point-candidate-list";

/**
 * Choosing where a rider should collect from.
 *
 * Bolt names a pickup by reverse-geocoding whatever coordinate we send — it has
 * no venue name for any of our stores, so the rider is told a street. That
 * street changes with the pin, often within 30 metres: By Sophie's
 * Confectionary reads "Bala Sokoto Way" at its storefront centroid and
 * "260 Adamu Ciroma Crescent" a short step east.
 *
 * The primary control is a satellite map with a draggable pin (PickupPointMap):
 * the merchant puts the pin on their gate and sees, before saving, the street
 * Bolt will give for that exact spot. That handles what a street list can't —
 * a gate on a corner, a back entrance, a shared compound.
 *
 * The street list is the fallback whenever the map can't be shown (no browser
 * key configured, script blocked, key rejected), so the setting never
 * disappears; on the map it remains as a shortcut that moves the pin.
 *
 * Used by both merchant Settings and the admin merchant page. The two differ
 * only in the endpoint and whether a restaurantId travels with the request.
 */

type Mode = "idle" | "loading" | "map" | "list";

export function PickupPointPicker({
  endpoint,
  restaurantId,
  initialLabel,
  initialIsStorefront,
}: {
  endpoint: string;
  /** Admin callers only — merchants act on their own store implicitly. */
  restaurantId?: string;
  initialLabel: string | null;
  initialIsStorefront: boolean;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [options, setOptions] = useState<PickupOptionsResponse | null>(null);
  const [status, setStatus] = useState({ label: initialLabel, isStorefront: initialIsStorefront });
  const [justSaved, setJustSaved] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Decided at build time: without a browser key there is no map to try.
  const mapAvailable = Boolean(GOOGLE_MAPS_BROWSER_KEY);

  async function fetchOptions(withCandidates: boolean): Promise<PickupOptionsResponse | null> {
    const params = new URLSearchParams();
    if (restaurantId) params.set("restaurantId", restaurantId);
    if (!withCandidates) params.set("candidates", "0");
    const qs = params.toString();
    try {
      const res = await fetch(qs ? `${endpoint}?${qs}` : endpoint);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load pickup options");
        return null;
      }
      return data as PickupOptionsResponse;
    } catch {
      setError("Network error");
      return null;
    }
  }

  async function open() {
    setMode("loading");
    setError("");
    setJustSaved(false);

    // The script download and the store lookup don't depend on each other, so
    // run them side by side. The map skips the street probe — it only needs the
    // store and the current point, and the probe is the slow part.
    const mapsReady = mapAvailable
      ? loadGoogleMaps().then(
          () => true,
          (err) => {
            console.warn("[pickup] map unavailable, using street list:", err);
            return false;
          }
        )
      : Promise.resolve(false);
    const data = await fetchOptions(!mapAvailable);
    const ready = await mapsReady;

    if (!data) {
      setMode("idle");
      return;
    }
    if (ready) {
      setOptions(data);
      setMode("map");
      return;
    }
    await openList(mapAvailable ? null : data);
  }

  /** The no-map path: the original street picker. Fetches candidates if we skipped them. */
  async function openList(prefetched: PickupOptionsResponse | null) {
    setMode("loading");
    const data = prefetched ?? (await fetchOptions(true));
    if (!data) {
      setMode("idle");
      return;
    }
    setOptions(data);
    setSelected(null);
    setMode("list");
  }

  function close() {
    setOptions(null);
    setError("");
    setMode("idle");
  }

  function handleSaved(next: { label: string | null; isStorefront: boolean }) {
    setStatus(next);
    setJustSaved(true);
    close();
  }

  async function saveCandidate(candidate: PickupCandidateOption) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(restaurantId ? { restaurantId } : {}),
          // The storefront option clears the override rather than storing a
          // duplicate of the address coordinates, so a later address change
          // carries the pickup point with it instead of stranding it.
          latitude: candidate.distanceM === 0 ? null : candidate.lat,
          longitude: candidate.distanceM === 0 ? null : candidate.lng,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save pickup point");
      } else {
        handleSaved({
          label: data.label ?? candidate.label,
          isStorefront: candidate.distanceM === 0,
        });
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 bg-black-50 rounded-xl px-3 py-2.5">
        <MapPin className="w-4 h-4 text-black-400 mt-0.5 shrink-0" />
        <div className="text-xs">
          <p className="text-black-500">Riders are currently told:</p>
          <p className="font-semibold text-black-900 mt-0.5">
            {status.label ?? "— not checked yet —"}
          </p>
          {status.isStorefront && status.label && (
            <p className="text-black-400 mt-0.5">This is your store address pin.</p>
          )}
        </div>
      </div>

      {(mode === "idle" || mode === "loading") && (
        <button
          type="button"
          onClick={open}
          disabled={mode === "loading"}
          className="inline-flex items-center gap-2 bg-black-100 hover:bg-black-200 disabled:opacity-60 text-black-900 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          {mode === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            mapAvailable && <MapIcon className="w-4 h-4" />
          )}
          {mode === "loading"
            ? mapAvailable
              ? "Loading map…"
              : "Checking nearby spots…"
            : mapAvailable
              ? "Set pickup point on the map"
              : "Check nearby pickup spots"}
        </button>
      )}

      {mode === "map" && options && (
        <PickupPointMap
          options={options}
          endpoint={endpoint}
          restaurantId={restaurantId}
          onSaved={handleSaved}
          onCancel={close}
          onUnavailable={() => openList(null)}
        />
      )}

      {mode === "list" && options && (
        <div className="space-y-2">
          <p className="text-xs text-black-500">
            Pick the street your entrance is on. Riders are sent to that exact spot.
          </p>

          {options.candidates.length <= 1 && (
            <p className="text-xs text-black-400">
              Only one address is available within 100m of this store, so there is nothing
              to change — riders already get the closest name there is.
            </p>
          )}

          <CandidateList
            candidates={options.candidates}
            selectedKey={selected}
            onSelect={(c) => setSelected(candidateKey(c))}
          />

          {error && <p className="text-xs text-cinnabar-500">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!selected || saving}
              onClick={() => {
                const c = options.candidates.find((x) => candidateKey(x) === selected);
                if (c) saveCandidate(c);
              }}
              className="inline-flex items-center gap-2 bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Saving…" : "Save pickup point"}
            </button>
            <button
              type="button"
              onClick={close}
              className="text-sm text-black-500 hover:text-black-900 px-2 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {justSaved && mode === "idle" && (
        <p className="inline-flex items-center gap-1.5 text-xs text-viridian-600 font-medium">
          <Check className="w-3.5 h-3.5" />
          {status.label
            ? `Saved. Riders will now be told ${status.label}.`
            : status.isStorefront
              ? "Saved. Riders will go to your store address."
              : "Saved. Riders will be sent to your pin."}
        </p>
      )}

      {error && mode !== "list" && <p className="text-xs text-cinnabar-500">{error}</p>}
    </div>
  );
}
