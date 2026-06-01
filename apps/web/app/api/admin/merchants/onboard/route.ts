import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getPostHogClient } from "@/lib/posthog";

const OnboardSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens"),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  city: z.string().max(100).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();

  // Auth check — must be super_admin
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const parsed = OnboardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { name, slug, email, password, city } = parsed.data;
  const { data: restaurant, error: restError } = await serviceClient
    .from("restaurants")
    .insert({
      name,
      slug,
      city: city ?? null,
      description: null,
      logo_url: null,
      banner_url: null,
      primary_color: null,
      phone: null,
      address: null,
      state: null,
      logistics_default: "own_rider",
      delivery_radius_km: null,
      min_order_amount: null,
      estimated_delivery_minutes: null,
      delivery_fee: 0,
      is_active: true,
      accepts_orders: true,
    })
    .select("*")
    .single();

  if (restError) {
    if (restError.code === "23505") {
      return NextResponse.json(
        { error: "A restaurant with this slug already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: restError.message }, { status: 500 });
  }

  // Create Supabase Auth user
  const { data: authUser, error: authError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError || !authUser.user) {
    // Roll back restaurant if user creation fails
    await serviceClient.from("restaurants").delete().eq("id", restaurant.id);
    return NextResponse.json(
      { error: authError?.message ?? "Auth user creation failed" },
      { status: 500 }
    );
  }

  await serviceClient.from("user_profiles").insert({
    id: authUser.user.id,
    role: "merchant_owner",
    restaurant_id: restaurant.id,
    email,
    is_active: true,
    full_name: null,
    phone: null,
    avatar_url: null,
    vehicle_type: null,
  });

  // Log audit
  await serviceClient.from("audit_logs").insert({
    actor_id: user.id,
    action: "onboard_merchant",
    target_type: "restaurant",
    target_id: restaurant.id,
    metadata: { name, slug, email } as import("@foodo/database").Json,
  });

  // Send onboarding email via Edge Function (fire-and-forget)
  const storefrontUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${slug}`;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;

  fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template: "merchant-onboarding",
        to: email,
        props: {
          restaurantName: name,
          email,
          temporaryPassword: password,
          storefrontUrl,
          dashboardUrl,
        },
      }),
    }
  ).catch(console.error);

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "merchant onboarded",
    properties: {
      restaurant_id: restaurant.id,
      restaurant_name: name,
      restaurant_slug: slug,
      merchant_email: email,
      city: city ?? null,
      onboarded_by: user.id,
    },
  });
  await posthog.shutdown();

  // Kick off Sendchamp sender-ID registration for this restaurant.
  // Fire-and-forget — approval lands later and admin marks it via the merchants page.
  fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-sms-sender`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ restaurantId: restaurant.id }),
    }
  ).catch(console.error);

  return NextResponse.json({ restaurant, password });
}
