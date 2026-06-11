import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  DELIVERY_BASE_FEE_KOBO,
  DELIVERY_PER_KM_RATE_KOBO,
  DELIVERY_MAX_RADIUS_KM,
  DELIVERY_MAX_FEE_KOBO,
} from "@foodo/utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const restaurantId = searchParams.get("restaurantId");
  const destinationAddress = searchParams.get("destinationAddress");
  // Google place_id of the picked autocomplete prediction. When present,
  // Distance Matrix measures to the exact place instead of re-geocoding the
  // free-text address — which can snap to a same-named street in a different
  // district (e.g. GD-1331: "Mallam el rufai street …Lugbe" resolved to a
  // street in Wuse at 9.3km instead of River Park Estate at 22.2km).
  const placeId = searchParams.get("placeId");
  // Exact destination coordinates (picked suggestion resolved via
  // /api/places/resolve, or device GPS). Highest-priority destination:
  // coordinates skip geocoding entirely.
  const destLatRaw = searchParams.get("destLat");
  const destLngRaw = searchParams.get("destLng");
  const destLat = destLatRaw !== null ? Number(destLatRaw) : null;
  const destLng = destLngRaw !== null ? Number(destLngRaw) : null;
  const hasCoords =
    destLat !== null &&
    destLng !== null &&
    Number.isFinite(destLat) &&
    Number.isFinite(destLng) &&
    destLat >= -90 &&
    destLat <= 90 &&
    destLng >= -180 &&
    destLng <= 180;

  if (!restaurantId || !destinationAddress) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Fetch platform-level defaults, known restaurant fields, and new pricing columns in parallel
  const [{ data: settings }, { data: restaurant }, { data: pricingRow }] = await Promise.all([
    supabase
      .from("platform_settings")
      .select("delivery_base_fee_kobo, delivery_per_km_rate_kobo, delivery_max_radius_km, delivery_max_fee_kobo")
      .single(),
    supabase
      .from("restaurants")
      .select("latitude, longitude, name, address, max_delivery_radius_km")
      .eq("id", restaurantId)
      .single(),
    // Fetch new per-restaurant pricing columns separately (not in generated types yet)
    supabase
      .from("restaurants")
      .select("restaurant_base_fee_kobo, restaurant_per_km_rate_kobo, restaurant_max_fee_kobo")
      .eq("id", restaurantId)
      .single() as unknown as Promise<{ data: Record<string, unknown> | null }>,
  ]);

  // Restaurant-specific values take priority; fall back to platform settings, then constants
  const baseFeeKobo = Number(
    pricingRow?.restaurant_base_fee_kobo
    ?? settings?.delivery_base_fee_kobo
    ?? DELIVERY_BASE_FEE_KOBO
  );
  const perKmRateKobo = Number(
    pricingRow?.restaurant_per_km_rate_kobo
    ?? settings?.delivery_per_km_rate_kobo
    ?? DELIVERY_PER_KM_RATE_KOBO
  );
  const maxRadiusKm = Number(settings?.delivery_max_radius_km ?? DELIVERY_MAX_RADIUS_KM);
  const maxFeeKobo = Number(
    pricingRow?.restaurant_max_fee_kobo
    ?? settings?.delivery_max_fee_kobo
    ?? DELIVERY_MAX_FEE_KOBO
  );

  if (!restaurant?.latitude || !restaurant?.longitude) {
    return NextResponse.json({
      feeKobo: baseFeeKobo,
      distanceKm: null,
      durationMinutes: null,
      fallback: true,
      message: "Using base delivery fee — restaurant location not configured",
    });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  // Safety guard: if the API key is not configured, return the base fee rather
  // than making a request with key=undefined which would always fail.
  if (!apiKey) {
    return NextResponse.json({
      feeKobo: baseFeeKobo,
      distanceKm: null,
      durationMinutes: null,
      fallback: true,
      message: "Using base delivery fee — GOOGLE_MAPS_API_KEY is not configured",
    });
  }

  const origin = `${restaurant.latitude},${restaurant.longitude}`;
  // Destination trust hierarchy: exact coordinates > place_id > free text.
  const destination = hasCoords
    ? encodeURIComponent(`${destLat},${destLng}`)
    : placeId
      ? encodeURIComponent(`place_id:${placeId}`)
      : encodeURIComponent(destinationAddress);

  const mapsUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&mode=driving&units=metric&key=${apiKey}`;

  // When the caller didn't already pass exact coordinates (i.e. a typed /
  // free-text address), resolve the destination's coordinates in parallel with
  // the distance lookup. Returning them lets the checkout match geo-fenced
  // offers (e.g. free delivery to a campus) no matter how the address was
  // entered — picked, GPS, or typed. Same geocode basis Distance Matrix used.
  const geocodeUrl = !hasCoords
    ? `https://maps.googleapis.com/maps/api/geocode/json?${
        placeId
          ? `place_id=${encodeURIComponent(placeId)}`
          : `address=${encodeURIComponent(destinationAddress)}`
      }&key=${apiKey}`
    : null;

  const [mapsData, geoData] = await Promise.all([
    fetch(mapsUrl).then((r) => r.json()),
    geocodeUrl
      ? fetch(geocodeUrl)
          .then((r) => r.json())
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const element = mapsData?.rows?.[0]?.elements?.[0];

  if (!element || element.status !== "OK") {
    return NextResponse.json(
      {
        error:
          "Could not calculate distance for this address. Please check the address and try again.",
      },
      { status: 422 }
    );
  }

  const distanceMeters: number = element.distance.value;
  const distanceKm = distanceMeters / 1000;
  const durationSeconds: number = element.duration.value;
  const durationMinutes = Math.ceil(durationSeconds / 60);

  // Use restaurant-specific radius if set, otherwise fall back to platform default
  const effectiveMaxRadius = restaurant.max_delivery_radius_km
    ? Number(restaurant.max_delivery_radius_km)
    : maxRadiusKm;

  if (distanceKm > effectiveMaxRadius) {
    return NextResponse.json(
      {
        error: `Sorry, this location is outside our delivery area (${Math.round(distanceKm)}km away, max is ${effectiveMaxRadius}km).`,
      },
      { status: 422 }
    );
  }

  const calculatedFee = baseFeeKobo + Math.round(distanceKm * perKmRateKobo);
  const feeKobo = Math.min(calculatedFee, maxFeeKobo);

  // Destination coordinates the fee was priced against — exact when provided,
  // else the geocoded point. The checkout uses these for geo-fenced offers.
  const geoLoc = geoData?.results?.[0]?.geometry?.location;
  const resolvedDestLat = hasCoords
    ? destLat
    : typeof geoLoc?.lat === "number"
      ? geoLoc.lat
      : null;
  const resolvedDestLng = hasCoords
    ? destLng
    : typeof geoLoc?.lng === "number"
      ? geoLoc.lng
      : null;

  return NextResponse.json({
    feeKobo,
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMinutes,
    destLat: resolvedDestLat,
    destLng: resolvedDestLng,
    breakdown: {
      baseFeeKobo,
      distanceKm: Math.round(distanceKm * 10) / 10,
      perKmRateKobo,
      distanceChargeKobo: Math.round(distanceKm * perKmRateKobo),
    },
  });
}
