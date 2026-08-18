import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── wacli watchdog ──────────────────────────────────────────────────────────
// Runs every 5 minutes via pg_cron. The wacli bridge depends on a Raspberry Pi
// staying powered, online, and still linked to WhatsApp — none of which this
// system controls. Without a watchdog, any of those failing means merchant
// order alerts stop dead and NOBODY FINDS OUT until a merchant complains about
// a missed order. This function is the thing that finds out.
//
// It alerts by EMAIL (Resend, via the send-email function) on purpose: the
// failure being reported is "WhatsApp delivery is broken", so alerting over
// WhatsApp would be routed through exactly the thing that's down.
//
// Three conditions, any of which is a problem:
//   poller_down  — no claim seen in 10 min. The poller polls every ~10s, so
//                  this means the Pi is off, offline, or the service is dead.
//                  Reported even with an empty queue: knowing the bridge is
//                  down BEFORE an order needs it is the entire point.
//   stuck        — rows sat pending >10 min. Poller may be alive but wacli
//                  itself is failing (session unlinked, WhatsApp logged out).
//   dead_letter  — rows exhausted all retries in the last 24h.
//
// Alerts are deduped to one per 30 minutes so a Pi left off overnight sends a
// handful of emails, not 120. A recovery email fires once when things come
// back, so an all-clear is never ambiguous.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_ENGINE_KEY =
  Deno.env.get("CRON_ENGINE_KEY") ?? SUPABASE_SERVICE_KEY;
// Fallback recipient if platform_settings.admin_alert_email is unset — a
// watchdog that can't reach anyone is not a watchdog.
const FALLBACK_ALERT_EMAIL = Deno.env.get("WACLI_ALERT_EMAIL") ?? "";

const POLLER_SILENT_MINUTES = 10;
const STUCK_MINUTES = 10;
const ALERT_COOLDOWN_MINUTES = 30;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function isAuthorized(req: Request): boolean {
  if (!CRON_ENGINE_KEY) return false;
  return timingSafeEqual(req.headers.get("authorization") ?? "", `Bearer ${CRON_ENGINE_KEY}`);
}

async function resolveRecipient(): Promise<string | null> {
  const { data } = await supabase
    .from("platform_settings")
    .select("admin_alert_email")
    .single();
  return data?.admin_alert_email || FALLBACK_ALERT_EMAIL || null;
}

async function sendAlertEmail(title: string, message: string): Promise<boolean> {
  const to = await resolveRecipient();
  if (!to) {
    console.error("[wacli-health] no admin_alert_email and no WACLI_ALERT_EMAIL — cannot alert");
    return false;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CRON_ENGINE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template: "super-admin-alert",
      to,
      props: { title, message },
    }),
  });

  if (!res.ok) {
    console.error(`[wacli-health] send-email failed: ${res.status} ${await res.text().catch(() => "")}`);
    return false;
  }
  return true;
}

serve(async (req) => {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const pollerCutoff = new Date(now - POLLER_SILENT_MINUTES * 60 * 1000).toISOString();
  const stuckCutoff = new Date(now - STUCK_MINUTES * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const { data: health } = await supabase
    .from("wacli_poller_health")
    .select("last_seen_at, last_alert_at, last_alert_reason")
    .eq("id", true)
    .single();

  const lastSeen = health?.last_seen_at ?? null;
  const pollerDown = !lastSeen || lastSeen < pollerCutoff;

  const { count: stuckCount } = await supabase
    .from("whatsapp_outbox")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("created_at", stuckCutoff);

  const { count: deadCount } = await supabase
    .from("whatsapp_outbox")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("created_at", dayAgo);

  const problems: string[] = [];
  if (pollerDown) {
    problems.push(
      lastSeen
        ? `The wacli poller has not checked in since ${lastSeen} (over ${POLLER_SILENT_MINUTES} minutes ago). The Pi is likely off, offline, or the wacli-poller service has stopped.`
        : `The wacli poller has never checked in. It may not be running yet.`
    );
  }
  if ((stuckCount ?? 0) > 0) {
    problems.push(
      `${stuckCount} merchant order alert(s) have been waiting more than ${STUCK_MINUTES} minutes to send. wacli may be running but unable to deliver — check whether the WhatsApp session is still linked (\`wacli auth\`).`
    );
  }
  if ((deadCount ?? 0) > 0) {
    problems.push(
      `${deadCount} alert(s) gave up after exhausting all retries in the last 24 hours. These merchants were NOT notified of their orders.`
    );
  }

  const healthy = problems.length === 0;
  const lastAlertAt = health?.last_alert_at ?? null;
  const cooledDown =
    !lastAlertAt || lastAlertAt < new Date(now - ALERT_COOLDOWN_MINUTES * 60 * 1000).toISOString();

  // Recovered: we alerted before, and everything is fine now. Send one
  // all-clear and reset, so the next incident alerts immediately.
  if (healthy && lastAlertAt) {
    await sendAlertEmail(
      "WhatsApp order alerts recovered",
      "The wacli bridge is healthy again. The poller is checking in and there is no backlog waiting to send."
    );
    await supabase
      .from("wacli_poller_health")
      .update({ last_alert_at: null, last_alert_reason: null })
      .eq("id", true);
    return new Response(JSON.stringify({ status: "recovered" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (healthy) {
    return new Response(JSON.stringify({ status: "ok", lastSeen }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!cooledDown) {
    return new Response(
      JSON.stringify({ status: "problem", suppressed: true, problems }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const body =
    problems.map((p) => `• ${p}`).join("<br><br>") +
    `<br><br>Merchant order alerts are not reaching WhatsApp while this is unresolved. ` +
    `Customers are unaffected — their SMS notifications go through a separate provider.`;

  const emailed = await sendAlertEmail("WhatsApp order alerts are not sending", body);

  await supabase
    .from("wacli_poller_health")
    .update({
      last_alert_at: new Date().toISOString(),
      last_alert_reason: problems.join(" | ").slice(0, 500),
    })
    .eq("id", true);

  return new Response(
    JSON.stringify({ status: "alerted", emailed, problems }),
    { headers: { "Content-Type": "application/json" } }
  );
});
