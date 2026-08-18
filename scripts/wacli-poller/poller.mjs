#!/usr/bin/env node
// wacli poller — runs on the Pi, next to a paired wacli install.
//
// Polls the wacli-relay Supabase edge function for merchant WhatsApp order
// alerts queued by supabase/functions/send-sms, sends each one through wacli,
// and reports the outcome back. The Pi never holds a Supabase key — only the
// WACLI_RELAY_KEY bearer secret, scoped to this one edge function.
//
// This is a temporary bridge until the platform is on the official Meta
// WhatsApp Business API (Infobip). wacli talks to WhatsApp over the
// unofficial Web protocol (whatsmeow) — that's against WhatsApp's Terms of
// Service and the linked number can get banned for automated business
// messaging. Acceptable for a bridge; don't treat it as the long-term plan.
//
// Setup on the Pi, once:
//   1. wacli auth                        # pair as a linked device (QR scan)
//   2. wacli sync --follow                # keep running (systemd unit below)
//      — sends delegate to this process instead of cold-starting a connection
//   3. export WACLI_RELAY_URL=https://<project-ref>.functions.supabase.co/wacli-relay
//      export WACLI_RELAY_KEY=<same value set as the edge function's secret>
//   4. node scripts/wacli-poller/poller.mjs
//
// See README.md in this folder for the systemd units and how to generate
// WACLI_RELAY_KEY.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const RELAY_URL = process.env.WACLI_RELAY_URL;
const RELAY_KEY = process.env.WACLI_RELAY_KEY;
const WACLI_BIN = process.env.WACLI_BIN ?? "wacli";
const POLL_INTERVAL_MS = Number(process.env.WACLI_POLL_INTERVAL_MS ?? 10_000);
const CLAIM_LIMIT = Number(process.env.WACLI_CLAIM_LIMIT ?? 5);

if (!RELAY_URL || !RELAY_KEY) {
  console.error("WACLI_RELAY_URL and WACLI_RELAY_KEY are required.");
  process.exit(1);
}

let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

async function relay(action, body) {
  const res = await fetch(RELAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RELAY_KEY}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) {
    throw new Error(`relay ${action} failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

async function claimPending() {
  const { rows } = await relay("claim", { limit: CLAIM_LIMIT });
  return rows ?? [];
}

async function reportResult(id, status, extra = {}) {
  await relay("report", { id, status, ...extra });
}

// execFile with an args array — never a shell string — so message content
// (customer name, address, special instructions) can't be interpreted as
// shell syntax no matter what a customer types into an order.
async function sendViaWacli(toNumber, message) {
  const { stdout } = await execFileAsync(WACLI_BIN, [
    "send",
    "text",
    "--to",
    toNumber,
    "--message",
    message,
    "--json",
  ]);
  try {
    return JSON.parse(stdout);
  } catch {
    return {};
  }
}

async function processRow(row) {
  console.log(`[wacli-poller] sending ${row.id} -> ${row.to_number}`);
  try {
    const result = await sendViaWacli(row.to_number, row.message);
    await reportResult(row.id, "sent", { providerRef: result.id ?? result.messageId ?? undefined });
    console.log(`[wacli-poller] sent ${row.id}`);
  } catch (err) {
    console.error(`[wacli-poller] failed ${row.id}:`, err.message ?? err);
    await reportResult(row.id, "failed", { error: String(err.message ?? err).slice(0, 500) }).catch(
      (reportErr) => console.error("[wacli-poller] failed to report failure:", reportErr)
    );
  }
}

async function tick() {
  const rows = await claimPending();
  for (const row of rows) {
    if (stopping) break;
    await processRow(row);
  }
}

async function main() {
  console.log(`[wacli-poller] polling ${RELAY_URL} every ${POLL_INTERVAL_MS}ms`);
  while (!stopping) {
    try {
      await tick();
    } catch (err) {
      console.error("[wacli-poller] tick failed:", err.message ?? err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  console.log("[wacli-poller] stopped");
}

main();
