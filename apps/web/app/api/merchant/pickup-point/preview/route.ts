import { NextRequest, NextResponse } from "next/server";
import { requireMerchantOwner } from "@/lib/api/require-merchant-owner";
import { isRateLimited } from "@/lib/api/rate-limit";
import { parsePreviewPoint, previewPickupPoint } from "@/lib/delivery/pickup-point";

/**
 * POST { lat, lng } → { label, distanceM }
 *
 * What Bolt would tell a rider if the pickup point were moved to this exact
 * spot — checked against the same rules as saving, but nothing is written. The
 * map pickers (web Settings and the mobile app) call it as the pin is dragged,
 * so the merchant sees the street name before committing to it.
 *
 * `label` is null when Bolt has no name for the spot or couldn't be reached;
 * the point is still valid. Errors are non-2xx `{ error }`, as on the parent
 * route.
 */

// Each call is one Bolt reverse-geocode. Clients debounce, so a merchant
// dragging around normally makes a handful; this only stops a runaway loop.
const PREVIEW_LIMIT = { max: 60, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const auth = await requireMerchantOwner(request);
  if (auth.error) return auth.error;

  if (isRateLimited("pickup-preview", auth.restaurantId, PREVIEW_LIMIT)) {
    return NextResponse.json(
      { error: "Too many checks — wait a moment and try again." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const point = parsePreviewPoint(body);
  if (!point) return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });

  const result = await previewPickupPoint(auth.restaurantId, point);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.data);
}
