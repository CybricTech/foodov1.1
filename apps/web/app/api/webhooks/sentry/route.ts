import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Sentry → Telegram bridge.
 *
 * Sentry has no native Telegram integration, so we receive Sentry's webhook
 * here and forward a formatted message to the alerts Telegram group. Sentry
 * already groups identical errors and rate-limits the alert rule, so one bug
 * hitting many users produces ONE message here, not thousands.
 *
 * Setup (Sentry dashboard):
 *   Settings → Developer Settings → New Internal Integration
 *     - Webhook URL: https://<your-domain>/api/webhooks/sentry
 *     - Alert Rule Action: enabled
 *     - copy the Client Secret → SENTRY_WEBHOOK_SECRET
 *   Then create an Issue Alert (Alerts → Create Alert → Issues) with the action
 *   "Send a notification via <this integration>".
 *
 * Security: Sentry signs the raw body with the integration's client secret
 * (HMAC-SHA256, hex, header `sentry-hook-signature`). We reject mismatches when
 * SENTRY_WEBHOOK_SECRET is set. If it's unset we still process but warn — set it
 * before relying on this in production so the endpoint can't be spammed.
 */

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[sentry-webhook] SENTRY_WEBHOOK_SECRET not set — skipping signature check");
    return true;
  }
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  // Lengths must match for timingSafeEqual; bail early otherwise.
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** Pull the useful fields out of Sentry's (somewhat variable) payload shapes. */
function extract(body: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (body.data ?? {}) as any;
  const event = data.event ?? data.issue ?? {};
  const title: string =
    event.title ?? event.message ?? data.issue?.title ?? "Unknown error";
  const culprit: string | undefined = event.culprit ?? event.transaction;
  const level: string = event.level ?? data.issue?.level ?? "error";
  const environment: string | undefined = event.environment;
  const url: string | undefined =
    event.web_url ?? event.issue_url ?? data.issue?.web_url ?? data.issue?.url;
  return { title, culprit, level, environment, url };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("sentry-hook-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only care about issue/error events; ignore installation pings etc.
  const resource = request.headers.get("sentry-hook-resource");
  if (resource && !["event_alert", "issue", "error", "metric_alert"].includes(resource)) {
    return NextResponse.json({ ok: true, ignored: resource });
  }

  // Same bot + chat as the existing rider alerts (lib/telegram.ts).
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("[sentry-webhook] Telegram token/chat id not configured");
    return NextResponse.json({ ok: true, skipped: "telegram not configured" });
  }

  const { title, culprit, level, environment, url } = extract(body);
  const icon = level === "fatal" || level === "error" ? "🚨" : "⚠️";
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const text =
    `${icon} <b>${escape(level.toUpperCase())}${environment ? ` · ${escape(environment)}` : ""}</b>\n\n` +
    `${escape(title)}\n` +
    (culprit ? `<code>${escape(culprit)}</code>\n` : "") +
    (url ? `\n<a href="${url}">Open in Sentry →</a>` : "");

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    // Never fail the webhook on a Telegram hiccup — Sentry would just retry.
    console.error("[sentry-webhook] Telegram send failed:", err);
  }

  return NextResponse.json({ ok: true });
}
