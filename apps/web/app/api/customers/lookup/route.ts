import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// In-memory IP rate limiter.
// Acceptable for a single-instance deployment (e.g. a single Vercel region or
// a single container). For multi-instance / edge deployments, replace this
// with a Redis-backed solution such as @upstash/ratelimit.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

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
    // Start a fresh window
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone");
  const restaurantId = searchParams.get("restaurantId");

  if (!phone || !restaurantId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, full_name, email")
    .eq("restaurant_id", restaurantId)
    .eq("phone", phone)
    .maybeSingle();

  if (!customer) return NextResponse.json({});

  const { data: addresses } = await supabase
    .from("customer_addresses")
    .select("id, address, label, is_default")
    .eq("customer_id", customer.id)
    .eq("restaurant_id", restaurantId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  return NextResponse.json({
    full_name: customer.full_name,
    email: customer.email,
    addresses: addresses ?? [],
  });
}
