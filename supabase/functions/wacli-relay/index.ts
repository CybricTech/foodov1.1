import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── wacli relay ────────────────────────────────────────────────────────────
// The only thing a Pi running wacli is allowed to touch. It never sees a
// Supabase key — it authenticates with WACLI_RELAY_KEY (a bearer secret
// scoped to this function only, independent of CRON_ENGINE_KEY so it can be
// rotated on its own if the Pi is ever lost or compromised). This function
// holds the service_role key and does the actual whatsapp_outbox reads/
// writes server-side; see the migration for why the table itself grants the
// Pi nothing directly.
//
// Two actions, one POST endpoint:
//   { "action": "claim", "limit"?: number }
//     → up to `limit` (default 5) rows due for delivery, flipped to 'claimed'.
//       Also reclaims rows stuck in 'claimed' for >2 minutes (poller crashed
//       mid-send before reporting back). ALWAYS stamps the liveness
//       heartbeat, including on an empty claim — an idle poller is still a
//       working one, and that distinction is what the watchdog reads.
//   { "action": "report", "id": string, "status": "sent"|"failed",
//     "providerRef"?: string, "error"?: string }
//     → records the outcome on whatsapp_outbox and mirrors it onto the
//       linked sms_logs row so it shows up in the admin SMS Logs screen.
//       A failure is requeued with backoff until MAX_ATTEMPTS.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WACLI_RELAY_KEY = Deno.env.get("WACLI_RELAY_KEY") ?? "";

// After this many failed attempts a row stops retrying and waits for a human.
// The watchdog emails when anything lands here.
const MAX_ATTEMPTS = 5;
// Backoff per attempt number. Deliberately short — a merchant alert that
// arrives 10 minutes late is nearly worthless, so it's better to exhaust
// retries quickly and escalate to email than to trickle for an hour.
const BACKOFF_SECONDS = [30, 60, 120, 300];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function isAuthorized(req: Request): boolean {
  if (!WACLI_RELAY_KEY) return false;
  return timingSafeEqual(req.headers.get("authorization") ?? "", `Bearer ${WACLI_RELAY_KEY}`);
}

interface ClaimRow {
  id: string;
  to_number: string;
  message: string;
}

async function recordHeartbeat(): Promise<void> {
  const { error } = await supabase
    .from("wacli_poller_health")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", true);
  if (error) console.error("[wacli-relay] heartbeat update failed:", error);
}

async function claimPending(limit: number): Promise<ClaimRow[]> {
  const nowIso = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // Due = pending AND (never deferred OR its backoff has elapsed).
  const { data: pendingRows } = await supabase
    .from("whatsapp_outbox")
    .select("id")
    .eq("status", "pending")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  let idsToClaim = (pendingRows ?? []).map((r) => r.id);

  if (idsToClaim.length < limit) {
    const { data: staleRows } = await supabase
      .from("whatsapp_outbox")
      .select("id")
      .eq("status", "claimed")
      .lt("claimed_at", staleCutoff)
      .order("claimed_at", { ascending: true })
      .limit(limit - idsToClaim.length);
    idsToClaim = idsToClaim.concat((staleRows ?? []).map((r) => r.id));
  }

  if (idsToClaim.length === 0) return [];

  const { data: claimed, error } = await supabase
    .from("whatsapp_outbox")
    .update({ status: "claimed", claimed_at: nowIso })
    .in("id", idsToClaim)
    .select("id, to_number, message");

  if (error) {
    console.error("[wacli-relay] claim update failed:", error);
    return [];
  }
  return claimed ?? [];
}

async function reportResult(params: {
  id: string;
  status: "sent" | "failed";
  providerRef?: string;
  error?: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();

  // Read the attempt count first. Safe without locking: a row is only ever
  // reported on by the one poller currently holding its claim, and the
  // stale-reclaim path can't touch it for 2 minutes.
  const { data: current } = await supabase
    .from("whatsapp_outbox")
    .select("attempts, sms_log_id")
    .eq("id", params.id)
    .single();

  const attempts = (current?.attempts ?? 0) + 1;
  const smsLogId = current?.sms_log_id ?? null;

  if (params.status === "sent") {
    await supabase
      .from("whatsapp_outbox")
      .update({
        status: "sent",
        attempts,
        provider_ref: params.providerRef ?? null,
        error: null,
        sent_at: nowIso,
      })
      .eq("id", params.id);

    if (smsLogId) {
      await supabase
        .from("sms_logs")
        .update({ status: "sent", provider_ref: params.providerRef ?? null, sent_at: nowIso })
        .eq("id", smsLogId);
    }
    return;
  }

  // Failure — requeue with backoff while attempts remain.
  const willRetry = attempts < MAX_ATTEMPTS;
  const backoffSec = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];

  await supabase
    .from("whatsapp_outbox")
    .update({
      status: willRetry ? "pending" : "failed",
      attempts,
      error: params.error ?? null,
      next_attempt_at: willRetry
        ? new Date(Date.now() + backoffSec * 1000).toISOString()
        : null,
    })
    .eq("id", params.id);

  // Only mark the visible log failed once we've actually given up, so the SMS
  // Logs screen doesn't flash 'failed' for something still being retried.
  if (smsLogId && !willRetry) {
    await supabase.from("sms_logs").update({ status: "failed" }).eq("id", smsLogId);
  }
}

serve(async (req) => {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (body.action === "claim") {
    const limit = typeof body.limit === "number" ? Math.min(body.limit, 20) : 5;
    await recordHeartbeat();
    const rows = await claimPending(limit);
    return new Response(JSON.stringify({ rows }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (body.action === "report") {
    const { id, status, providerRef, error } = body as {
      id?: string;
      status?: string;
      providerRef?: string;
      error?: string;
    };
    if (!id || (status !== "sent" && status !== "failed")) {
      return new Response(JSON.stringify({ error: "id and status ('sent'|'failed') required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    await reportResult({ id, status, providerRef, error });
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
});
