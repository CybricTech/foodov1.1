import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/require-admin";

export const dynamic = "force-dynamic";

export interface MapsTestResult {
  timestamp: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  detail: string;
}

export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json<MapsTestResult>({
      timestamp: new Date().toISOString(),
      status: "down",
      latencyMs: 0,
      detail: "GOOGLE_MAPS_API_KEY not configured",
    });
  }

  const start = Date.now();
  try {
    // Geocode a known Nigerian city — real key validation, billable but minimal cost (~$0.005)
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=Lagos%2C+Nigeria&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const latencyMs = Date.now() - start;

    if (data.status === "OK") {
      return NextResponse.json<MapsTestResult>({
        timestamp: new Date().toISOString(),
        status: latencyMs < 2000 ? "healthy" : "degraded",
        latencyMs,
        detail: `API key valid · ${data.results?.[0]?.formatted_address ?? "result returned"}`,
      });
    }

    if (data.status === "REQUEST_DENIED") {
      return NextResponse.json<MapsTestResult>({
        timestamp: new Date().toISOString(),
        status: "down",
        latencyMs,
        detail: `Key rejected: ${data.error_message ?? "REQUEST_DENIED"}`,
      });
    }

    return NextResponse.json<MapsTestResult>({
      timestamp: new Date().toISOString(),
      status: "degraded",
      latencyMs,
      detail: `Unexpected status: ${data.status}`,
    });
  } catch (err) {
    return NextResponse.json<MapsTestResult>({
      timestamp: new Date().toISOString(),
      status: "down",
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
