import { NextResponse } from "next/server";

// Allow the public landing page (separate deploy) and local dev.
// NEXT_PUBLIC_LANDING_URL should be set to the production landing origin
// (e.g. https://kitchyn.ng). Comma-separated list supported.
const ALLOWED_ORIGINS = (
  process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:5173,http://localhost:5174"
).split(",").map((s) => s.trim());

export function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function preflight(origin: string | null) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
