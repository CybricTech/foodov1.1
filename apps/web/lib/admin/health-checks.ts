import { createServiceClient } from "@/lib/supabase/server";
import { getMonnifyAccessToken } from "@/lib/monnify";
import { getBoltAccessToken } from "@/lib/bolt";

export type ServiceStatus = "healthy" | "degraded" | "down";

export interface ServiceResult {
  name: string;
  key: string;
  group: "internal" | "external";
  status: ServiceStatus;
  latencyMs: number;
  detail?: string;
}

export interface HealthResponse {
  timestamp: string;
  overall: ServiceStatus;
  services: ServiceResult[];
}

const EXTERNAL_TIMEOUT_MS = 8_000;

async function probe(
  name: string,
  key: string,
  group: ServiceResult["group"],
  fn: () => Promise<string | undefined>
): Promise<ServiceResult> {
  const start = Date.now();
  try {
    const detail = await fn();
    const latencyMs = Date.now() - start;
    const status: ServiceStatus =
      latencyMs < 2000 ? "healthy" : latencyMs < 5000 ? "degraded" : "down";
    return { name, key, group, status, latencyMs, detail };
  } catch (err) {
    return {
      name,
      key,
      group,
      status: "down",
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function runHealthChecks(): Promise<HealthResponse> {
  const supabase = createServiceClient();

  const results = await Promise.all([
    // ── Internal: Supabase ─────────────────────────────────────────────────
    probe("Database", "database", "internal", async () => {
      // `estimated` count reads pg_class.reltuples (near-zero cost) instead of
      // scanning the whole table. We only need a liveness/latency signal here,
      // not an exact figure — exact counts every 30s were needless DB load.
      const { count, error } = await supabase
        .from("restaurants")
        .select("id", { count: "estimated", head: true });
      if (error) throw new Error(error.message);
      return `~${count ?? 0} restaurants`;
    }),

    probe("Auth Service", "auth", "internal", async () => {
      const { count, error } = await supabase
        .from("user_profiles")
        .select("id", { count: "estimated", head: true });
      if (error) throw new Error(error.message);
      return `~${count ?? 0} profiles`;
    }),

    probe("Order Processing", "orders", "internal", async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      if (data && data.length > 0) {
        const ago = Math.round(
          (Date.now() - new Date(data[0].created_at).getTime()) / 60000
        );
        return `Last order ${ago}m ago`;
      }
      return "No recent orders";
    }),

    probe("SMS Logs", "sms", "internal", async () => {
      const { data, error } = await supabase
        .from("sms_logs")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      if (data && data.length > 0) {
        const ago = Math.round(
          (Date.now() - new Date(data[0].created_at).getTime()) / 60000
        );
        if (ago > 1440) return `Last SMS ${Math.round(ago / 60)}h ago`;
        return `Last SMS ${ago}m ago`;
      }
      return "No recent SMS";
    }),

    probe("Settlements", "settlements", "internal", async () => {
      const { count, error } = await supabase
        .from("settlements")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "processing"]);
      if (error) throw new Error(error.message);
      return `${count ?? 0} pending`;
    }),

    // ── External: Third-party APIs ────────────────────────────────────────
    probe("Monnify", "monnify", "external", async () => {
      // getMonnifyAccessToken uses a multi-layer cache (memory → DB → fresh auth).
      // A real network call to Monnify happens only when the token expires (~55min).
      // If Monnify is unreachable, this throws and the probe returns "down".
      const token = await getMonnifyAccessToken();
      return token ? "Auth token valid" : undefined;
    }),

    probe("Bolt", "bolt", "external", async () => {
      // Same trick as the Monnify probe: the cached token means this only
      // reaches the network when the token has expired. Skipped entirely when
      // Bolt isn't configured, so unconfigured environments read "healthy"
      // rather than permanently "down".
      if (!process.env.BOLT_CLIENT_ID || !process.env.BOLT_CLIENT_SECRET) {
        return "Not configured";
      }
      const token = await getBoltAccessToken();
      return token ? "Auth token valid" : undefined;
    }),

    probe("Paystack", "paystack", "external", async () => {
      const key = process.env.PAYSTACK_SECRET_KEY;
      if (!key) throw new Error("PAYSTACK_SECRET_KEY not configured");
      const res = await fetch("https://api.paystack.co/transaction?perPage=1", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return "API reachable";
    }),

    probe("Telegram", "telegram", "external", async () => {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.description ?? "Bot token invalid");
      return `@${data.result.username ?? "bot"} online`;
    }),
  ]);

  const anyDown = results.some((s) => s.status === "down");
  const anyDegraded = results.some((s) => s.status === "degraded");
  const overall: ServiceStatus = anyDown
    ? "down"
    : anyDegraded
      ? "degraded"
      : "healthy";

  return {
    timestamp: new Date().toISOString(),
    overall,
    services: results,
  };
}
