import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { restaurantId, slug } = body as { restaurantId: string; slug: string };

  if (!restaurantId) return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });

  const normalized = slug?.trim().toLowerCase().replace(/^\/+/, "");
  if (!normalized || !/^[a-z0-9-]+$/.test(normalized)) {
    return NextResponse.json(
      { error: "Slug must be lowercase letters, numbers, and hyphens only" },
      { status: 400 }
    );
  }

  // Check uniqueness
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (serviceClient.from("restaurants") as any)
    .select("id")
    .eq("slug", normalized)
    .neq("id", restaurantId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Slug is already taken" }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (serviceClient.from("restaurants") as any)
    .update({ slug: normalized })
    .eq("id", restaurantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, slug: normalized });
}
