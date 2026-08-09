import type { NextRequest } from "next/server";

/**
 * In-memory IP rate limiter for public (unauthenticated) routes.
 *
 * Acceptable for a single-instance deployment (e.g. a single Vercel region or
 * a single container). For multi-instance / edge deployments, replace this with
 * a Redis-backed solution such as @upstash/ratelimit.
 *
 * Extracted from app/api/customers/lookup so the customer-facing order lookup
 * routes can share the same limiter shape.
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Map<string, RateLimitEntry>>();

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Returns true when the caller has exceeded `max` requests within `windowMs`.
 * `bucket` namespaces the counters so one route can't exhaust another's budget.
 */
export function isRateLimited(
  bucket: string,
  ip: string,
  { max, windowMs }: { max: number; windowMs: number }
): boolean {
  let entries = buckets.get(bucket);
  if (!entries) {
    entries = new Map<string, RateLimitEntry>();
    buckets.set(bucket, entries);
  }

  const now = Date.now();
  const entry = entries.get(ip);

  if (!entry || now - entry.windowStart >= windowMs) {
    entries.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  return entry.count > max;
}
