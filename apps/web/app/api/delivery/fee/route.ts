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

  if (!restaurantId || !destinationAddress) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Fetch admin-configured pricing from platform_settings
  const { data: settings } = await supabase
    .from("platform_settings")
    .select(
      "delivery_base_fee_kobo, delivery_per_km_rate_kobo, delivery_max_radius_km, delivery_max_fee_kobo"
    )
    .single();

  // Fall back to constants if DB fetch fails
  const baseFeeKobo = Number(settings?.delivery_base_fee_kobo ?? DELIVERY_BASE_FEE_KOBO);
  const perKmRateKobo = Number(settings?.delivery_per_km_rate_kobo ?? DELIVERY_PER_KM_RATE_KOBO);
  const maxRadiusKm = Number(settings?.delivery_max_radius_km ?? DELIVERY_MAX_RADIUS_KM);
  const maxFeeKobo = Number(settings?.delivery_max_fee_kobo ?? DELIVERY_MAX_FEE_KOBO);

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("latitude, longitude, name, address")
    .eq("id", restaurantId)
    .single();

  if (!restaurant?.latitude || !restaurant?.longitude) {
    return NextResponse.json({
      feeKobo: baseFeeKobo,
      distanceKm: null,
      durationMinutes: null,
      fallback: true,
      message: "Using base delivery fee — restaurant location not configured",
    });
  }

  const origin = `${restaurant.latitude},${restaurant.longitude}`;
  const destination = encodeURIComponent(destinationAddress);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  const mapsUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&mode=driving&units=metric&key=${apiKey}`;

  const mapsRes = await fetch(mapsUrl);
  const mapsData = await mapsRes.json();

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

  if (distanceKm > maxRadiusKm) {
    return NextResponse.json(
      {
        error: `Sorry, this location is outside our delivery area (${Math.round(distanceKm)}km away, max is ${maxRadiusKm}km).`,
      },
      { status: 422 }
    );
  }

  const calculatedFee = baseFeeKobo + Math.round(distanceKm * perKmRateKobo);
  const feeKobo = Math.min(calculatedFee, maxFeeKobo);

  return NextResponse.json({
    feeKobo,
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMinutes,
    breakdown: {
      baseFeeKobo,
      distanceKm: Math.round(distanceKm * 10) / 10,
      perKmRateKobo,
      distanceChargeKobo: Math.round(distanceKm * perKmRateKobo),
    },
  });
}
