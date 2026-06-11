import { NextRequest, NextResponse } from "next/server";

/**
 * Reverse-geocode device GPS coordinates to a human-readable address label
 * (Geocoding API — already enabled on the project).
 *
 * Powers the "Use my current location" button: the GPS lat/lng are the
 * priced destination; this label is only what the customer (and the rider)
 * read. If reverse geocoding fails we still return a coordinate label so
 * the order can proceed — pricing never depends on this endpoint.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const fallbackLabel = `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[places/reverse-geocode] GOOGLE_MAPS_API_KEY not configured");
    return NextResponse.json({ address: fallbackLabel });
  }

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    const address: string | undefined = data?.results?.[0]?.formatted_address;

    if (data?.status !== "OK" || !address) {
      console.error("[places/reverse-geocode] Google status:", data?.status);
      return NextResponse.json({ address: fallbackLabel });
    }

    return NextResponse.json({ address });
  } catch (err) {
    console.error("[places/reverse-geocode] fetch failed:", err);
    return NextResponse.json({ address: fallbackLabel });
  }
}
