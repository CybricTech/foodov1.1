import { NextRequest, NextResponse } from "next/server";

/**
 * Server-proxied address autocomplete (Places API New).
 *
 * The checkout calls this instead of loading the Google Maps JS SDK in the
 * browser. Benefits: the API key stays server-side (no NEXT_PUBLIC key, no
 * referer-restriction headaches), checkout ships ~150KB less JS, and the
 * failure mode is observable here instead of being swallowed client-side
 * (the old in-browser AutocompleteSuggestion path failed silently in
 * production for months — no dropdown ever rendered).
 *
 * Requires "Places API (New)" enabled on the Google Cloud project. Until it
 * is, this returns an empty suggestion list (checkout degrades to free-text
 * pricing, today's behavior) and logs the reason.
 */

export const dynamic = "force-dynamic";

// Bias results around Abuja (matches the old client-side locationBias).
const BIAS_CENTER = { latitude: 9.0579, longitude: 7.4951 };
const BIAS_RADIUS_M = 50000;

interface Suggestion {
  description: string;
  placeId: string;
}

export async function GET(request: NextRequest) {
  const input = (request.nextUrl.searchParams.get("input") ?? "").trim();

  if (input.length < 3 || input.length > 120) {
    return NextResponse.json({ suggestions: [] satisfies Suggestion[] });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[places/autocomplete] GOOGLE_MAPS_API_KEY not configured");
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify({
          input,
          includedRegionCodes: ["ng"],
          locationBias: {
            circle: { center: BIAS_CENTER, radius: BIAS_RADIUS_M },
          },
        }),
        // Suggestions are time-sensitive; never cache at the fetch layer.
        cache: "no-store",
      }
    );

    const data = await res.json();

    if (!res.ok) {
      // Most common cause: Places API (New) not enabled on the project.
      console.error(
        "[places/autocomplete] Google error:",
        data?.error?.status,
        data?.error?.message?.slice(0, 200)
      );
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions: Suggestion[] = (data?.suggestions ?? [])
      .map((s: { placePrediction?: { text?: { text?: string }; placeId?: string } }) => ({
        description: s.placePrediction?.text?.text ?? "",
        placeId: s.placePrediction?.placeId ?? "",
      }))
      .filter((s: Suggestion) => s.description && s.placeId)
      .slice(0, 6);

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[places/autocomplete] fetch failed:", err);
    return NextResponse.json({ suggestions: [] });
  }
}
