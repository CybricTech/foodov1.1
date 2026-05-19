import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { corsHeaders, preflight } from "@/lib/api/cors";

// IP rate limit — 5 requests / minute is plenty for a contact form.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

const DemoRequestSchema = z.object({
  name: z.string().min(2).max(100),
  restaurantName: z.string().min(2).max(150),
  email: z.string().email().max(254),
  phone: z.string().min(7).max(30),
  message: z.string().max(2000).optional().nullable(),
});

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get("origin"));
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429, headers }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers });
  }

  const parsed = DemoRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422, headers }
    );
  }

  const { name, restaurantName, email, phone, message } = parsed.data;
  const serviceClient = createServiceClient();

  const { data, error } = await serviceClient
    .from("demo_requests")
    .insert({
      name,
      restaurant_name: restaurantName,
      email,
      phone,
      message: message ?? null,
      source: "landing",
      status: "new",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers });
  }

  // Fire-and-forget admin notification email
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template: "demo-request-received",
        to: process.env.ADMIN_NOTIFICATION_EMAIL ?? "hello@kitchyn.ng",
        props: { name, restaurantName, email, phone, message },
      }),
    }).catch(console.error);
  }

  return NextResponse.json({ id: data.id, ok: true }, { status: 201, headers });
}
