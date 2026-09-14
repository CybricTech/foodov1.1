/**
 * POST /api/merchant/account/deletion-request
 *
 * Mobile-facing (Bearer or cookie auth). The Kitchyn Merchant app's "Delete
 * account" action calls this so a merchant owner or staff member can ask for
 * their account to be closed — the in-app deletion path both app stores
 * require. Fulfilment is manual (within the 30 days promised on
 * /delete-account); this route only records the request and tells ops.
 *
 * Request:  { reason?: string }   (body optional; reason trimmed, capped at 1000 chars)
 * Response: 200 { ok: true, requestedAt: string }   ISO 8601
 * Errors:   { error: string } — 400 bad JSON / non-string reason,
 *           401 unauthenticated, 403 not a merchant user, 500 DB failure.
 *
 * Idempotent: a user with a request already in 'pending' gets that request's
 * timestamp back instead of a second row. The partial unique index in
 * 20260914101821_create_account_deletion_requests.sql backs this up under a
 * concurrent double-tap.
 */
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";
import { escapeTelegramHtml, sendTelegramAlert } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const MAX_REASON_LENGTH = 1000;
const UNIQUE_VIOLATION = "23505";

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (
    !profile?.restaurant_id ||
    (profile.role !== "merchant_owner" && profile.role !== "merchant_staff")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The body is optional — the app may send nothing at all.
  let reason: string | null = null;
  const rawBody = await request.text();
  if (rawBody.trim()) {
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const rawReason = (body as { reason?: unknown } | null)?.reason;
    if (rawReason !== undefined && rawReason !== null) {
      if (typeof rawReason !== "string") {
        return NextResponse.json({ error: "reason must be a string" }, { status: 400 });
      }
      reason = rawReason.trim().slice(0, MAX_REASON_LENGTH) || null;
    }
  }

  // account_deletion_requests is not in the generated @foodo/database types yet
  // (it ships with migration 20260914101821) — use an untyped view of the same
  // service client until types are regenerated after the migration is applied.
  const db = serviceClient as unknown as SupabaseClient;

  const existing = await findPendingRequest(db, user.id);
  if (existing.error) {
    return NextResponse.json({ error: existing.error }, { status: 500 });
  }
  if (existing.createdAt) {
    return NextResponse.json({ ok: true, requestedAt: toIso(existing.createdAt) });
  }

  const email = user.email ?? "";
  const { data: inserted, error: insertError } = await db
    .from("account_deletion_requests")
    .insert({
      user_id: user.id,
      restaurant_id: profile.restaurant_id,
      email,
      role: profile.role,
      reason,
    })
    .select("created_at")
    .single();

  if (insertError) {
    // Lost a race with a concurrent submission — return the row that won.
    if (insertError.code === UNIQUE_VIOLATION) {
      const winner = await findPendingRequest(db, user.id);
      if (winner.createdAt) {
        return NextResponse.json({ ok: true, requestedAt: toIso(winner.createdAt) });
      }
    }
    console.error("[deletion-request] insert failed:", insertError.message);
    return NextResponse.json({ error: "Could not record deletion request" }, { status: 500 });
  }

  // Best-effort ops alert. Not awaited: the request row is the source of truth,
  // and a Telegram outage must never fail or slow the merchant's request.
  void alertAdmins(db, {
    restaurantId: profile.restaurant_id,
    email,
    role: profile.role,
    reason,
  });

  return NextResponse.json({
    ok: true,
    requestedAt: toIso((inserted as { created_at: string }).created_at),
  });
}

async function findPendingRequest(
  db: SupabaseClient,
  userId: string
): Promise<{ createdAt: string | null; error: string | null }> {
  const { data, error } = await db
    .from("account_deletion_requests")
    .select("created_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    console.error("[deletion-request] pending lookup failed:", error.message);
    return { createdAt: null, error: "Could not record deletion request" };
  }
  return { createdAt: (data as { created_at: string } | null)?.created_at ?? null, error: null };
}

/** Postgres returns "2026-09-14 10:00:00.123+00" style strings; normalise to JS ISO. */
function toIso(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString();
}

async function alertAdmins(
  db: SupabaseClient,
  details: { restaurantId: string; email: string; role: string; reason: string | null }
): Promise<void> {
  try {
    const { data: restaurant } = await db
      .from("restaurants")
      .select("name")
      .eq("id", details.restaurantId)
      .maybeSingle();

    const lines = [
      `🗑️ <b>Account deletion requested</b>`,
      `Restaurant: ${escapeTelegramHtml((restaurant as { name?: string } | null)?.name)}`,
      `Email: ${escapeTelegramHtml(details.email)}`,
      `Role: ${escapeTelegramHtml(details.role)}`,
    ];
    if (details.reason) lines.push(`Reason: ${escapeTelegramHtml(details.reason)}`);

    await sendTelegramAlert(lines.join("\n"));
  } catch (err) {
    console.error("[deletion-request] admin alert failed:", err);
  }
}
