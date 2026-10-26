import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/require-admin";
import { isRateLimited } from "@/lib/api/rate-limit";
import { parsePreviewPoint, previewPickupPoint } from "@/lib/delivery/pickup-point";

/**
 * POST { restaurantId, lat, lng } → { label, distanceM }
 *
 * The admin twin of /api/merchant/pickup-point/preview: what Bolt would tell a
 * rider for this exact spot at any store, checked against the same rules as
 * saving, with nothing written. Not audit-logged — only the save is a change.
 */

// One Bolt reverse-geocode per call; clients debounce. Guards a runaway loop.
const PREVIEW_LIMIT = { max: 60, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  if (isRateLimited("admin-pickup-preview", auth.userId, PREVIEW_LIMIT)) {
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

  const { restaurantId } = (body ?? {}) as { restaurantId?: unknown };
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
  }

  const point = parsePreviewPoint(body);
  if (!point) return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });

  const result = await previewPickupPoint(restaurantId, point);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.data);
}
