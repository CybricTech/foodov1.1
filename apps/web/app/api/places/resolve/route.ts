import { NextRequest, NextResponse } from "next/server";

/**
 * Resolve a Google place_id to coordinates + formatted address
 * (Place Details, Places API New — field-masked to the cheapest tier).
 *
 * Called when the customer picks an autocomplete suggestion. The returned
 * lat/lng become the destination for delivery pricing — coordinates are the
 * source of truth; the address text is only a label. This is what makes the
 * wrong-street geocode bug (GD-1331) structurally impossible for picked
 * addresses.
 */

export const dynamic = "force-dynamic";

const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;

export async function GET(request: NextRequest) {
  const placeId = (request.nextUrl.searchParams.get("placeId") ?? "").trim();

  if (!PLACE_ID_RE.test(placeId)) {
    return NextResponse.json({ error: "Invalid placeId" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[places/resolve] GOOGLE_MAPS_API_KEY not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "location,formattedAddress",
        },
        cache: "no-store",
      }
    );

    const data = await res.json();

    if (!res.ok || !data?.location) {
      console.error(
        "[places/resolve] Google error:",
        data?.error?.status,
        data?.error?.message?.slice(0, 200)
      );
      return NextResponse.json(
        { error: "Could not resolve place" },
        { status: 422 }
      );
    }

    return NextResponse.json({
      lat: data.location.latitude as number,
      lng: data.location.longitude as number,
      formattedAddress: (data.formattedAddress as string) ?? null,
    });
  } catch (err) {
    console.error("[places/resolve] fetch failed:", err);
    return NextResponse.json(
      { error: "Could not resolve place" },
      { status: 502 }
    );
  }
}
