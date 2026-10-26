"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ListChecks, Loader2, MapPin, Navigation } from "lucide-react";
import { onGoogleMapsAuthFailure } from "@/lib/maps/load-google-maps";
import { clampWithin, metresBetween } from "@/lib/delivery/pickup-geo";
import {
  CandidateList,
  candidateKey,
  type PickupCandidateOption,
  type PickupOptionsResponse,
} from "@/components/shared/pickup-point-candidate-list";

/**
 * Dragging a pin to where a rider should stop.
 *
 * Bolt sends the rider to exactly the coordinate we give it, and names the
 * pickup by reverse-geocoding that coordinate to the nearest road. So the pin
 * decides two things at once: where the bike stops, and which street the rider
 * is told. The second is invisible on a map and changes within ~30 m, which is
 * why every move is previewed against Bolt before the merchant can save — they
 * see the name a rider will get, not just a dot.
 *
 * Satellite (hybrid) is the default view because merchants recognise their gate,
 * the kerb, or the car park entrance from above far more readily than from a
 * road diagram, and the road names stay overlaid.
 *
 * Dragging a marker isn't keyboard-accessible; the "nearby streets" list below
 * the map moves the pin too and is the keyboard path.
 */

type Point = { lat: number; lng: number };

type Preview =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; label: string | null; distanceM: number }
  | { state: "error"; error: string };

/** Debounce before asking Bolt — long enough to skip the nudges while a pin settles. */
const PREVIEW_DEBOUNCE_MS = 350;
/**
 * How far inside the limit a snapped-back pin lands. The server measures in
 * whole metres with a slightly different formula; a small margin keeps a pin
 * that looks inside the circle from being refused on save.
 */
const SNAP_MARGIN_M = 2;

const BRAND = "#7B2CBF"; // purple-500

export function PickupPointMap({
  options,
  endpoint,
  restaurantId,
  onSaved,
  onCancel,
  onUnavailable,
}: {
  options: PickupOptionsResponse;
  endpoint: string;
  restaurantId?: string;
  onSaved: (status: { label: string | null; isStorefront: boolean }) => void;
  onCancel: () => void;
  /** Maps failed after load (e.g. Google rejected the key) — parent shows the street list instead. */
  onUnavailable: () => void;
}) {
  const { storefront, maxOffsetM, current } = options;

  const [pin, setPin] = useState<Point>({ lat: current.lat, lng: current.lng });
  const [preview, setPreview] = useState<Preview>({ state: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [mapType, setMapType] = useState<"hybrid" | "roadmap">("hybrid");
  const [mapReady, setMapReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [streets, setStreets] = useState<PickupCandidateOption[] | null>(null);
  const [streetsLoading, setStreetsLoading] = useState(false);
  const [selectedStreet, setSelectedStreet] = useState<string | null>(null);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const pinMarkerRef = useRef<google.maps.Marker | null>(null);
  const previewTimer = useRef<number | null>(null);
  const previewAbort = useRef<AbortController | null>(null);

  // ── Preview ────────────────────────────────────────────────────────────────

  function schedulePreview(p: Point) {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    previewAbort.current?.abort();
    setPreview({ state: "loading" });

    previewTimer.current = window.setTimeout(async () => {
      const ctrl = new AbortController();
      previewAbort.current = ctrl;
      try {
        const res = await fetch(`${endpoint}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(restaurantId ? { restaurantId } : {}), lat: p.lat, lng: p.lng }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        // A newer drag has superseded this one; its own preview will land.
        if (ctrl.signal.aborted) return;
        if (!res.ok) {
          setPreview({ state: "error", error: data.error ?? "Could not check this spot" });
        } else {
          setPreview({ state: "ok", label: data.label ?? null, distanceM: data.distanceM });
        }
      } catch {
        if (ctrl.signal.aborted) return;
        setPreview({ state: "error", error: "Network error — couldn't check this spot" });
      }
    }, PREVIEW_DEBOUNCE_MS);
  }

  /**
   * Every way of moving the pin ends here: drag, tap on the map, or a street
   * from the list. Out-of-range points are pulled back onto the circle along the
   * direction they were dragged, rather than refused, so the merchant keeps
   * their intent and only loses the overshoot.
   */
  function placePin(raw: Point) {
    let p = raw;
    const d = metresBetween(storefront, raw);
    if (d > maxOffsetM) {
      p = clampWithin(storefront, raw, maxOffsetM - SNAP_MARGIN_M);
      setNotice(
        `That spot is ${d}m from your store address and the limit is ${maxOffsetM}m, so the pin was moved back to the edge of the circle.`
      );
    } else {
      setNotice(null);
    }
    pinMarkerRef.current?.setPosition(p);
    setPin(p);
    setError("");
    schedulePreview(p);
  }

  // Google's listeners are attached once; route them through a ref so they
  // always reach the latest placePin rather than the first render's closure.
  const placePinRef = useRef(placePin);
  placePinRef.current = placePin;

  // ── Map setup ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];
    const overlays: { setMap: (m: google.maps.Map | null) => void }[] = [];

    (async () => {
      const [{ SymbolPath }, { Map: GoogleMap, Circle }, { Marker }] = (await Promise.all([
        google.maps.importLibrary("core"),
        google.maps.importLibrary("maps"),
        google.maps.importLibrary("marker"),
      ])) as [google.maps.CoreLibrary, google.maps.MapsLibrary, google.maps.MarkerLibrary];
      if (cancelled || !mapDivRef.current) return;

      const map = new GoogleMap(mapDivRef.current, {
        center: { lat: current.lat, lng: current.lng },
        zoom: 18,
        mapTypeId: "hybrid",
        // Straight down, so the pin sits where it looks like it sits. 45°
        // imagery shifts rooftops away from their footprint.
        tilt: 0,
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: true,
        // Tapping a POI would open Google's info card instead of moving the pin.
        clickableIcons: false,
        // "cooperative", not "greedy": the map sits mid-way down a long settings
        // page that is mostly used on phones. Greedy would hijack one-finger
        // swipes and trap the merchant on the map; cooperative pans with two
        // fingers and leaves one-finger scrolling to the page. Dragging the pin
        // itself and tapping to drop it are still one-finger, which is all
        // choosing a spot needs.
        gestureHandling: "cooperative",
      });
      mapRef.current = map;

      const circle = new Circle({
        map,
        center: storefront,
        radius: maxOffsetM,
        strokeColor: BRAND,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: BRAND,
        fillOpacity: 0.08,
        // Lets taps inside the circle fall through to the map's click handler.
        clickable: false,
      });
      overlays.push(circle);

      const storeMarker = new Marker({
        map,
        position: storefront,
        clickable: false,
        title: "Your store address",
        icon: {
          path: SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#212121",
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 2,
        },
        zIndex: 1,
      });
      overlays.push(storeMarker);

      const pinMarker = new Marker({
        map,
        position: { lat: current.lat, lng: current.lng },
        draggable: true,
        title: "Rider pickup point — drag to move",
        zIndex: 2,
      });
      pinMarkerRef.current = pinMarker;
      overlays.push(pinMarker);

      listeners.push(
        pinMarker.addListener("dragend", () => {
          const pos = pinMarker.getPosition();
          if (pos) placePinRef.current({ lat: pos.lat(), lng: pos.lng() });
        }),
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) placePinRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        })
      );

      // Show the whole allowed area, so the merchant can see how far they may go.
      const bounds = circle.getBounds();
      if (bounds) map.fitBounds(bounds, 8);

      setMapReady(true);
    })().catch((err) => {
      console.error("[pickup-map] map init failed:", err);
      if (!cancelled) onUnavailable();
    });

    const unsubscribeAuth = onGoogleMapsAuthFailure(() => {
      if (!cancelled) onUnavailable();
    });

    return () => {
      cancelled = true;
      unsubscribeAuth();
      listeners.forEach((l) => l.remove());
      overlays.forEach((o) => o.setMap(null));
      pinMarkerRef.current = null;
      mapRef.current = null;
      if (previewTimer.current) window.clearTimeout(previewTimer.current);
      previewAbort.current?.abort();
    };
    // Built once per open; the editor is remounted to start over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setMapTypeId(mapType);
  }, [mapType, mapReady]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function save(point: Point | null) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(restaurantId ? { restaurantId } : {}),
          latitude: point?.lat ?? null,
          longitude: point?.lng ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save pickup point");
      } else if (point === null) {
        onSaved({ label: storefront.label, isStorefront: true });
      } else {
        onSaved({ label: data.label ?? null, isStorefront: false });
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  function saveCurrentPin() {
    // A pin dropped back on the store address clears the override instead of
    // storing a copy of the address coordinates, so the store reads as "no
    // separate pickup point" everywhere — same as "Use store address".
    save(metresBetween(storefront, pin) === 0 ? null : pin);
  }

  async function loadStreets() {
    setStreetsLoading(true);
    setError("");
    try {
      const url = restaurantId
        ? `${endpoint}?restaurantId=${encodeURIComponent(restaurantId)}`
        : endpoint;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not load nearby streets");
      else setStreets((data as PickupOptionsResponse).candidates);
    } catch {
      setError("Network error");
    }
    setStreetsLoading(false);
  }

  function chooseStreet(c: PickupCandidateOption) {
    setSelectedStreet(candidateKey(c));
    placePin({ lat: c.lat, lng: c.lng });
    mapRef.current?.panTo({ lat: c.lat, lng: c.lng });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const moved =
    Math.abs(pin.lat - current.lat) > 1e-7 || Math.abs(pin.lng - current.lng) > 1e-7;
  const canSave = moved && !saving && preview.state !== "loading" && preview.state !== "error";

  return (
    <div className="space-y-3">
      <p className="text-xs text-black-500">
        Drag the red pin to where a rider should stop — usually your gate or entrance — or tap the
        map to drop it there. It has to stay inside the circle ({maxOffsetM}m from your store
        address, the dark dot).
      </p>

      <div className="relative">
        <div
          ref={mapDivRef}
          role="application"
          aria-label="Map of your store. Drag the red pin to where riders should stop."
          className="w-full h-[300px] rounded-xl overflow-hidden bg-black-100 border border-black-100"
        />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-black-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading map…
          </div>
        )}
        {mapReady && (
          <div className="absolute top-2 left-2 flex rounded-lg bg-white shadow-sm overflow-hidden text-xs font-semibold">
            {(
              [
                ["hybrid", "Satellite"],
                ["roadmap", "Map"],
              ] as const
            ).map(([type, label]) => (
              <button
                key={type}
                type="button"
                aria-pressed={mapType === type}
                onClick={() => setMapType(type)}
                className={`px-3 py-1.5 transition-colors ${
                  mapType === type ? "bg-purple-500 text-white" : "text-black-900 hover:bg-black-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {notice && (
        <p className="flex items-start gap-2 text-xs text-black-900 bg-dixie-100 rounded-xl px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-dixie-500 mt-0.5 shrink-0" />
          {notice}
        </p>
      )}

      <div
        aria-live="polite"
        className="flex items-start gap-2 bg-purple-50 rounded-xl px-3 py-2.5 text-xs"
      >
        <Navigation className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
        <PreviewText
          preview={preview}
          moved={moved}
          current={current}
          distanceFromStoreM={metresBetween(storefront, pin)}
        />
      </div>

      {error && <p className="text-xs text-cinnabar-500">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={saveCurrentPin}
          className="inline-flex items-center gap-2 bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? "Saving…" : "Save pickup point"}
        </button>
        {!current.isStorefront && (
          <button
            type="button"
            disabled={saving}
            onClick={() => save(null)}
            className="inline-flex items-center gap-1.5 bg-black-100 hover:bg-black-200 disabled:opacity-60 text-black-900 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <MapPin className="w-4 h-4" />
            Use store address
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-black-500 hover:text-black-900 px-2 py-2"
        >
          Cancel
        </button>
      </div>

      <div className="pt-1">
        {streets === null ? (
          <button
            type="button"
            onClick={loadStreets}
            disabled={streetsLoading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-500 hover:text-purple-600 disabled:opacity-60"
          >
            {streetsLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ListChecks className="w-3.5 h-3.5" />
            )}
            {streetsLoading ? "Checking nearby streets…" : "Or pick from nearby streets"}
          </button>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-black-500">
              Streets Bolt can name around your store. Picking one moves the pin there.
            </p>
            <CandidateList
              candidates={streets}
              selectedKey={selectedStreet}
              onSelect={chooseStreet}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewText({
  preview,
  moved,
  current,
  distanceFromStoreM,
}: {
  preview: Preview;
  moved: boolean;
  current: PickupOptionsResponse["current"];
  distanceFromStoreM: number;
}) {
  const distance = (m: number) =>
    m === 0 ? "on your store address" : `${m}m from your store address`;

  if (preview.state === "loading") {
    return (
      <p className="inline-flex items-center gap-1.5 text-black-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Checking what Bolt will tell riders here…
      </p>
    );
  }

  if (preview.state === "error") {
    return <p className="text-cinnabar-500">{preview.error}</p>;
  }

  if (preview.state === "ok") {
    return preview.label ? (
      <p className="text-black-500">
        Riders will be sent here — Bolt will tell them:{" "}
        <span className="font-semibold text-black-900">{preview.label}</span> (
        {distance(preview.distanceM)})
      </p>
    ) : (
      <p className="text-black-500">
        Riders will be sent here ({distance(preview.distanceM)}). Bolt didn&apos;t return a street
        name for this spot just now — the rider still gets the exact pin.
      </p>
    );
  }

  // Idle: the pin is still where riders go today.
  if (!moved) {
    return (
      <p className="text-black-500">
        {current.isStorefront ? "Riders go to your store address today" : "Riders are sent here today"}
        {current.label ? (
          <>
            {" "}
            — Bolt tells them: <span className="font-semibold text-black-900">{current.label}</span>
          </>
        ) : null}
        {!current.isStorefront && ` (${distance(distanceFromStoreM)})`}. Move the pin to change
        it.
      </p>
    );
  }

  return null;
}
