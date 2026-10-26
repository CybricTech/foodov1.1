"use client";

/**
 * The street list behind the pickup picker, and the response shapes it reads.
 *
 * Shared by the map (as "or pick from nearby streets", which moves the pin) and
 * by the no-map fallback (where picking one is the whole interaction), so both
 * describe a candidate the same way.
 */

export interface PickupCandidateOption {
  label: string;
  lat: number;
  lng: number;
  distanceM: number;
  direction: string;
}

/** GET /api/{merchant,admin/merchants}/pickup-point */
export interface PickupOptionsResponse {
  current: { lat: number; lng: number; label: string | null; isStorefront: boolean };
  storefront: { lat: number; lng: number; label: string | null };
  maxOffsetM: number;
  candidates: PickupCandidateOption[];
}

export function candidateKey(c: { lat: number; lng: number }) {
  return `${c.lat},${c.lng}`;
}

export function CandidateList({
  candidates,
  selectedKey,
  onSelect,
}: {
  candidates: PickupCandidateOption[];
  selectedKey: string | null;
  onSelect: (c: PickupCandidateOption) => void;
}) {
  if (candidates.length === 0) {
    return (
      <p className="text-xs text-black-400">
        Bolt didn&apos;t return any street names around this store just now.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {candidates.map((c) => {
        const key = candidateKey(c);
        const active = selectedKey === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(c)}
            className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
              active ? "border-purple-500 bg-purple-50" : "border-black-100 hover:border-black-200"
            }`}
          >
            <span className="block text-sm font-medium text-black-900">{c.label}</span>
            <span className="block text-xs text-black-400 mt-0.5">
              {c.distanceM === 0 ? "Your store address pin" : `${c.distanceM}m ${c.direction}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
