#!/usr/bin/env node
// Bolt RideBooker sandbox control.
//
// The sandbox is a mocked, isolated instance of the RideBooker API living on
// Bolt's LIVE host. Nothing here books a real ride or spends real money — but
// it speaks the exact same request/response shapes as production, and its
// `control/*` endpoints let us drive a ride through every state on demand.
// That makes the whole booking → webhook → delivered → cost chain testable
// without a driver.
//
// Usage:
//   node scripts/bolt-sandbox.mjs create
//       Creates a sandbox and prints its uuid. Put that in BOLT_SANDBOX_UUID.
//
//   node scripts/bolt-sandbox.mjs state <rideId> <STATE>
//       Forces a ride into a state. Valid states, in order:
//         SEARCHING → DRIVER_ON_ROUTE_TO_CLIENT → ARRIVED_AT_CLIENT
//                   → DRIVING_WITH_CLIENT → COMPLETED
//       (also: CANCELLED)
//       NOTE: "CLIENT" here is the PICKUP point — i.e. the restaurant, not the
//       customer. ARRIVED_AT_CLIENT means the driver is at the kitchen.
//
//   node scripts/bolt-sandbox.mjs ride <rideId>          # fetch ride details
//   node scripts/bolt-sandbox.mjs receipt <rideId>       # fetch receipt (cost)
//   node scripts/bolt-sandbox.mjs destroy [uuid]         # tear down
//
// Credentials are read from apps/web/.env (BOLT_CLIENT_ID / BOLT_CLIENT_SECRET),
// or from the process env if already exported. Secrets are never printed.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = resolve(REPO_ROOT, "apps/web/.env");

const OIDC_TOKEN_URL = "https://oidc.bolt.eu/token";
const OAUTH_SCOPE = "ridebooker:api";
// Must match SANDBOX_BASE in apps/web/lib/bolt.ts.
const SANDBOX_BASE = "https://node.bolt.eu/ride-booker-api-sandbox/reseller";
const VERSION = "v1";

/* ── env ─────────────────────────────────────────────────────────────────── */

/**
 * Minimal .env reader. Deliberately unescapes a leading `\$`: apps/web/.env
 * has to escape `$` as `\$` so Next.js (dotenv-expand) doesn't treat it as a
 * variable reference, but the real secret has a bare `$`. Reading the raw file
 * without this would silently authenticate with the wrong string.
 */
function loadEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value.replace(/\\\$/g, "$");
  }
  return out;
}

const fileEnv = loadEnvFile(ENV_FILE);
const env = (k) => process.env[k] || fileEnv[k];

const CLIENT_ID = env("BOLT_CLIENT_ID");
const CLIENT_SECRET = env("BOLT_CLIENT_SECRET");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    `Missing BOLT_CLIENT_ID / BOLT_CLIENT_SECRET.\n` +
      `Add them to ${ENV_FILE} (or export them), then re-run.\n` +
      `Get them from https://ridebooker.bolt.eu/api → Renew (shown once).`
  );
  process.exit(1);
}

/* ── auth ────────────────────────────────────────────────────────────────── */

async function getToken() {
  const res = await fetch(OIDC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: OAUTH_SCOPE,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`auth ${res.status}: ${text.slice(0, 300)}`);
  }
  const token = JSON.parse(text).access_token;
  if (!token) throw new Error("auth succeeded but returned no access_token");
  return token;
}

/* ── transport ───────────────────────────────────────────────────────────── */

async function call(token, method, path, { uuid, body } = {}) {
  const url = new URL(`${SANDBOX_BASE}/${VERSION}/sandbox/${path}`);
  if (uuid) url.searchParams.set("uuid", uuid);

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  if (!res.ok) {
    // Bolt returns three debugging headers — always quote all three when
    // asking their team about a failure.
    const dbg = ["x-bolt-tracking", "x-bolt-error-code", "x-bolt-error-message"]
      .map((h) => `${h}: ${res.headers.get(h) ?? "—"}`)
      .join("\n  ");
    throw new Error(`${method} ${path} → ${res.status}\n  ${dbg}\n  body: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

/* ── commands ────────────────────────────────────────────────────────────── */

const [cmd, ...args] = process.argv.slice(2);
const UUID = env("BOLT_SANDBOX_UUID");

function requireUuid() {
  if (!UUID) {
    console.error("BOLT_SANDBOX_UUID is not set. Run `create` first, then add it to apps/web/.env.");
    process.exit(1);
  }
  return UUID;
}

const commands = {
  async create() {
    const token = await getToken();
    const out = await call(token, "POST", "control/create");
    console.log(`\n✅ Sandbox created.\n\n   BOLT_SANDBOX_UUID=${out.uuid}\n`);
    console.log(`Add that line to ${ENV_FILE}, then restart the dev server.\n`);
  },

  async state() {
    const [rideId, rideState] = args;
    if (!rideId || !rideState) {
      console.error("Usage: bolt-sandbox.mjs state <rideId> <STATE>");
      process.exit(1);
    }
    const token = await getToken();
    await call(token, "POST", "rides/control/state", {
      uuid: requireUuid(),
      body: { ride_id: Number(rideId), ride_state: rideState },
    });
    console.log(`✅ ride ${rideId} → ${rideState}`);
  },

  async ride() {
    const [rideId] = args;
    if (!rideId) {
      console.error("Usage: bolt-sandbox.mjs ride <rideId>");
      process.exit(1);
    }
    const token = await getToken();
    const url = `rides?ride_id=${encodeURIComponent(rideId)}`;
    console.log(JSON.stringify(await call(token, "GET", url, { uuid: requireUuid() }), null, 2));
  },

  async receipt() {
    const [rideId] = args;
    if (!rideId) {
      console.error("Usage: bolt-sandbox.mjs receipt <rideId>");
      process.exit(1);
    }
    const token = await getToken();
    const url = `rides/receipt?ride_id=${encodeURIComponent(rideId)}`;
    console.log(JSON.stringify(await call(token, "GET", url, { uuid: requireUuid() }), null, 2));
  },

  async destroy() {
    const target = args[0] || requireUuid();
    const token = await getToken();
    await call(token, "POST", "control/destroy", { body: { uuid: target } });
    console.log(`✅ sandbox ${target} destroyed`);
  },
};

if (!cmd || !commands[cmd]) {
  console.error(`Usage: node scripts/bolt-sandbox.mjs <${Object.keys(commands).join("|")}>`);
  process.exit(1);
}

commands[cmd]().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
});
