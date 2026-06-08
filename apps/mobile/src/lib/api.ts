/**
 * Thin client for the web dashboard's Bearer-authenticated API routes.
 *
 * The order-status and rider-dispatch mutations live in apps/web (they touch
 * service-role logic: wallet splits, Telegram alerts, platform-rider locks).
 * Mobile reuses them verbatim — it only needs to attach a Bearer access token
 * (the same Supabase JWT) and point at the web app's origin
 * (`EXPO_PUBLIC_API_BASE_URL`).
 *
 * Every call:
 *   - resolves the live access token from the Supabase session,
 *   - sends `Authorization: Bearer <jwt>` + `Content-Type: application/json`,
 *   - surfaces the API's `{ error }` message (so the platform-rider 403 etc.
 *     reach the UI as readable text).
 */
import { getSupabase } from "./supabase";
import { env } from "./env";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function getAccessToken(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new ApiError("Supabase is not configured", 0);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("Your session has expired. Sign in again.", 401);
  return token;
}

function resolveUrl(path: string): string {
  const base = env.apiBaseUrl;
  if (!base) {
    throw new ApiError(
      "Action endpoint not configured. Set EXPO_PUBLIC_API_BASE_URL.",
      0
    );
  }
  return `${base.replace(/\/$/, "")}${path}`;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = resolveUrl(path);
  const token = await getAccessToken();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!res.ok) {
    throw new ApiError(payload.error || "Request failed", res.status);
  }
  return payload as T;
}

async function apiGet<T>(path: string): Promise<T> {
  const url = resolveUrl(path);
  const token = await getAccessToken();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!res.ok) {
    throw new ApiError(payload.error || "Request failed", res.status);
  }
  return payload as T;
}

/**
 * Shared sender for the mutating verbs the settings/marketing screens need
 * (PATCH the merchant's delivery pricing + location, DELETE the staff account).
 * Identical envelope to `apiPost`: Bearer'd, JSON in/out, `{ error }` surfaced.
 */
async function apiSend<T>(
  method: "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const url = resolveUrl(path);
  const token = await getAccessToken();

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!res.ok) {
    throw new ApiError(payload.error || "Request failed", res.status);
  }
  return payload as T;
}

/** POST /api/dashboard/orders/update-status */
export function updateOrderStatus(
  orderId: string,
  status: string
): Promise<{ success: true }> {
  return apiPost("/api/dashboard/orders/update-status", { orderId, status });
}

/** POST /api/dashboard/orders/dispatch */
export function dispatchOrder(
  orderId: string,
  dispatchType: "platform_rider" | "own_rider"
): Promise<{ ok: true; status: string; dispatch_type?: string }> {
  return apiPost("/api/dashboard/orders/dispatch", {
    order_id: orderId,
    dispatch_type: dispatchType,
  });
}

/** A single line item within a customer's historical order. */
export interface CustomerOrderItem {
  id: string;
  item_name: string;
  quantity: number;
  item_price_kobo: number;
  line_total_kobo: number;
  selected_options: Record<string, string> | null;
}

/** One order in a customer's history (shape returned by the dashboard route). */
export interface CustomerOrder {
  id: string;
  order_number: string;
  status: string;
  fulfillment_type: string;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal_kobo: number;
  vat_kobo: number;
  delivery_fee_kobo: number;
  service_fee_kobo: number;
  total_kobo: number;
  created_at: string;
  delivery_address: string | null;
  special_instructions: string | null;
  payment_status: string;
  order_items: CustomerOrderItem[];
}

/**
 * GET /api/dashboard/customers/[id]/orders — per-customer order history.
 *
 * This read goes through the Bearer'd web route (not direct Supabase) because
 * the route joins on customer phone + scopes to the merchant's restaurant in a
 * single place that web + mobile share. Read-only; no mutations.
 */
export function fetchCustomerOrders(
  customerId: string
): Promise<{ orders: CustomerOrder[] }> {
  return apiGet(`/api/dashboard/customers/${customerId}/orders`);
}

/* ───────────────────────── Settings ─────────────────────────────── */
/*
 * Bank, delivery pricing, location and staff all go through Bearer'd web
 * routes (not direct Supabase) because they run privileged service-client
 * logic — Monnify name-enquiry on banking, and Supabase Auth admin operations
 * on staff (create/delete/reset-password) — that mobile cannot perform itself.
 * Every route re-derives `restaurant_id` from the caller's own profile.
 */

/** The bank details stored on a restaurant (subset returned by the route). */
export interface BankingInfo {
  bank_code: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  monnify_bank_verified_at?: string | null;
  paystack_recipient_code?: string | null;
}

/** GET /api/merchant/banking?restaurantId=… */
export function fetchBanking(restaurantId: string): Promise<BankingInfo> {
  return apiGet(`/api/merchant/banking?restaurantId=${encodeURIComponent(restaurantId)}`);
}

/** POST /api/merchant/banking — verifies via Monnify then saves. */
export function saveBanking(
  restaurantId: string,
  bankCode: string,
  accountNumber: string
): Promise<BankingInfo> {
  return apiPost("/api/merchant/banking", {
    restaurant_id: restaurantId,
    bank_code: bankCode,
    account_number: accountNumber,
  });
}

/** PATCH /api/merchant/delivery-pricing */
export function saveDeliveryPricing(payload: {
  restaurant_base_fee_kobo: number | null;
  restaurant_per_km_rate_kobo: number | null;
  restaurant_max_fee_kobo: number | null;
  max_delivery_radius_km: number | null;
}): Promise<{ success: true }> {
  return apiSend("PATCH", "/api/merchant/delivery-pricing", payload);
}

/** PATCH /api/merchant/location */
export function saveLocation(payload: {
  latitude: number;
  longitude: number;
  max_delivery_radius_km: number | null;
}): Promise<{ success: true }> {
  return apiSend("PATCH", "/api/merchant/location", payload);
}

/* ───────────────────────── Staff ────────────────────────────────── */

/** The single frontline-staff account a restaurant may have. */
export interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
}

/** GET /api/dashboard/staff — the one staff account (or null). */
export function fetchStaff(): Promise<{ staff: StaffUser | null }> {
  return apiGet("/api/dashboard/staff");
}

/** POST /api/dashboard/staff/create */
export function createStaff(payload: {
  email: string;
  password: string;
  fullName: string;
}): Promise<{ success: true }> {
  return apiPost("/api/dashboard/staff/create", payload);
}

/** DELETE /api/dashboard/staff/delete */
export function deleteStaff(): Promise<{ success: true }> {
  return apiSend("DELETE", "/api/dashboard/staff/delete");
}

/** POST /api/dashboard/staff/reset-password */
export function resetStaffPassword(
  newPassword: string
): Promise<{ success: true }> {
  return apiPost("/api/dashboard/staff/reset-password", { newPassword });
}

/* ───────────────────────── Marketing ────────────────────────────── */

/** Result envelope returned by the SMS-campaign route. */
export interface SmsCampaignResult {
  ok: true;
  total: number;
  sent: number;
  failed: number;
}

/** POST /api/dashboard/marketing/sms-campaign */
export function sendSmsCampaign(
  audience: "all" | "inactive_30" | "vip",
  message: string
): Promise<SmsCampaignResult> {
  return apiPost("/api/dashboard/marketing/sms-campaign", { audience, message });
}
