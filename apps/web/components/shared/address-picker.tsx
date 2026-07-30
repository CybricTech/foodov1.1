"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@foodo/ui";
import { Check, Loader2, MapPin, TriangleAlert } from "lucide-react";

/**
 * Google Places address picker.
 *
 * Coordinates are derived from a *picked* place, never typed. Typing into the
 * box invalidates the current selection, so a stale pin can never survive an
 * edited address — the same invariant checkout relies on to keep the
 * wrong-street geocode bug (GD-1331) structurally impossible.
 *
 * Server-proxied via /api/places/* so the Maps key stays server-side and the
 * page ships no Maps SDK.
 */

export interface VerifiedAddress {
  address: string;
  lat: number;
  lng: number;
  placeId: string;
}

export function AddressPicker({
  initialAddress,
  initialLat,
  initialLng,
  initialVerified,
  label = "Address",
  hint,
  disabled,
  onSelect,
  onInvalidate,
}: {
  initialAddress: string | null;
  initialLat: number | null;
  initialLng: number | null;
  /** True when the stored coordinates came from a picked place. */
  initialVerified: boolean;
  label?: string;
  hint?: string;
  disabled?: boolean;
  onSelect: (value: VerifiedAddress) => void;
  /** Fired when the text is edited, clearing any previously picked place. */
  onInvalidate?: () => void;
}) {
  const [input, setInput] = useState(initialAddress ?? "");
  const [predictions, setPredictions] = useState<
    { description: string; placeId: string }[]
  >([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");

  // The place picked in *this* session. Null means we're still showing
  // whatever was stored, whose trustworthiness is `initialVerified`.
  const [picked, setPicked] = useState<VerifiedAddress | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  function handleChange(value: string) {
    setInput(value);
    setError("");
    // Editing the text invalidates the picked place and its coordinates.
    if (picked) {
      setPicked(null);
      onInvalidate?.();
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 3) {
      abortRef.current?.abort();
      setPredictions([]);
      setShowPredictions(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      // Cancel any in-flight lookup so an out-of-order response can't
      // overwrite suggestions for newer input.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/places/autocomplete?input=${encodeURIComponent(value)}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          setPredictions([]);
          setShowPredictions(false);
          setSearching(false);
          return;
        }
        const data = await res.json();
        const mapped = ((data.suggestions ?? []) as {
          description: string;
          placeId: string;
        }[]).filter((s) => s.description && s.placeId);
        setPredictions(mapped);
        setShowPredictions(mapped.length > 0);
        setSearching(false);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPredictions([]);
        setShowPredictions(false);
        setSearching(false);
      }
    }, 300);
  }

  async function selectPrediction(description: string, placeId: string) {
    setInput(description);
    setPredictions([]);
    setShowPredictions(false);
    setSearching(false);
    setResolving(true);
    setError("");
    try {
      const res = await fetch(
        `/api/places/resolve?placeId=${encodeURIComponent(placeId)}`
      );
      if (!res.ok) {
        setError("Could not pin that address — pick another suggestion.");
        setResolving(false);
        return;
      }
      const data = (await res.json()) as {
        lat: number;
        lng: number;
        formattedAddress: string | null;
      };
      const value: VerifiedAddress = {
        address: data.formattedAddress ?? description,
        lat: data.lat,
        lng: data.lng,
        placeId,
      };
      setInput(value.address);
      setPicked(value);
      onSelect(value);
    } catch {
      setError("Network error — try again.");
    }
    setResolving(false);
  }

  const activeLat = picked?.lat ?? initialLat;
  const activeLng = picked?.lng ?? initialLng;
  const isVerified = picked !== null || initialVerified;
  const hasCoords = activeLat !== null && activeLng !== null;

  return (
    <div>
      <label className="block text-xs font-medium text-black-500 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          value={input}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setTimeout(() => setShowPredictions(false), 150)}
          onFocus={() => {
            if (predictions.length > 0) setShowPredictions(true);
          }}
          placeholder="Start typing your street, estate or a landmark"
          autoComplete="off"
          className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500 disabled:opacity-60"
        />
        {showPredictions && predictions.length > 0 && (
          <div className="absolute z-50 w-full bg-white border border-black-200 rounded-xl shadow-lg mt-1 overflow-hidden">
            {predictions.map((p) => (
              <button
                key={p.placeId}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void selectPrediction(p.description, p.placeId);
                }}
                className="w-full text-left px-4 py-3 text-sm text-black-900 hover:bg-black-50 border-b border-black-50 last:border-0 cursor-pointer transition-colors"
              >
                <div className="flex items-start gap-2">
                  <MapPin
                    size={13}
                    className="text-black-400 mt-0.5 flex-shrink-0"
                  />
                  {p.description}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {hint && <p className="text-xs text-black-400 mt-1">{hint}</p>}

      {searching && (
        <p className="text-xs text-black-400 mt-1 flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> Searching addresses…
        </p>
      )}
      {resolving && (
        <p className="text-xs text-black-400 mt-1 flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> Pinning location…
        </p>
      )}
      {!searching &&
        !resolving &&
        input.trim().length >= 3 &&
        predictions.length === 0 &&
        !isVerified && (
          <p className="text-xs text-black-400 mt-1">
            No registered places match — try the area, estate or a nearby
            landmark.
          </p>
        )}

      {error && <p className="text-xs text-cinnabar-500 mt-1">{error}</p>}

      {!searching && !resolving && hasCoords && (
        <div
          className={cn(
            "mt-2 rounded-xl px-3 py-2 flex items-start gap-2",
            isVerified ? "bg-viridian-50" : "bg-dixie-50"
          )}
        >
          {isVerified ? (
            <Check
              size={13}
              className="text-viridian-600 mt-0.5 flex-shrink-0"
            />
          ) : (
            <TriangleAlert
              size={13}
              className="text-dixie-600 mt-0.5 flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <p
              className={cn(
                "text-xs font-medium",
                isVerified ? "text-viridian-700" : "text-dixie-700"
              )}
            >
              {isVerified ? "Location confirmed" : "Location unconfirmed"}
            </p>
            <p className="text-xs text-black-400">
              {Number(activeLat).toFixed(6)}, {Number(activeLng).toFixed(6)}
              {!isVerified && " — pick your address above to confirm it"}
            </p>
          </div>
        </div>
      )}

      {!hasCoords && !searching && !resolving && (
        <div className="mt-2 rounded-xl px-3 py-2 bg-dixie-50 flex items-start gap-2">
          <TriangleAlert
            size={13}
            className="text-dixie-600 mt-0.5 flex-shrink-0"
          />
          <div>
            <p className="text-xs font-medium text-dixie-700">
              Location not set
            </p>
            <p className="text-xs text-black-400">
              Delivery fees fall back to the flat base rate until this is set.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
