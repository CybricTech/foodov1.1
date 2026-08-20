"use client";

import { useState } from "react";
import { Loader2, MapPin, Check } from "lucide-react";

/**
 * Choosing where a rider should collect from.
 *
 * Bolt names a pickup by reverse-geocoding whatever coordinate we send — it has
 * no venue name for any of our stores, so the rider is told a street. That
 * street changes with the pin, often within 30 metres: By Sophie's
 * Confectionary reads "Bala Sokoto Way" at its storefront centroid and
 * "260 Adamu Ciroma Crescent" a short step east.
 *
 * Rather than asking anyone to reason about coordinates, this offers the labels
 * actually reachable around the store and asks the one question the person on
 * the ground can answer: which street is your entrance on?
 *
 * Used by both merchant Settings and the admin merchant page. The two differ
 * only in the endpoint and whether a restaurantId travels with the request.
 */

interface Candidate {
  label: string;
  lat: number;
  lng: number;
  distanceM: number;
  direction: string;
}

interface Options {
  current: { lat: number; lng: number; label: string | null; isStorefront: boolean };
  candidates: Candidate[];
}

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
  const [options, setOptions] = useState<Options | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");

  const currentLabel = saved ?? initialLabel;
  const isStorefront = saved !== null ? false : initialIsStorefront;

  async function loadOptions() {
    setLoading(true);
    setError("");
    try {
      const url = restaurantId
        ? `${endpoint}?restaurantId=${encodeURIComponent(restaurantId)}`
        : endpoint;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load pickup options");
      } else {
        setOptions(data as Options);
        setSelected(null);
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  async function save(candidate: Candidate) {
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
        setSaved(data.label ?? candidate.label);
        setOptions(null);
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
            {currentLabel ?? "— not checked yet —"}
          </p>
          {isStorefront && currentLabel && (
            <p className="text-black-400 mt-0.5">This is your store address pin.</p>
          )}
        </div>
      </div>

      {!options && (
        <button
          type="button"
          onClick={loadOptions}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-black-100 hover:bg-black-200 disabled:opacity-60 text-black-900 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? "Checking nearby spots…" : "Check nearby pickup spots"}
        </button>
      )}

      {options && (
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

          <div className="space-y-1.5">
            {options.candidates.map((c) => {
              const key = `${c.lat},${c.lng}`;
              const active = selected === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                    active
                      ? "border-purple-500 bg-purple-50"
                      : "border-black-100 hover:border-black-200"
                  }`}
                >
                  <span className="block text-sm font-medium text-black-900">{c.label}</span>
                  <span className="block text-xs text-black-400 mt-0.5">
                    {c.distanceM === 0
                      ? "Your store address pin"
                      : `${c.distanceM}m ${c.direction}`}
                  </span>
                </button>
              );
            })}
          </div>

          {error && <p className="text-xs text-cinnabar-500">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!selected || saving}
              onClick={() => {
                const c = options.candidates.find((x) => `${x.lat},${x.lng}` === selected);
                if (c) save(c);
              }}
              className="inline-flex items-center gap-2 bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Saving…" : "Save pickup point"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOptions(null);
                setError("");
              }}
              className="text-sm text-black-500 hover:text-black-900 px-2 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {saved && !options && (
        <p className="inline-flex items-center gap-1.5 text-xs text-viridian-600 font-medium">
          <Check className="w-3.5 h-3.5" />
          Saved. Riders will now be told {saved}.
        </p>
      )}

      {error && !options && <p className="text-xs text-cinnabar-500">{error}</p>}
    </div>
  );
}
