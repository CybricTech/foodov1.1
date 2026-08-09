import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { sendTelegramAlert, escapeTelegramHtml } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** Bearer == service-role key, length-guarded constant-time compare. */
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type AlertRow = {
  rule: string;
  actor_email: string | null;
  target_email: string | null;
  restaurant_name: string | null;
  detail: Record<string, unknown>;
  event_at: string;
};

/**
 * Formats one row from evaluate_audit_alerts() into a Telegram message.
 * Detection + the atomic "claim so we never alert twice" step both happen in
 * that SQL function (see migration 20260809140000) — this is formatting only.
 */
function formatAlert(a: AlertRow): string {
  const who = a.actor_email ? escapeTelegramHtml(a.actor_email) : "unknown actor";
  const when = new Date(a.event_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos" });

  switch (a.rule) {
    case "privilege_escalation": {
      const roleChange = a.detail.role as { old?: string; new?: string } | undefined;
      const target = a.target_email ? escapeTelegramHtml(a.target_email) : "an account";
      return (
        `🚨 <b>Privilege escalation</b>\n\n` +
        `<b>${who}</b> changed the role on <b>${target}</b> to ` +
        `<b>${escapeTelegramHtml(roleChange?.new ?? "?")}</b>` +
        (roleChange?.old ? ` (was ${escapeTelegramHtml(roleChange.old)})` : "") +
        `\n\nThis did NOT go through a service-role route — it was written directly, ` +
        `the same pattern as the Aug 8 breach.\n<i>${when}</i>`
      );
    }
    case "bank_details_changed": {
      const restaurant = a.restaurant_name ? escapeTelegramHtml(a.restaurant_name) : "a merchant";
      const fields = Object.keys(a.detail).map(escapeTelegramHtml).join(", ");
      return (
        `🚨 <b>Bank details changed outside admin/merchant routes</b>\n\n` +
        `<b>${who}</b> changed <code>${fields}</code> on <b>${restaurant}</b>.\n\n` +
        `This did NOT go through /api/merchant/banking or /api/admin/*/banking.\n<i>${when}</i>`
      );
    }
    case "admin_new_ip_signin": {
      const ip = escapeTelegramHtml(a.detail.ip as string);
      const ua = escapeTelegramHtml((a.detail.user_agent as string) ?? "unknown device");
      return (
        `⚠️ <b>Admin sign-in from a new IP</b>\n\n` +
        `<b>${who}</b> (super_admin) signed in from <code>${ip}</code>, ` +
        `never seen for this account before.\n${ua}\n<i>${when}</i>`
      );
    }
    case "mass_order_deletion": {
      const count = a.detail.count as number;
      return (
        `⚠️ <b>Burst order deletion</b>\n\n` +
        `<b>${who}</b> deleted <b>${count}</b> orders within 20 minutes. ` +
        `Orders are never expected to be hard-deleted — cancellation is a status.` +
        `\n<i>${when}</i>`
      );
    }
    default:
      return `⚠️ <b>${escapeTelegramHtml(a.rule)}</b>\n${escapeTelegramHtml(JSON.stringify(a.detail))}`;
  }
}

/**
 * Polled every 5 minutes by pg_cron via the audit-alerts edge function (mirrors
 * settle-payouts / request-due-riders). Detection and the atomic "alerted_at"
 * claim both live in evaluate_audit_alerts() — see migration
 * 20260809140000_audit_alert_rules.sql for the four rules and why each exists.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("evaluate_audit_alerts");

  if (error) {
    console.error("[audit-alerts] evaluate_audit_alerts failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const alerts = (data ?? []) as AlertRow[];
  let sent = 0;
  for (const alert of alerts) {
    const ok = await sendTelegramAlert(formatAlert(alert));
    if (ok) sent += 1;
  }

  if (alerts.length > 0) {
    console.log(`[audit-alerts] ${alerts.length} matched, ${sent} sent`);
  }

  return NextResponse.json({ ok: true, matched: alerts.length, sent });
}
