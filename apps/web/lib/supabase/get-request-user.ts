/**
 * Resolve the authenticated user for a dashboard API request.
 *
 * Supports TWO auth transports without changing existing behavior:
 *   1. Bearer token (mobile app): `Authorization: Bearer <jwt>`. The JWT is
 *      validated against the Supabase Auth server via
 *      `createServiceClient().auth.getUser(jwt)` — the correct supabase-js call
 *      for verifying a passed access token.
 *   2. httpOnly cookies (web): falls back to the existing
 *      `createServerClient().auth.getUser()` cookie session.
 *
 * Returns the authenticated user, or `null` when neither transport yields one
 * (callers should respond 401). This is purely additive: the cookie path is
 * unchanged, and a request with no/invalid Bearer header degrades to it.
 */
import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createServerClient, createServiceClient } from "./server";

export async function getRequestUser(req: NextRequest): Promise<User | null> {
  // 1. Bearer token (mobile). Validate against the Auth server.
  const authHeader = req.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) {
      const service = createServiceClient();
      const {
        data: { user },
      } = await service.auth.getUser(token);
      if (user) return user;
    }
  }

  // 2. Cookie session (web) — existing behavior, untouched.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}
