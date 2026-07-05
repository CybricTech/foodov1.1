import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  menuItemIds: z.array(z.string().uuid()).max(200),
});

/**
 * Live check for Made to Order requirements (088) across the current cart.
 * Carts persist in localStorage indefinitely, so an item's lead-time
 * requirement (or the flag itself) can change after it was added — the
 * checkout page calls this on load/whenever the cart changes so its "force
 * scheduling" UI always reflects the merchant's CURRENT configuration, not
 * whatever was true when the item was added. The strictest (longest) lead
 * time across the cart wins.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ requiredLeadHours: 0 });
  }

  if (parsed.data.menuItemIds.length === 0) {
    return NextResponse.json({ requiredLeadHours: 0 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("menu_items")
    .select("is_made_to_order, made_to_order_lead_hours")
    .in("id", parsed.data.menuItemIds);

  const requiredLeadHours = Math.max(
    0,
    ...(data ?? [])
      .filter((m) => (m as unknown as { is_made_to_order?: boolean }).is_made_to_order)
      .map((m) => (m as unknown as { made_to_order_lead_hours?: number | null }).made_to_order_lead_hours ?? 0)
  );

  return NextResponse.json({ requiredLeadHours });
}
